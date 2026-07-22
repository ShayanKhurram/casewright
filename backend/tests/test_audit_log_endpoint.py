"""GET /audit-log (Phase 8, T8.5) — firm-scoped, newest-first, limit-clamped read feed over
`audit_log`. Writes go through `app.services.audit.record` in real endpoints; here we add rows
directly to test isolation/clamping without standing up a full case+run flow. Follows the
fixture/login convention from `test_rollups.py`."""

from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ops import AuditLog
from app.models.tenant import Firm, User
from app.services.security import hash_password


async def _make_firm_and_user(
    db_session: AsyncSession, *, email: str, password: str
) -> tuple[Firm, User]:
    firm = Firm(name=f"Firm for {email}")
    db_session.add(firm)
    await db_session.flush()
    user = User(
        firm_id=firm.id, email=email, hashed_password=hash_password(password), role="admin"
    )
    db_session.add(user)
    await db_session.flush()
    return firm, user


async def _login(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", data={"username": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


async def test_audit_log_is_firm_scoped_and_newest_first(
    db_session: AsyncSession, client: AsyncClient
):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="a@audit.test", password="pw-12345678")
    firm_b, _user_b = await _make_firm_and_user(db_session, email="b@audit.test", password="pw-12345678")

    db_session.add(
        AuditLog(
            firm_id=firm_a.id,
            actor="user:a@audit.test",
            action="case.created",
            at=datetime(2026, 7, 22, 9, 0, tzinfo=UTC),
            detail={"beneficiary_name": "Dr. Chen", "visa_category": "EB-1A"},
        )
    )
    db_session.add(
        AuditLog(
            firm_id=firm_a.id,
            actor="agent:intake",
            action="petition.intake",
            at=datetime(2026, 7, 22, 10, 0, tzinfo=UTC),
            detail={"k": "a2"},
        )
    )
    # Firm B's row must never surface for firm A.
    db_session.add(
        AuditLog(
            firm_id=firm_b.id,
            actor="user:b@audit.test",
            action="case.created",
            at=datetime(2026, 7, 22, 10, 30, tzinfo=UTC),
            detail={"k": "b1"},
        )
    )
    await db_session.flush()

    token_a = await _login(client, "a@audit.test", "pw-12345678")
    res = await client.get("/api/audit-log", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200

    rows = res.json()
    assert len(rows) == 2, "firm A must not see firm B's audit rows"
    assert {r["action"] for r in rows} == {"case.created", "petition.intake"}
    # Newest first: the 10:00 row precedes the 09:00 row.
    assert rows[0]["action"] == "petition.intake"
    assert rows[1]["action"] == "case.created"
    # Schema fields present and shaped.
    assert rows[0]["detail"] == {"k": "a2"}
    assert rows[0]["case_id"] is None
    assert "id" in rows[0] and "at" in rows[0] and "actor" in rows[0]


async def test_audit_log_limit_clamping(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="c@audit.test", password="pw-12345678")
    # Seed more than the cap so clamping is observable.
    for i in range(5):
        db_session.add(
            AuditLog(
                firm_id=firm.id, actor="user:c@audit.test", action="case.created", detail={"i": i}
            )
        )
    await db_session.flush()

    token = await _login(client, "c@audit.test", "pw-12345678")

    # Default limit (20) returns all 5 here.
    res_default = await client.get("/api/audit-log", headers={"Authorization": f"Bearer {token}"})
    assert res_default.status_code == 200
    assert len(res_default.json()) == 5

    # Explicit small limit returns that many.
    res_two = await client.get(
        "/api/audit-log?limit=2", headers={"Authorization": f"Bearer {token}"}
    )
    assert res_two.status_code == 200
    assert len(res_two.json()) == 2

    # An over-large request is clamped to 100, not 422 — and returns the available 5.
    res_huge = await client.get(
        "/api/audit-log?limit=5000", headers={"Authorization": f"Bearer {token}"}
    )
    assert res_huge.status_code == 200
    assert len(res_huge.json()) == 5