"""Firm-wide Clients roll-up (Phase 8, T8.4). Clients aren't a real entity in this data model —
just a grouping of `cases` by `beneficiary_name` (see docs/internal/PLAN.md's Phase 8 header, deviation #1:
no new `clients` table, since nothing here creates/edits one). Grouped in Python, not SQL
`GROUP BY`, because `most_urgent_status` needs the same three-tier priority
`frontend/src/lib/caseGroups.ts`'s `groupOf` uses on the client — the two are independently
hand-maintained and must be kept in sync by hand if this grouping ever changes."""

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.case import Case
from app.models.tenant import User
from app.schemas.rollup import ClientOut

router = APIRouter(prefix="/clients", tags=["rollups"])

_NEEDS_REVIEW = {"strategy_review", "draft_review", "rfe_review"}
_CLOSED = {"filed", "approved", "denied"}


def _status_priority(status: str) -> int:
    """Mirrors frontend/src/lib/caseGroups.ts's groupOf: review > active > closed."""
    if status in _NEEDS_REVIEW:
        return 2
    if status in _CLOSED:
        return 0
    return 1


@router.get("", response_model=list[ClientOut])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ClientOut]:
    result = await db.execute(select(Case).where(Case.firm_id == current_user.firm_id))
    cases = list(result.scalars().all())

    by_name: dict[str, list[Case]] = defaultdict(list)
    for case in cases:
        by_name[case.beneficiary_name].append(case)

    clients = []
    for beneficiary_name, group in by_name.items():
        most_urgent = max(group, key=lambda c: _status_priority(c.status))
        clients.append(
            ClientOut(
                beneficiary_name=beneficiary_name,
                case_count=len(group),
                case_ids=[c.id for c in group],
                most_urgent_status=most_urgent.status,
                visa_categories=sorted({c.visa_category for c in group}),
            )
        )
    clients.sort(key=lambda c: c.case_count, reverse=True)
    return clients
