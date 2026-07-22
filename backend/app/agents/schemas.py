"""Structured-output contracts for LLM calls in the RFE graph. Every node response is validated
against one of these before it's allowed to touch Postgres."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ParsedObjection(BaseModel):
    position: int
    criterion_key: str | None = None
    officer_claim: str
    deficiency_type: str | None = None


class ParsedRFENotice(BaseModel):
    issued_date: date | None = None
    response_deadline: date | None = None
    summary: str
    objections: list[ParsedObjection]


class RebuttalPlan(BaseModel):
    concession_scope: str = Field(description="What, if anything, the response concedes.")
    evidence_plan: list[str] = Field(description="Specific evidence to marshal, by description.")
    argument_plan: str
    authorities: list[str] = Field(
        default_factory=list, description="Authority ref strings — only ones present in the retrieved context."
    )


class DraftCitation(BaseModel):
    marker: str = Field(description='e.g. "[EX-3]"')
    source_type: Literal["exhibit", "authority"]
    exhibit_label: str | None = None
    authority_ref: str | None = None


class DraftedSection(BaseModel):
    heading: str
    body: str = Field(description="Inline [EX-n] markers for every exhibit claim.")
    citations: list[DraftCitation]
    confidence: float = Field(ge=0.0, le=1.0)


class FactCheckResult(BaseModel):
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
