"""The golden-case fixture format. A fixture is one firm-decided case: what was submitted,
what the firm actually argued and won, and — if USCIS issued an RFE — what it actually
challenged. See eval_fixtures/example_synthetic_case.json for a worked (synthetic) example."""

from pydantic import BaseModel, Field


class GoldenDocument(BaseModel):
    kind: str
    exhibit_label: str
    extracted_text: str


class GoldenOutcome(BaseModel):
    criteria_verdicts: dict[str, str] = Field(
        description="criterion_key -> verdict actually argued/established in the filed petition."
    )
    rfe_objections_raised: list[str] = Field(
        default_factory=list,
        description="criterion_key values USCIS actually challenged in an RFE, if one was issued. Empty if no RFE.",
    )


class GoldenCase(BaseModel):
    case_name: str
    visa_category: str
    beneficiary_name: str
    documents: list[GoldenDocument]
    known_outcome: GoldenOutcome
