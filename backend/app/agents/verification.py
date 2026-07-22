"""Runs after drafting, before any human sees output (plan §7). Citation integrity is
deterministic and always runs; fact consistency is LLM-based and is skipped (not faked) when
no API key is configured — a section never gets marked verified based on a check that didn't run."""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import LLMNotConfigured, call_structured
from app.agents.schemas import FactCheckResult
from app.models.case import Document
from app.models.draft import Citation, DraftSection
from app.models.knowledge import KnowledgeChunk

CONFIDENCE_FLOOR = 0.7
EXHIBIT_MARKER_RE = re.compile(r"\[EX-\d+\]")

FACT_CHECK_SYSTEM_PROMPT = """You are a skeptical fact-checker for an immigration RFE response
section. Compare the section's factual claims (names, dates, titles, figures) against the
provided source material. List any claim NOT supported by the source material as a blocker.
List claims that are plausible but not explicitly verifiable as warnings. Do not invent issues
that aren't there — an empty result is a valid result."""


async def verify_section(db: AsyncSession, section: DraftSection, case_id) -> None:
    blockers: list[str] = []
    warnings: list[str] = []

    doc_result = await db.execute(select(Document).where(Document.case_id == case_id))
    documents = list(doc_result.scalars().all())
    exhibit_labels = {d.exhibit_label for d in documents if d.exhibit_label}

    for marker in set(EXHIBIT_MARKER_RE.findall(section.body)):
        label = marker.strip("[]")
        if label not in exhibit_labels:
            blockers.append(f"{marker} does not resolve to an exhibit on this case")

    citation_result = await db.execute(select(Citation).where(Citation.section_id == section.id))
    citations = list(citation_result.scalars().all())
    for citation in citations:
        if citation.source_type == "exhibit":
            if citation.document_id is None or not any(d.id == citation.document_id for d in documents):
                blockers.append(f"citation {citation.marker} has no valid linked exhibit on this case")
                citation.verified = False
                continue
            citation.verified = True
        else:
            ref_result = await db.execute(
                select(KnowledgeChunk).where(KnowledgeChunk.ref == citation.authority_ref)
            )
            if ref_result.scalar_one_or_none() is None:
                blockers.append(
                    f"citation {citation.marker} cites an authority not present in the knowledge corpus: "
                    f"{citation.authority_ref!r}"
                )
                citation.verified = False
            else:
                citation.verified = True

    source_text = "\n\n".join(
        f"[{d.exhibit_label}] {d.extracted_text[:2000]}" for d in documents if d.extracted_text
    )
    if source_text:
        try:
            result = await call_structured(
                tier="fast",
                system=FACT_CHECK_SYSTEM_PROMPT,
                user=f"SECTION:\n{section.body}\n\nSOURCE MATERIAL:\n{source_text}",
                response_model=FactCheckResult,
            )
            blockers.extend(result.blockers)
            warnings.extend(result.warnings)
        except LLMNotConfigured:
            pass

    section.verification_notes = {"blockers": blockers, "warnings": warnings}
    low_confidence = section.confidence is not None and float(section.confidence) < CONFIDENCE_FLOOR
    section.status = "needs_attention" if (blockers or low_confidence) else "generated"
