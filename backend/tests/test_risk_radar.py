"""RFE Risk Radar (T7.3): a deterministic per-criterion RFE-risk score derived from
already-persisted CriterionAssessment rows — no LLM call, no new agent run. The two
acceptance criteria exercised here: (1) a case with no criteria assessed yet returns 404,
and (2) at a fixed confidence, risk_score is strictly increasing across the verdict ladder
met < partial < weak < absent (the "risk ordering" guarantee)."""

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


async def test_risk_radar_404_when_no_criteria_assessed(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="empty@risk.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Empty Case", visa_category="EB-1A", status="intake")
    db_session.add(case)
    await db_session.flush()

    token = await _login(client, "empty@risk.test", "pw-12345678")
    res = await client.get(f"/api/cases/{case.id}/risk-radar", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 404, res.text
    assert res.json()["detail"] == "No criteria assessed yet for this case"


async def test_risk_scores_strictly_increase_across_verdict_ladder(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="ladder@risk.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Ladder Case", visa_category="EB-1A", status="analyzing")
    db_session.add(case)
    await db_session.flush()

    # Same confidence across all four verdicts so the only varying input is the verdict.
    confidence = 0.8
    rows = [
        CriterionAssessment(
            firm_id=firm.id,
            case_id=case.id,
            criterion_key=f"eb1a.{v}",
            verdict=v,
            confidence=confidence,
            reasoning={},
            evidence_refs=[],
        )
        for v in ("met", "partial", "weak", "absent")
    ]
    db_session.add_all(rows)
    await db_session.flush()

    token = await _login(client, "ladder@risk.test", "pw-12345678")
    res = await client.get(f"/api/cases/{case.id}/risk-radar", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text

    body = res.json()
    by_verdict = {c["criterion_key"].split(".", 1)[1]: c["risk_score"] for c in body["criteria"]}
    # The acceptance criterion: risk_score strictly increases met < partial < weak < absent.
    assert by_verdict["met"] < by_verdict["partial"] < by_verdict["weak"] < by_verdict["absent"], by_verdict