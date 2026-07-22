"""GET /runs/active powers the topbar's RunIndicator — firm-wide, not case-scoped, so its
tenancy discipline is worth its own test (same non-negotiable standard as everywhere else)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.models.ops import AgentRun
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


async def test_active_runs_only_shows_running_and_waiting_review(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="a@active-runs.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="analyzing")
    db_session.add(case)
    await db_session.flush()

    db_session.add(AgentRun(firm_id=firm.id, case_id=case.id, graph="petition", thread_id="t1", status="running"))
    db_session.add(
        AgentRun(firm_id=firm.id, case_id=case.id, graph="rfe", thread_id="t2", status="waiting_review")
    )
    db_session.add(AgentRun(firm_id=firm.id, case_id=case.id, graph="petition", thread_id="t3", status="completed"))
    db_session.add(AgentRun(firm_id=firm.id, case_id=case.id, graph="petition", thread_id="t4", status="failed"))
    await db_session.flush()

    token = await _login(client, "a@active-runs.test", "pw-12345678")
    res = await client.get("/api/runs/active", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 200
    statuses = {r["status"] for r in res.json()}
    assert statuses == {"running", "waiting_review"}
    assert all(r["beneficiary_name"] == "Jane Doe" for r in res.json())


async def test_active_runs_is_firm_scoped(db_session: AsyncSession, client: AsyncClient):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="b@active-runs.test", password="pw-12345678")
    firm_b, _user_b = await _make_firm_and_user(db_session, email="c@active-runs.test", password="pw-12345678")

    case_a = Case(firm_id=firm_a.id, beneficiary_name="Firm A Case", visa_category="EB-1A", status="analyzing")
    db_session.add(case_a)
    await db_session.flush()
    db_session.add(AgentRun(firm_id=firm_a.id, case_id=case_a.id, graph="petition", thread_id="ta", status="running"))
    await db_session.flush()

    token_b = await _login(client, "c@active-runs.test", "pw-12345678")
    res = await client.get("/api/runs/active", headers={"Authorization": f"Bearer {token_b}"})

    assert res.status_code == 200
    assert res.json() == [], "firm B must not see firm A's active runs"
