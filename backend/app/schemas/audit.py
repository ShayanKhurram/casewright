"""Audit-log read schema (Phase 8, T8.5). Mirrors `AuditLog`'s columns
(`backend/app/models/ops.py`) — `id, at, actor, action, case_id, detail` — for the firm-scoped
`GET /audit-log` feed that powers the notification bell and the Overview recent-activity strip.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    at: datetime
    actor: str
    action: str
    case_id: uuid.UUID | None
    detail: dict[str, Any]