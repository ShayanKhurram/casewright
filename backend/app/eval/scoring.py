"""Pure scoring functions — no DB, no LLM, no I/O. Kept separate from replay.py specifically
so this half of the harness is unit-testable without a running model or database (see
tests/test_eval_scoring.py)."""

from dataclasses import dataclass, field


@dataclass
class CriterionAgreementResult:
    agreement_rate: float
    """Fraction of criteria where the predicted verdict matched the known (filed) verdict,
    over criteria present in BOTH known_outcome and the prediction. 1.0 if there's nothing
    to compare (vacuously true — callers should also check `compared_count`)."""
    compared_count: int
    mismatches: list[str] = field(default_factory=list)
    """criterion_key values where predicted != known, formatted as 'key: known -> predicted'."""


def score_criterion_agreement(
    known_verdicts: dict[str, str], predicted_verdicts: dict[str, str]
) -> CriterionAgreementResult:
    shared_keys = set(known_verdicts) & set(predicted_verdicts)
    if not shared_keys:
        return CriterionAgreementResult(agreement_rate=1.0, compared_count=0)

    mismatches = [
        f"{key}: {known_verdicts[key]} -> {predicted_verdicts[key]}"
        for key in sorted(shared_keys)
        if known_verdicts[key] != predicted_verdicts[key]
    ]
    matches = len(shared_keys) - len(mismatches)
    return CriterionAgreementResult(
        agreement_rate=matches / len(shared_keys),
        compared_count=len(shared_keys),
        mismatches=mismatches,
    )


@dataclass
class RfeRiskPrecisionResult:
    precision: float
    """Of the risks the model predicted, what fraction correspond to a criterion USCIS
    actually challenged. 1.0 (vacuously) if the model predicted zero risks."""
    recall: float
    """Of the criteria USCIS actually challenged, what fraction the model predicted as a risk.
    1.0 (vacuously) if there were zero actual objections."""
    matched_criteria: list[str] = field(default_factory=list)


def score_rfe_risk_precision(
    objections_raised: list[str], predicted_risks: list[str]
) -> RfeRiskPrecisionResult:
    """Heuristic, not NLP: rfe_risks is free-text (plan §5's StrategyOut.rfe_risks), so a
    criterion_key is scored as "predicted" if it appears as a substring of any risk string
    (case-insensitive). This will under-count risks phrased without the literal criterion
    name and over-count coincidental substring matches — good enough for a first-pass signal,
    not a precision instrument. Revisit if this heuristic proves too noisy in practice."""
    risks_text = " ".join(predicted_risks).lower()
    matched = [key for key in objections_raised if key.lower() in risks_text or _short_name(key) in risks_text]

    precision = len(matched) / len(predicted_risks) if predicted_risks else 1.0
    recall = len(matched) / len(objections_raised) if objections_raised else 1.0
    return RfeRiskPrecisionResult(precision=min(precision, 1.0), recall=recall, matched_criteria=matched)


def _short_name(criterion_key: str) -> str:
    """'eb1a.awards' -> 'awards' — the part of the key that's likely to appear in prose."""
    return criterion_key.rsplit(".", 1)[-1].replace("_", " ")


def score_citation_pass_rate(verified_flags: list[bool]) -> float:
    """1.0 (vacuously) if there are no citations to check — a section with zero citations
    hasn't failed verification, it just has nothing to verify."""
    if not verified_flags:
        return 1.0
    return sum(1 for v in verified_flags if v) / len(verified_flags)
