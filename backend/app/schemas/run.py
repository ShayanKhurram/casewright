import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class StartRFERunRequest(BaseModel):
    document_id: uuid.UUID


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    graph: str
    status: str
    current_gate: str | None
    gate_payload: dict
    error: str | None
    created_at: datetime
    updated_at: datetime


class GateDecisionRequest(BaseModel):
    decision: Literal["approve", "revise"]
    notes: str | None = None
