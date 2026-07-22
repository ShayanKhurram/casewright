"""Draft review: the review unit is the section, not the whole document (plan §8/§9)."""

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_case_scoped, get_current_user, get_section_scoped
from app.db import get_db
from app.models.case import Case
from app.models.draft import Citation, Draft, DraftSection
from app.models.tenant import User
from app.schemas.draft import CitationOut, DraftOut, DraftSectionOut, SectionReviewRequest
from app.services import audit

router = APIRouter(tags=["drafts"])


@router.get("/cases/{case_id}/drafts", response_model=list[DraftOut])
async def list_drafts(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> list[DraftOut]:
    drafts_result = await db.execute(
        select(Draft).where(Draft.case_id == case.id).order_by(Draft.kind, Draft.version.desc())
    )
    drafts = list(drafts_result.scalars().all())
    if not drafts:
        return []

    sections_result = await db.execute(
        select(DraftSection)
        .where(DraftSection.draft_id.in_([d.id for d in drafts]))
        .order_by(DraftSection.position)
    )
    sections = list(sections_result.scalars().all())

    citations_by_section: dict = defaultdict(list)
    if sections:
        citations_result = await db.execute(
            select(Citation).where(Citation.section_id.in_([s.id for s in sections]))
        )
        for citation in citations_result.scalars().all():
            citations_by_section[citation.section_id].append(CitationOut.model_validate(citation))

    sections_by_draft: dict = defaultdict(list)
    for section in sections:
        section_out = DraftSectionOut.model_validate(section)
        section_out.citations = citations_by_section.get(section.id, [])
        sections_by_draft[section.draft_id].append(section_out)

    out = []
    for draft in drafts:
        draft_out = DraftOut.model_validate(draft)
        draft_out.sections = sections_by_draft.get(draft.id, [])
        out.append(draft_out)
    return out


@router.post("/sections/{section_id}/review", response_model=DraftSectionOut)
async def review_section(
    payload: SectionReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    section: DraftSection = Depends(get_section_scoped),
) -> DraftSectionOut:
    section.status = payload.decision
    section.reviewer_comment = payload.comment

    await audit.record(
        db,
        firm_id=section.firm_id,
        actor=f"user:{current_user.email}",
        action="section.reviewed",
        detail={"section_id": str(section.id), "decision": payload.decision},
    )
    await db.flush()
    await db.refresh(section)

    citations_result = await db.execute(select(Citation).where(Citation.section_id == section.id))
    section_out = DraftSectionOut.model_validate(section)
    section_out.citations = [CitationOut.model_validate(c) for c in citations_result.scalars().all()]
    return section_out
