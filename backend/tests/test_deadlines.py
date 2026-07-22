"""GET /deadlines (Phase 8, T8.4) — merges cases.filing_deadline + rfe_notices.response_deadline
into one sorted, firm-scoped feed. No new table."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, Document
from app.models.rfe import RFENotice
from app.models.tenant import Firm, User
from app.services.security import hash_password


async def _make_firm_and_user(db_session: AsyncSession, *, email: str, password: str) -> tuple[Firm, User]:
    firm = Firm(name=f"Firm for {email}")
    db_session.add(firm)
    await db_session.flush()
    user = User(firm_id=firm.id, email=email, hashed_password=hash_password(password), role="admin")
    db_session.add(user)
    await db_session.flush()
    return firm, user


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", data={"username": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


async def test_deadlines_merge_filing_and_rfe_sorted_ascending(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="a@deadlines.test", password="pw-12345678")
    today = date.today()

    later_case = Case(
        firm_id=firm.id,
        beneficiary_name="Filing Later",
        visa_category="EB-1A",
        status="ready_to_file",
        filing_deadline=today + timedelta(days=30),
    )
    rfe_case = Case(firm_id=firm.id, beneficiary_name="RFE Sooner", visa_category="O-1A", status="rfe_review")
    db_session.add_all([later_case, rfe_case])
    await db_session.flush()

    document = Document(
        firm_id=firm.id, case_id=rfe_case.id, s3_key="k", content_type="application/pdf", kind="rfe_notice"
    )
    db_session.add(document)
    await db_session.flush()

    notice = RFENotice(
        firm_id=firm.id,
        case_id=rfe_case.id,
        document_id=document.id,
        response_deadline=today + timedelta(days=5),
    )
    db_session.add(notice)
    await db_session.flush()

    token = await _login(client, "a@deadlines.test", "pw-12345678")
    res = await client.get("/api/deadlines", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

    body = res.json()
    assert len(body) == 2
    # RFE deadline (5 days out) must sort before the filing deadline (30 days out).
    assert body[0]["beneficiary_name"] == "RFE Sooner"
    assert body[0]["kind"] == "rfe_response"
    assert body[0]["source_id"] == str(notice.id)
    assert body[1]["beneficiary_name"] == "Filing Later"
    assert body[1]["kind"] == "filing"
    assert body[1]["source_id"] is None


async def test_deadlines_is_firm_scoped(db_session: AsyncSession, client: AsyncClient):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="b@deadlines.test", password="pw-12345678")
    firm_b, _user_b = await _make_firm_and_user(db_session, email="c@deadlines.test", password="pw-12345678")

    db_session.add(
        Case(
            firm_id=firm_a.id,
            beneficiary_name="Firm A Case",
            visa_category="EB-1A",
            status="ready_to_file",
            filing_deadline=date.today() + timedelta(days=10),
        )
    )
    await db_session.flush()

    token_b = await _login(client, "c@deadlines.test", "pw-12345678")
    res = await client.get("/api/deadlines", headers={"Authorization": f"Bearer {token_b}"})

    assert res.status_code == 200
    assert res.json() == [], "firm B must not see firm A's deadlines"
