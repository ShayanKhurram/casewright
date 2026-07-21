"""The cross-firm access test is non-negotiable (plan §13): firm B must never be able to read
firm A's case, whether by direct id or by list."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.models.tenant import Firm, User
from app.services.security import hash_password


async def _make_firm_and_user(db_session: AsyncSession, *, email: str, password: str) -> tuple[Firm, User]:
    firm = Firm(name=f"Firm for {email}")
    db_session.add(firm)
    await db_session.flush()

    user = User(
        firm_id=firm.id,
        email=email,
        hashed_password=hash_password(password),
        role="admin",
    )
    db_session.add(user)
    await db_session.flush()
    return firm, user


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", data={"username": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


async def test_cross_firm_case_access_is_blocked(db_session: AsyncSession, client: AsyncClient):
    firm_a, user_a = await _make_firm_and_user(db_session, email="a@firm-a.test", password="pw-a-12345")
    _firm_b, user_b = await _make_firm_and_user(db_session, email="b@firm-b.test", password="pw-b-12345")

    case = Case(
        firm_id=firm_a.id,
        beneficiary_name="Ada Lovelace",
        visa_category="O-1A",
        status="intake",
    )
    db_session.add(case)
    await db_session.flush()

    token_b = await _login(client, "b@firm-b.test", "pw-b-12345")

    res = await client.get(
        f"/api/cases/{case.id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res.status_code == 404

    res = await client.get("/api/cases", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 200
    assert all(c["id"] != str(case.id) for c in res.json())

    token_a = await _login(client, "a@firm-a.test", "pw-a-12345")
    res = await client.get(
        f"/api/cases/{case.id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res.status_code == 200
    assert res.json()["beneficiary_name"] == "Ada Lovelace"


async def test_case_created_via_api_is_scoped_to_caller_firm(db_session: AsyncSession, client: AsyncClient):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="c@firm-c.test", password="pw-c-12345")
    token = await _login(client, "c@firm-c.test", "pw-c-12345")

    res = await client.post(
        "/api/cases",
        headers={"Authorization": f"Bearer {token}"},
        json={"beneficiary_name": "Grace Hopper", "visa_category": "EB-1A"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["firm_id"] == str(firm_a.id)
