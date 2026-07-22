"""Integration test for the LLM-dependent replay path, with the LLM mocked (same pattern as
tests/test_petition_graph.py) — there's no real ANTHROPIC_API_KEY in this environment, so this
exercises the DB plumbing and node wiring, not real model output."""

from pathlib import Path

from sqlalchemy import select

from app.agents import petition_graph
from app.agents.schemas import CriterionAssessmentOut, StrategyOut
from app.db import session_scope
from app.eval.replay import EVAL_FIRM_NAME, delete_eval_case, replay_case
from app.eval.schemas import GoldenCase
from app.models.case import Case
from app.models.tenant import Firm

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "eval_fixtures" / "example_synthetic_case.json"


async def _fake_call_structured(*, tier, system, user, response_model, max_tokens=4096):
    if response_model is CriterionAssessmentOut:
        criterion_key = user.split("\n", 1)[0]
        verdict = "met" if "awards" in criterion_key else "absent"
        return CriterionAssessmentOut(
            verdict=verdict, confidence=0.8, standard="...", analysis="...", gaps="", evidence_refs=["EX-1"]
        )
    if response_model is StrategyOut:
        return StrategyOut(
            recommended_category="EB-1A",
            viability="strong",
            criteria_to_argue=["eb1a.awards"],
            criteria_to_abandon=["eb1a.judging", "eb1a.membership"],
            evidence_gaps=[],
            rfe_risks=["The award may be characterized as regional."],
            narrative="Synthesized narrative.",
        )
    raise AssertionError(f"unexpected response_model in test: {response_model}")


async def test_replay_case_produces_scoreable_predictions(graph_db, monkeypatch):
    monkeypatch.setattr(petition_graph, "call_structured", _fake_call_structured)

    fixture = GoldenCase.model_validate_json(FIXTURE_PATH.read_text(encoding="utf-8"))
    result = await replay_case(fixture, run_drafting=False)

    assert result["predicted_verdicts"] == {
        "eb1a.awards": "met",
        "eb1a.judging": "absent",
        "eb1a.membership": "absent",
    }
    assert "regional" in result["predicted_risks"][0]

    async with session_scope() as db:
        case = await db.get(Case, result["case_id"])
        assert case is not None
        firm = await db.get(Firm, case.firm_id)
        assert firm is not None
        assert firm.name == EVAL_FIRM_NAME

    await delete_eval_case(result["case_id"])

    async with session_scope() as db:
        deleted = await db.get(Case, result["case_id"])
        assert deleted is None


async def test_replay_reuses_the_same_eval_firm_across_runs(graph_db, monkeypatch):
    monkeypatch.setattr(petition_graph, "call_structured", _fake_call_structured)
    fixture = GoldenCase.model_validate_json(FIXTURE_PATH.read_text(encoding="utf-8"))

    first = await replay_case(fixture, run_drafting=False)
    second = await replay_case(fixture, run_drafting=False)

    async with session_scope() as db:
        first_case = await db.get(Case, first["case_id"])
        second_case = await db.get(Case, second["case_id"])
        assert first_case is not None and second_case is not None
        assert first_case.firm_id == second_case.firm_id

        firms = (await db.execute(select(Firm).where(Firm.name == EVAL_FIRM_NAME))).scalars().all()
        assert len(firms) == 1, "repeated eval runs must not create a new firm each time"

    await delete_eval_case(first["case_id"])
    await delete_eval_case(second["case_id"])
