"""RFE Risk Radar — a deterministic per-criterion "how likely is this to draw an RFE
objection" score, computed purely from already-persisted CriterionAssessment data. No LLM
call, no new agent run: this is a read-time derivation over the criterion matrix and the
strategy memo (plan §new-feature)."""

from statistics import mean

from app.models.assessment import CriterionAssessment
from app.schemas.assessment import CriterionRiskOut

# Base risk by verdict — met is safest, absent is riskiest. The additive confidence term
# below means a low-confidence "met" can still beat a high-confidence "partial", but within a
# fixed verdict the ordering is monotone in confidence.
_VERDICT_BASE = {"met": 15, "partial": 50, "weak": 75, "absent": 90}


def compute_criterion_risk(assessment: CriterionAssessment) -> CriterionRiskOut:
    """Pure function — takes an already-fetched ORM row, no DB access."""
    confidence = float(assessment.confidence)
    base = _VERDICT_BASE.get(assessment.verdict, 90)
    risk_score = max(0, min(100, base + round((1 - confidence) * 20)))

    if confidence >= 0.75:
        confidence_band = "high"
    elif confidence >= 0.45:
        confidence_band = "medium"
    else:
        confidence_band = "low"

    gaps = assessment.reasoning.get("gaps", []) or []
    if gaps:
        why = ", ".join(gaps)
    else:
        analysis = assessment.reasoning.get("analysis", "") or ""
        if analysis:
            why = analysis[:200]
        else:
            why = "No specific gaps recorded."

    if gaps:
        fix = gaps[0]
    else:
        fix = f"Strengthen evidence for {assessment.criterion_key}."

    return CriterionRiskOut(
        criterion_key=assessment.criterion_key,
        verdict=assessment.verdict,
        confidence=confidence,
        risk_score=risk_score,
        confidence_band=confidence_band,
        why=why,
        fix=fix,
    )


def compute_overall_risk(criteria: list[CriterionRiskOut]) -> int:
    """Mean of per-criterion risk scores, or 0 when there are no criteria (guard the
    division-by-zero explicitly rather than relying on mean([]) raising)."""
    if not criteria:
        return 0
    return round(mean(c.risk_score for c in criteria))