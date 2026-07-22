"""Grounded Q&A endpoint (plan §7): a per-case chat whose answers come only from that case's
extracted facts. Three things matter enough to pin with tests — the no-facts short-circuit
must NOT call the model, citations must resolve back to the real fact/document, and the
existing get_case_scoped tenancy guard still 404s a cross-tenant caller."""

from datetime import datetime, timedelta, timezone

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import qa as qa_module
from app.models.case import Case, Document, ExtractedFact
from app.models.tenant import Firm, User
from app.schemas.qa import QAModelOutput
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


async def _seed_document(db_session: AsyncSession, firm: Firm, case: Case, *, label: str) -> Document:
    doc = Document(
        firm_id=firm.id,
        case_id=case.id,
        s3_key=f"k-{label}",
        content_type="application/pdf",
        kind="award",
        exhibit_label=label,
        extracted_text="Award text.",
    )
    db_session.add(doc)
    await db_session.flush()
    return doc


async def test_qa_returns_no_facts_message_and_never_calls_model(
    db_session: AsyncSession, client: AsyncClient, monkeypatch
):
    firm, _user = await _make_firm_and_user(db_session, email="a@qa.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="intake")
    db_session.add(case)
    await db_session.flush()

    def _fail(*args, **kwargs):
        raise AssertionError("call_structured must not be invoked when there are no facts")

    monkeypatch.setattr(qa_module, "call_structured", _fail)

    token = await _login(client, "a@qa.test", "pw-12345678")
    res = await client.post(
        f"/api/cases/{case.id}/qa",
        json={"question": "What awards does she have?"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["grounded"] is False
    assert body["citations"] == []
    assert "No extracted facts" in body["answer"]


async def test_qa_returns_grounded_answer_with_resolved_citations(
    db_session: AsyncSession, client: AsyncClient, monkeypatch
):
    firm, _user = await _make_firm_and_user(db_session, email="b@qa.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="analyzing")
    db_session.add(case)
    await db_session.flush()

    doc = await _seed_document(db_session, firm, case, label="EX-1")
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    fact_a = ExtractedFact(
        firm_id=firm.id,
        case_id=case.id,
        fact_type="award",
        payload={"name": "National Excellence Award"},
        source_document_id=doc.id,
        source_page=1,
        source_quote="National Excellence Award",
        created_at=base,
    )
    db_session.add(fact_a)
    doc2 = await _seed_document(db_session, firm, case, label="EX-2")
    fact_b = ExtractedFact(
        firm_id=firm.id,
        case_id=case.id,
        fact_type="education",
        payload={"degree": "PhD"},
        source_document_id=doc2.id,
        source_page=2,
        source_quote="PhD, Example University",
        created_at=base + timedelta(seconds=1),
    )
    db_session.add(fact_b)
    await db_session.flush()

    canned = QAModelOutput(answer="She won the National Excellence Award.", found=True, cited_fact_indices=[0])

    async def _fake(*, tier, system, user, response_model, max_tokens=4096):
        assert response_model is QAModelOutput
        assert "QUESTION:" in user
        assert tier == "reasoning"
        return canned

    monkeypatch.setattr(qa_module, "call_structured", _fake)

    token = await _login(client, "b@qa.test", "pw-12345678")
    res = await client.post(
        f"/api/cases/{case.id}/qa",
        json={"question": "What awards does she have?"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["grounded"] is True
    assert body["answer"] == "She won the National Excellence Award."
    assert len(body["citations"]) == 1
    cite = body["citations"][0]
    assert cite["fact_id"] == str(fact_a.id)
    assert cite["document_id"] == str(doc.id)
    assert cite["exhibit_label"] == "EX-1"
    assert cite["source_page"] == 1
    assert cite["source_quote"] == "National Excellence Award"


async def test_qa_out_of_range_indices_are_silently_dropped(
    db_session: AsyncSession, client: AsyncClient, monkeypatch
):
    firm, _user = await _make_firm_and_user(db_session, email="c@qa.test", password="pw-12345678")
    case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="analyzing")
    db_session.add(case)
    await db_session.flush()

    doc = await _seed_document(db_session, firm, case, label="EX-1")
    db_session.add(
        ExtractedFact(
            firm_id=firm.id,
            case_id=case.id,
            fact_type="award",
            payload={"name": "Award"},
            source_document_id=doc.id,
            source_page=1,
            source_quote="Award",
        )
    )
    await db_session.flush()

    canned = QAModelOutput(
        answer="ok",
        found=True,
        cited_fact_indices=[0, 5, -1],  # only 0 is in range
    )

    async def _fake(*, tier, system, user, response_model, max_tokens=4096):
        return canned

    monkeypatch.setattr(qa_module, "call_structured", _fake)

    token = await _login(client, "c@qa.test", "pw-12345678")
    res = await client.post(
        f"/api/cases/{case.id}/qa",
        json={"question": "anything"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert res.status_code == 200, res.text
    assert len(res.json()["citations"]) == 1


async def test_qa_is_firm_scoped(db_session: AsyncSession, client: AsyncClient, monkeypatch):
    firm_a, _user_a = await _make_firm_and_user(db_session, email="d@qa.test", password="pw-12345678")
    firm_b, _user_b = await _make_firm_and_user(db_session, email="e@qa.test", password="pw-12345678")

    case_a = Case(firm_id=firm_a.id, beneficiary_name="Firm A Case", visa_category="EB-1A", status="analyzing")
    db_session.add(case_a)
    await db_session.flush()

    def _fail(*args, **kwargs):
        raise AssertionError("model must not be called for a 404 path")

    monkeypatch.setattr(qa_module, "call_structured", _fail)

    token_b = await _login(client, "e@qa.test", "pw-12345678")
    res = await client.post(
        f"/api/cases/{case_a.id}/qa",
        json={"question": "anything"},
        headers={"Authorization": f"Bearer {token_b}"},
    )

    assert res.status_code == 404