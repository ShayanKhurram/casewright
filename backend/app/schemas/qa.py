import uuid

from pydantic import BaseModel


class CaseQARequest(BaseModel):
    question: str


class QACitation(BaseModel):
    fact_id: uuid.UUID
    document_id: uuid.UUID
    exhibit_label: str | None
    source_page: int | None
    source_quote: str | None


class CaseQAResponse(BaseModel):
    answer: str
    grounded: bool
    citations: list[QACitation]


class QAModelOutput(BaseModel):
    answer: str
    found: bool
    cited_fact_indices: list[int]