"""DELETE /cases/{id} (soft-delete via Case.archived) -- there is no hard delete, see
app/api/cases.py's module docstring for why (audit_log is append-only, blocking even the
UPDATE a cascading FK delete would need). Covers: archiving hides a case from both list_cases
and get_case_scoped (the latter 404s it exactly like a nonexistent case, not just a filtered
list), and the archive itself is firm-scoped like every other case-touching route."""

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


async def test_archiving_a_case_removes_it_from_the_list_and_404s_direct_access(
    db_session: AsyncSession, client: AsyncClient
):
    firm, _user = await _make_firm_and_user(db_session, email="a@archive.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Test Case", visa_category="EB-1A", status="intake")
    db_session.add(case)
    await db_session.flush()
    case_id = case.id

    token = await _login(client, "a@archive.test", "pw-12345678")
    headers = {"Authorization": f"Bearer {token}"}

    before = await client.get("/api/cases", headers=headers)
    assert any(c["id"] == str(case_id) for c in before.json())

    archive_res = await client.delete(f"/api/cases/{case_id}", headers=headers)
    assert archive_res.status_code == 204

    after_list = await client.get("/api/cases", headers=headers)
    assert all(c["id"] != str(case_id) for c in after_list.json())

    after_get = await client.get(f"/api/cases/{case_id}", headers=headers)
    assert after_get.status_code == 404

    # The row itself, and its history, are untouched underneath -- only the archived flag moved.
    await db_session.refresh(case)
    assert case.archived is True
    assert case.beneficiary_name == "Test Case"


async def test_archiving_is_firm_scoped(db_session: AsyncSession, client: AsyncClient):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="b@archive.test", password="pw-12345678")
    firm_b, _user_b = await _make_firm_and_user(db_session, email="c@archive.test", password="pw-12345678")

    case = Case(firm_id=firm_a.id, beneficiary_name="Firm A Case", visa_category="O-1A", status="intake")
    db_session.add(case)
    await db_session.flush()
    case_id = case.id

    token_b = await _login(client, "c@archive.test", "pw-12345678")
    res = await client.delete(f"/api/cases/{case_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert res.status_code == 404, "firm B must not be able to archive firm A's case"

    await db_session.refresh(case)
    assert case.archived is False


async def test_archiving_an_already_archived_case_404s(db_session: AsyncSession, client: AsyncClient):
    firm, _user = await _make_firm_and_user(db_session, email="d@archive.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Test Case", visa_category="EB-1A", status="intake")
    db_session.add(case)
    await db_session.flush()
    case_id = case.id

    token = await _login(client, "d@archive.test", "pw-12345678")
    headers = {"Authorization": f"Bearer {token}"}

    first = await client.delete(f"/api/cases/{case_id}", headers=headers)
    assert first.status_code == 204

    second = await client.delete(f"/api/cases/{case_id}", headers=headers)
    assert second.status_code == 404
