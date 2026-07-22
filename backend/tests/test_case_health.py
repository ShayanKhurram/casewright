"""Case health score (T7.2): a read-time composite of criteria progress, evidence strength,
and verification pass rate. Computed from data that already exists — no agent run, no LLM
call, no new tables. Rides along on the existing GET /cases and GET /cases/{id} responses."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment import CriterionAssessment
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


async def test_fresh_case_has_zero_health_and_no_500(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="fresh@health.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Fresh Case", visa_category="EB-1A", status="intake")
    db_session.add(case)
    await db_session.flush()

    token = await _login(client, "fresh@health.test", "pw-12345678")
    res = await client.get(f"/api/cases/{case.id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text

    body = res.json()
    health = body["health"]
    assert health["score"] == 0
    assert health["criteria_score"] == 0
    assert health["evidence_score"] == 0
    assert health["verification_score"] == 0
    assert health["criteria_met"] == 0
    assert health["criteria_total"] == 0


async def test_criteria_score_matches_formula_for_mixed_verdicts(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="mixed@health.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Mixed Case", visa_category="EB-1A", status="analyzing")
    db_session.add(case)
    await db_session.flush()

    # One met (100), one partial (60), one absent (0) → mean = 160/3 ≈ 53.33 → round = 53.
    rows = [
        CriterionAssessment(
            firm_id=firm.id,
            case_id=case.id,
            criterion_key="eb1a.awards",
            verdict="met",
            confidence=0.9,
            reasoning={},
            evidence_refs=[],
        ),
        CriterionAssessment(
            firm_id=firm.id,
            case_id=case.id,
            criterion_key="eb1a.membership",
            verdict="partial",
            confidence=0.5,
            reasoning={},
            evidence_refs=[],
        ),
        CriterionAssessment(
            firm_id=firm.id,
            case_id=case.id,
            criterion_key="eb1a.judging",
            verdict="absent",
            confidence=0.1,
            reasoning={},
            evidence_refs=[],
        ),
    ]
    db_session.add_all(rows)
    await db_session.flush()

    expected_criteria_score = round((100 + 60 + 0) / 3)

    token = await _login(client, "mixed@health.test", "pw-12345678")
    res = await client.get(f"/api/cases/{case.id}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text

    health = res.json()["health"]
    assert health["criteria_met"] == 1
    assert health["criteria_total"] == 3
    assert health["criteria_score"] == expected_criteria_score