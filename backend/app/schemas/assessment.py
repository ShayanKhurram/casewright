import uuid

from pydantic import BaseModel, ConfigDict


class CriterionAssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    criterion_key: str
    verdict: str
    confidence: float
    reasoning: dict
    evidence_refs: list


class CaseHealthOut(BaseModel):
    score: int
    criteria_score: int
    evidence_score: int
    verification_score: int
    criteria_met: int
    criteria_total: int


class CriterionRiskOut(BaseModel):
    criterion_key: str
    verdict: str
    confidence: float
    risk_score: int
    confidence_band: str
    why: str
    fix: str


class RiskRadarOut(BaseModel):
    overall_risk: int
    criteria: list[CriterionRiskOut]
    general_risks: list[str]


class StrategyMemoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    case_id: uuid.UUID
    recommended_category: str | None
    viability: str | None
    criteria_to_argue: list
    criteria_to_abandon: list
    evidence_gaps: list
    rfe_risks: list
    narrative: str | None
    attorney_decision: str | None
    attorney_notes: str | None
