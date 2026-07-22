import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class RFEObjectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    notice_id: uuid.UUID
    position: int
    criterion_key: str | None
    officer_claim: str
    deficiency_type: str | None
    rebuttal_plan: dict


class RFENoticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    document_id: uuid.UUID
    issued_date: date | None
    response_deadline: date | None
    summary: str | None
    created_at: datetime
    objections: list[RFEObjectionOut] = []
