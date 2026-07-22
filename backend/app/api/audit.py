"""Firm-scoped audit-log feed (Phase 8, T8.5). Read-only — writes happen only through
`app.services.audit.record`, which the business endpoints call inside their own session_scope.
This endpoint is what the notification bell and the Overview recent-activity strip read from.

`limit` defaults to 20 and is clamped to 100 so an unbounded query param can't DoS the endpoint
(we clamp rather than 4xx so a client passing a large number still gets a useful response)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db import get_db
from app.models.ops import AuditLog
from app.models.tenant import User
from app.schemas.audit import AuditLogOut

router = APIRouter(prefix="/audit-log", tags=["audit"])

_MAX_LIMIT = 100
_DEFAULT_LIMIT = 20


@router.get("", response_model=list[AuditLogOut])
async def list_audit_log(
    limit: int = Query(_DEFAULT_LIMIT, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AuditLogOut]:
    # Clamp (don't 422) an over-large request: a client passing limit=500 still gets a useful
    # capped-to-100 response rather than an error. `ge=1` rejects only clearly-invalid non-positive
    # values at the validation layer; the clamp below handles the upper bound.
    clamped = min(limit, _MAX_LIMIT)
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.firm_id == current_user.firm_id)
        .order_by(AuditLog.at.desc())
        .limit(clamped)
    )
    rows = result.scalars().all()
    return [AuditLogOut.model_validate(row) for row in rows]