import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict


class CitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    section_id: uuid.UUID
    source_type: str
    document_id: uuid.UUID | None
    authority_ref: str | None
    marker: str
    verified: bool


class DraftSectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    draft_id: uuid.UUID
    position: int
    heading: str
    body: str
    criterion_key: str | None
    status: str
    confidence: float | None
    verification_notes: dict
    reviewer_comment: str | None
    citations: list[CitationOut] = []


class DraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    kind: str
    version: int
    sections: list[DraftSectionOut] = []


class SectionReviewRequest(BaseModel):
    decision: Literal["approve", "revision_requested"]
    comment: str | None = None
