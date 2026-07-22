import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    kind: str
    exhibit_label: str | None
    content_type: str
    page_count: int | None
    classification_confidence: float | None
    created_at: datetime


class DocumentUrlOut(BaseModel):
    url: str
