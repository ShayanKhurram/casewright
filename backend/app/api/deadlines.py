"""Firm-wide deadlines roll-up (Phase 8, T8.4) — merges cases.filing_deadline and
rfe_notices.response_deadline into one sorted feed. Powers the Calendar page and the Overview's
Deadlines rail (upgraded from filing-only in T8.2 — see docs/internal/PLAN.md's Phase 8 header, deviation #3).
No new table: both source columns already exist."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.case import Case
from app.models.rfe import RFENotice
from app.models.tenant import User
from app.schemas.rollup import DeadlineOut

router = APIRouter(prefix="/deadlines", tags=["rollups"])


@router.get("", response_model=list[DeadlineOut])
async def list_deadlines(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DeadlineOut]:
    filing_result = await db.execute(
        select(Case).where(
            Case.firm_id == current_user.firm_id,
            Case.filing_deadline.is_not(None),
            Case.archived.is_(False),
        )
    )
    deadlines = [
        DeadlineOut(
            case_id=case.id,
            beneficiary_name=case.beneficiary_name,
            kind="filing",
            date=case.filing_deadline,
            source_id=None,
        )
        for case in filing_result.scalars().all()
    ]

    rfe_result = await db.execute(
        select(RFENotice, Case)
        .join(Case, Case.id == RFENotice.case_id)
        .where(
            Case.firm_id == current_user.firm_id,
            RFENotice.response_deadline.is_not(None),
            Case.archived.is_(False),
        )
    )
    for notice, case in rfe_result.all():
        deadlines.append(
            DeadlineOut(
                case_id=case.id,
                beneficiary_name=case.beneficiary_name,
                kind="rfe_response",
                date=notice.response_deadline,
                source_id=notice.id,
            )
        )

    deadlines.sort(key=lambda d: d.date)
    return deadlines
