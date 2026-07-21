"""Login must not distinguish unknown-user from wrong-password (no account enumeration)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Firm, User
from app.services.security import hash_password


async def _seed_user(db_session: AsyncSession) -> None:
    firm = Firm(name="Test Firm")
    db_session.add(firm)
    await db_session.flush()
    db_session.add(
        User(
            firm_id=firm.id,
            email="jane@example.test",
            hashed_password=hash_password("correct-horse-battery"),
            role="partner",
        )
    )
    await db_session.flush()


async def test_login_succeeds_with_correct_credentials(db_session: AsyncSession, client: AsyncClient):
    await _seed_user(db_session)
    res = await client.post(
        "/api/auth/login", data={"username": "jane@example.test", "password": "correct-horse-battery"}
    )
    assert res.status_code == 200
    assert res.json()["token_type"] == "bearer"
    assert res.json()["access_token"]


async def test_login_rejects_wrong_password_and_unknown_user_identically(
    db_session: AsyncSession, client: AsyncClient
):
    await _seed_user(db_session)

    wrong_password = await client.post(
        "/api/auth/login", data={"username": "jane@example.test", "password": "not-the-password"}
    )
    unknown_user = await client.post(
        "/api/auth/login", data={"username": "nobody@example.test", "password": "whatever"}
    )

    assert wrong_password.status_code == 401
    assert unknown_user.status_code == 401
    assert wrong_password.json()["detail"] == unknown_user.json()["detail"]


async def test_me_requires_valid_token(client: AsyncClient):
    res = await client.get("/api/auth/me")
    assert res.status_code == 401

    res = await client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert res.status_code == 401
