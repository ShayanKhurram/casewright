"""Read-time composite case health score.

No agent run, no LLM call, no new tables — health is computed from data that already
exists (criterion assessments, documents, draft sections). Three independent `select()`
queries, never one mega-join: each component score is self-contained and cheap to reason
about, and the weights are explicit so the breakdown is never a black-box number.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment import CriterionAssessment
from app.models.case import Document
from app.models.draft import Draft, DraftSection
from app.schemas.assessment import CaseHealthOut

# Per-verdict contribution to the criteria score (plan T7.2).
_VERDICT_VALUE = {"met": 100, "partial": 60, "weak": 25, "absent": 0}


async def compute_case_health(db: AsyncSession, case_id: uuid.UUID) -> CaseHealthOut:
    # 1. Criteria: mean per-verdict value over this case's CriterionAssessment rows.
    crit_rows = (
        await db.execute(
            select(CriterionAssessment).where(CriterionAssessment.case_id == case_id)
        )
    ).scalars().all()
    if crit_rows:
        criteria_score = round(
            sum(_VERDICT_VALUE.get(r.verdict, 0) for r in crit_rows) / len(crit_rows)
        )
        criteria_met = sum(1 for r in crit_rows if r.verdict == "met")
        criteria_total = len(crit_rows)
    else:
        criteria_score = 0
        criteria_met = 0
        criteria_total = 0

    # 2. Evidence: mean classification_confidence (0..1) over documents that have one, *100.
    doc_rows = (
        await db.execute(select(Document).where(Document.case_id == case_id))
    ).scalars().all()
    confidences = [float(d.classification_confidence) for d in doc_rows if d.classification_confidence is not None]
    evidence_score = round((sum(confidences) / len(confidences)) * 100) if confidences else 0

    # 3. Verification: per-section value from verification_notes blockers/warnings keys.
    section_rows = (
        await db.execute(
            select(DraftSection)
            .join(Draft, DraftSection.draft_id == Draft.id)
            .where(Draft.case_id == case_id)
        )
    ).scalars().all()
    section_values: list[int] = []
    for s in section_rows:
        notes = s.verification_notes or {}
        has_blockers = bool(notes.get("blockers"))
        has_warnings = bool(notes.get("warnings"))
        if has_blockers:
            section_values.append(0)
        elif has_warnings:
            section_values.append(60)
        else:
            section_values.append(100)
    verification_score = round(sum(section_values) / len(section_values)) if section_values else 0

    score = round(0.4 * criteria_score + 0.3 * evidence_score + 0.3 * verification_score)

    return CaseHealthOut(
        score=score,
        criteria_score=criteria_score,
        evidence_score=evidence_score,
        verification_score=verification_score,
        criteria_met=criteria_met,
        criteria_total=criteria_total,
    )