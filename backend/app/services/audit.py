"""Append audit_log rows. Never call session.commit() here — the caller's session_scope does that,
so an audit entry lands atomically with the business change it's recording."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ops import AuditLog


async def record(
    db: AsyncSession,
    *,
    firm_id: uuid.UUID,
    actor: str,
    action: str,
    case_id: uuid.UUID | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            firm_id=firm_id,
            actor=actor,
            action=action,
            case_id=case_id,
            detail=detail or {},
        )
    )
    await db.flush()
