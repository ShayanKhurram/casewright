"""Pure unit tests for the eval harness's scoring functions — no DB, no LLM."""

from app.eval.scoring import score_citation_pass_rate, score_criterion_agreement, score_rfe_risk_precision


def test_agreement_is_vacuously_perfect_with_nothing_to_compare():
    result = score_criterion_agreement({}, {"eb1a.awards": "met"})
    assert result.agreement_rate == 1.0
    assert result.compared_count == 0


def test_agreement_counts_only_shared_keys():
    known = {"eb1a.awards": "met", "eb1a.judging": "met", "eb1a.membership": "absent"}
    predicted = {"eb1a.awards": "met", "eb1a.judging": "partial"}

    result = score_criterion_agreement(known, predicted)

    assert result.compared_count == 2
    assert result.agreement_rate == 0.5
    assert result.mismatches == ["eb1a.judging: met -> partial"]


def test_agreement_full_match():
    known = {"eb1a.awards": "met"}
    predicted = {"eb1a.awards": "met"}
    result = score_criterion_agreement(known, predicted)
    assert result.agreement_rate == 1.0
    assert result.mismatches == []


def test_rfe_risk_precision_vacuous_cases():
    result = score_rfe_risk_precision([], [])
    assert result.precision == 1.0
    assert result.recall == 1.0

    result = score_rfe_risk_precision(["eb1a.awards"], [])
    assert result.precision == 1.0  # nothing predicted, nothing wrong predicted
    assert result.recall == 0.0  # but the real objection was missed


def test_rfe_risk_precision_matches_by_substring():
    objections = ["eb1a.awards", "eb1a.judging"]
    predicted_risks = ["The awards submitted may be seen as regional rather than national."]

    result = score_rfe_risk_precision(objections, predicted_risks)

    assert result.matched_criteria == ["eb1a.awards"]
    assert result.precision == 1.0  # the one predicted risk did correspond to a real objection
    assert result.recall == 0.5  # only 1 of 2 real objections was predicted


def test_citation_pass_rate():
    assert score_citation_pass_rate([]) == 1.0
    assert score_citation_pass_rate([True, True, True]) == 1.0
    assert score_citation_pass_rate([True, False]) == 0.5
    assert score_citation_pass_rate([False, False]) == 0.0
