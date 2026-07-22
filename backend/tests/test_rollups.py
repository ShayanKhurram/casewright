"""GET /clients (Phase 8, T8.4) — a computed roll-up over cases.beneficiary_name, not a real
table (see docs/internal/PLAN.md's Phase 8 header, deviation #1). Covers grouping counts, the most-urgent-
status priority (review > active > closed), and firm isolation."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
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


async def test_clients_grouping_and_most_urgent_status(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="a@rollups.test", password="pw-12345678")

    # Two cases for the same beneficiary: one closed, one needs-review — most urgent must win.
    db_session.add(
        Case(firm_id=firm.id, beneficiary_name="Dr. Chen", visa_category="EB-1A", status="filed")
    )
    db_session.add(
        Case(firm_id=firm.id, beneficiary_name="Dr. Chen", visa_category="EB-1A", status="strategy_review")
    )
    # A single-case beneficiary in a plain "active" state.
    db_session.add(
        Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="O-1A", status="analyzing")
    )
    await db_session.flush()

    token = await _login(client, "a@rollups.test", "pw-12345678")
    res = await client.get("/api/clients", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200

    by_name = {c["beneficiary_name"]: c for c in res.json()}
    assert by_name["Dr. Chen"]["case_count"] == 2
    assert by_name["Dr. Chen"]["most_urgent_status"] == "strategy_review"
    assert by_name["Jane Doe"]["case_count"] == 1
    assert by_name["Jane Doe"]["most_urgent_status"] == "analyzing"


async def test_clients_is_firm_scoped(db_session: AsyncSession, client: AsyncClient):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="b@rollups.test", password="pw-12345678")
    firm_b, _user_b = await _make_firm_and_user(db_session, email="c@rollups.test", password="pw-12345678")

    db_session.add(Case(firm_id=firm_a.id, beneficiary_name="Firm A Client", visa_category="EB-1A", status="intake"))
    await db_session.flush()

    token_b = await _login(client, "c@rollups.test", "pw-12345678")
    res = await client.get("/api/clients", headers={"Authorization": f"Bearer {token_b}"})

    assert res.status_code == 200
    assert res.json() == [], "firm B must not see firm A's clients"
