"""Structured-output contracts for LLM calls in the agent graphs. Every node response is
validated against one of these before it's allowed to touch Postgres."""

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


class ExtractedFactOut(BaseModel):
    fact_type: str = Field(description='e.g. "award", "publication", "role", "salary".')
    payload: dict = Field(description="Structured detail for this fact — shape varies by fact_type.")
    source_page: int | None = None
    source_quote: str | None = Field(default=None, description="Verbatim anchor from the source document.")


class ExtractedFactsOut(BaseModel):
    facts: list[ExtractedFactOut]


class BeneficiaryProfileOut(BaseModel):
    education: list[str] = Field(default_factory=list)
    career: list[str] = Field(default_factory=list)
    headline_achievements: list[str] = Field(default_factory=list)


class CriterionAssessmentOut(BaseModel):
    verdict: Literal["met", "partial", "weak", "absent"]
    confidence: float = Field(ge=0.0, le=1.0)
    standard: str = Field(description="The regulatory standard, restated concisely.")
    analysis: str = Field(description="How this record measures against the standard.")
    gaps: str = Field(description="What's missing or weak, if anything. Empty string if none.")
    evidence_refs: list[str] = Field(default_factory=list, description='Exhibit labels, e.g. "EX-3".')


class StrategyOut(BaseModel):
    recommended_category: str = Field(description='"O-1A" or "EB-1A".')
    viability: str
    criteria_to_argue: list[str] = Field(description="criterion_key values to argue in the petition.")
    criteria_to_abandon: list[str] = Field(default_factory=list)
    evidence_gaps: list[str] = Field(default_factory=list)
    rfe_risks: list[str] = Field(default_factory=list)
    narrative: str
