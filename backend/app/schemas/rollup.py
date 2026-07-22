"""Firm-wide read-only roll-ups (Phase 8, T8.4): Clients (grouped over `cases`, no new table —
see docs/internal/PLAN.md's Phase 8 header, deviation #1), Documents (firm-wide, extends the per-case listing
in `documents.py`), and Deadlines (merges `cases.filing_deadline` + `rfe_notices.response_deadline`,
no new table)."""

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.document import DocumentOut


class ClientOut(BaseModel):
    beneficiary_name: str
    case_count: int
    case_ids: list[uuid.UUID]
    most_urgent_status: str
    visa_categories: list[str]


class DocumentWithCaseOut(DocumentOut):
    model_config = ConfigDict(from_attributes=True)

    beneficiary_name: str


class DeadlineOut(BaseModel):
    case_id: uuid.UUID
    beneficiary_name: str
    kind: Literal["filing", "rfe_response"]
    date: date
    source_id: uuid.UUID | None
