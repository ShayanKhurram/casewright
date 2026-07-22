"""Document upload: exhibit-label sequencing, native PDF text extraction, and tenancy on the
presigned-URL route. Storage (S3/MinIO) is mocked so this suite doesn't need MinIO running."""

import pymupdf
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Firm, User
from app.services.security import hash_password


def _make_pdf_bytes(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return bytes(data)


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


def _mock_storage(monkeypatch) -> None:
    async def _noop(*args, **kwargs):
        return None

    async def _fake_presigned_url(key: str, expires_in: int = 3600) -> str:
        return f"https://example-storage.test/{key}"

    monkeypatch.setattr("app.api.documents.storage.ensure_bucket", _noop)
    monkeypatch.setattr("app.api.documents.storage.upload_bytes", _noop)
    monkeypatch.setattr("app.api.documents.storage.presigned_url", _fake_presigned_url)


async def test_upload_assigns_sequential_exhibit_labels_and_extracts_text(
    db_session: AsyncSession, client: AsyncClient, monkeypatch
):
    _mock_storage(monkeypatch)
    _firm, _user = await _make_firm_and_user(db_session, email="a@firm.test", password="pw-12345678")
    token = await _login(client, "a@firm.test", "pw-12345678")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = await client.post(
        "/api/cases", headers=headers, json={"beneficiary_name": "Jane Doe", "visa_category": "EB-1A"}
    )
    case_id = case_res.json()["id"]

    pdf_bytes = _make_pdf_bytes("This is a sufficiently long line of extractable native PDF text.")

    first = await client.post(
        f"/api/cases/{case_id}/documents",
        headers=headers,
        data={"kind": "award"},
        files={"file": ("award.pdf", pdf_bytes, "application/pdf")},
    )
    assert first.status_code == 201, first.text
    assert first.json()["exhibit_label"] == "EX-1"
    assert first.json()["page_count"] == 1
    assert first.json()["classification_confidence"] == 1.0

    second = await client.post(
        f"/api/cases/{case_id}/documents",
        headers=headers,
        data={"kind": "cv"},
        files={"file": ("cv.pdf", pdf_bytes, "application/pdf")},
    )
    assert second.status_code == 201, second.text
    assert second.json()["exhibit_label"] == "EX-2"

    listed = await client.get(f"/api/cases/{case_id}/documents", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 2


async def test_upload_rejects_unknown_kind(db_session: AsyncSession, client: AsyncClient, monkeypatch):
    _mock_storage(monkeypatch)
    _firm, _user = await _make_firm_and_user(db_session, email="b@firm.test", password="pw-12345678")
    token = await _login(client, "b@firm.test", "pw-12345678")
    headers = {"Authorization": f"Bearer {token}"}

    case_res = await client.post(
        "/api/cases", headers=headers, json={"beneficiary_name": "Jane Doe", "visa_category": "O-1A"}
    )
    case_id = case_res.json()["id"]

    res = await client.post(
        f"/api/cases/{case_id}/documents",
        headers=headers,
        data={"kind": "not_a_real_kind"},
        files={"file": ("x.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert res.status_code == 422


async def test_document_url_is_tenant_scoped(db_session: AsyncSession, client: AsyncClient, monkeypatch):
    _mock_storage(monkeypatch)
    _firm_a, _user_a = await _make_firm_and_user(db_session, email="c@firm-c.test", password="pw-12345678")
    _firm_b, _user_b = await _make_firm_and_user(db_session, email="d@firm-d.test", password="pw-12345678")
    token_a = await _login(client, "c@firm-c.test", "pw-12345678")
    token_b = await _login(client, "d@firm-d.test", "pw-12345678")

    case_res = await client.post(
        "/api/cases",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"beneficiary_name": "Jane Doe", "visa_category": "O-1A"},
    )
    case_id = case_res.json()["id"]

    upload_res = await client.post(
        f"/api/cases/{case_id}/documents",
        headers={"Authorization": f"Bearer {token_a}"},
        data={"kind": "cv"},
        files={"file": ("cv.pdf", b"%PDF-1.4", "application/pdf")},
    )
    document_id = upload_res.json()["id"]

    own_url = await client.get(
        f"/api/cases/{case_id}/documents/{document_id}/url", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert own_url.status_code == 200

    cross_tenant = await client.get(
        f"/api/cases/{case_id}/documents/{document_id}/url", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert cross_tenant.status_code == 404


async def test_firmwide_documents_are_tenant_scoped_and_filterable(
    db_session: AsyncSession, client: AsyncClient, monkeypatch
):
    """GET /documents (Phase 8, T8.4) — firm-wide, unlike every other document route which is
    scoped under a single case."""
    _mock_storage(monkeypatch)
    _firm_a, _user_a = await _make_firm_and_user(db_session, email="e@firm-e.test", password="pw-12345678")
    _firm_b, _user_b = await _make_firm_and_user(db_session, email="f@firm-f.test", password="pw-12345678")
    token_a = await _login(client, "e@firm-e.test", "pw-12345678")
    token_b = await _login(client, "f@firm-f.test", "pw-12345678")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    case_res = await client.post(
        "/api/cases", headers=headers_a, json={"beneficiary_name": "Ada Lovelace", "visa_category": "EB-1A"}
    )
    case_id = case_res.json()["id"]

    await client.post(
        f"/api/cases/{case_id}/documents",
        headers=headers_a,
        data={"kind": "cv"},
        files={"file": ("cv.pdf", b"%PDF-1.4", "application/pdf")},
    )
    await client.post(
        f"/api/cases/{case_id}/documents",
        headers=headers_a,
        data={"kind": "award"},
        files={"file": ("award.pdf", b"%PDF-1.4", "application/pdf")},
    )

    all_docs = await client.get("/api/documents", headers=headers_a)
    assert all_docs.status_code == 200
    assert len(all_docs.json()) == 2
    assert {d["beneficiary_name"] for d in all_docs.json()} == {"Ada Lovelace"}

    kind_filtered = await client.get("/api/documents?kind=award", headers=headers_a)
    assert kind_filtered.status_code == 200
    assert len(kind_filtered.json()) == 1
    assert kind_filtered.json()[0]["kind"] == "award"

    cross_tenant = await client.get("/api/documents", headers={"Authorization": f"Bearer {token_b}"})
    assert cross_tenant.status_code == 200
    assert cross_tenant.json() == [], "firm B must not see firm A's documents"
