"""Citation integrity is deterministic and always runs — verified directly here without
needing the graph or a configured LLM (fact consistency is simply skipped, per plan §7).

These tests explicitly force the fact-check path to raise LLMNotConfigured, rather than
relying on the ambient absence of OLLAMA_API_KEY — a real key may well be present in .env
for other purposes (e.g. manual end-to-end runs), and these tests are about the deterministic
citation-integrity logic in isolation, not whichever LLM happens to be configured at run time."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import LLMNotConfigured
from app.agents.verification import verify_section
from app.models.case import Case, Document
from app.models.draft import Citation, Draft, DraftSection
from app.models.knowledge import KnowledgeChunk
from app.models.tenant import Firm
from app.services.embeddings import embed


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch):
    async def _raise(*args, **kwargs):
        raise LLMNotConfigured("no LLM in this test")

    monkeypatch.setattr("app.agents.verification.call_structured", _raise)


async def _make_case(db_session: AsyncSession) -> tuple[Firm, Case]:
    firm = Firm(name="Test Firm")
    db_session.add(firm)
    await db_session.flush()
    case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="rfe_review")
    db_session.add(case)
    await db_session.flush()
    return firm, case


async def test_unresolved_exhibit_marker_and_unknown_authority_are_blockers(db_session: AsyncSession):
    firm, case = await _make_case(db_session)
    document = Document(
        firm_id=firm.id,
        case_id=case.id,
        s3_key="k1",
        content_type="application/pdf",
        kind="award",
        exhibit_label="EX-1",
        extracted_text="National Excellence Award certificate for Jane Doe, issued 2020.",
    )
    db_session.add(document)
    await db_session.flush()

    draft = Draft(firm_id=firm.id, case_id=case.id, kind="rfe_response", version=1)
    db_session.add(draft)
    await db_session.flush()

    section = DraftSection(
        firm_id=firm.id,
        draft_id=draft.id,
        position=1,
        heading="Awards",
        body="Jane Doe received a national award [EX-1] and another prize [EX-9].",
        criterion_key="eb1a.awards",
        status="generated",
        confidence=0.85,
        verification_notes={},
    )
    db_session.add(section)
    await db_session.flush()

    db_session.add(
        Citation(
            firm_id=firm.id, section_id=section.id, source_type="exhibit",
            document_id=document.id, marker="[EX-1]", verified=False,
        )
    )
    db_session.add(
        Citation(
            firm_id=firm.id, section_id=section.id, source_type="authority",
            authority_ref="8 CFR 204.5(h)(3)(i)", marker="[8 CFR 204.5(h)(3)(i)]", verified=False,
        )
    )
    await db_session.flush()

    await verify_section(db_session, section, case.id)

    assert section.status == "needs_attention"
    blockers = section.verification_notes["blockers"]
    assert any("[EX-9]" in b for b in blockers)
    assert any("8 CFR 204.5(h)(3)(i)" in b for b in blockers)


async def test_clean_section_with_verified_authority_passes(db_session: AsyncSession):
    firm, case = await _make_case(db_session)
    document = Document(
        firm_id=firm.id, case_id=case.id, s3_key="k1", content_type="application/pdf",
        kind="award", exhibit_label="EX-1", extracted_text="Award certificate.",
    )
    db_session.add(document)
    await db_session.flush()

    ref = "8 CFR 204.5(h)(3)(i)"
    db_session.add(
        KnowledgeChunk(
            firm_id=None, kind="authority", criterion_key=None, ref=ref,
            content="Lesser nationally or internationally recognized prizes or awards.",
            embedding=await embed(ref),
        )
    )
    await db_session.flush()

    draft = Draft(firm_id=firm.id, case_id=case.id, kind="rfe_response", version=1)
    db_session.add(draft)
    await db_session.flush()

    section = DraftSection(
        firm_id=firm.id, draft_id=draft.id, position=1, heading="Awards",
        body="Jane Doe received a national award [EX-1].", criterion_key="eb1a.awards",
        status="generated", confidence=0.9, verification_notes={},
    )
    db_session.add(section)
    await db_session.flush()

    db_session.add(
        Citation(firm_id=firm.id, section_id=section.id, source_type="exhibit", document_id=document.id,
                 marker="[EX-1]", verified=False)
    )
    db_session.add(
        Citation(firm_id=firm.id, section_id=section.id, source_type="authority", authority_ref=ref,
                 marker=f"[{ref}]", verified=False)
    )
    await db_session.flush()

    await verify_section(db_session, section, case.id)

    assert section.status == "generated"
    assert section.verification_notes["blockers"] == []


async def test_low_confidence_forces_needs_attention_even_with_no_blockers(db_session: AsyncSession):
    firm, case = await _make_case(db_session)
    draft = Draft(firm_id=firm.id, case_id=case.id, kind="rfe_response", version=1)
    db_session.add(draft)
    await db_session.flush()

    section = DraftSection(
        firm_id=firm.id, draft_id=draft.id, position=1, heading="Awards",
        body="No citations here.", criterion_key="eb1a.awards",
        status="generated", confidence=0.4, verification_notes={},
    )
    db_session.add(section)
    await db_session.flush()

    await verify_section(db_session, section, case.id)

    assert section.status == "needs_attention"
    assert section.verification_notes["blockers"] == []
