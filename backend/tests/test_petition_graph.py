"""End-to-end petition graph test with a mocked LLM layer (plan §13): the Send-based fan-out
over criteria, both interrupt gates (strategy_gate, review_gate), and both independently
bounded revision loops."""

from sqlalchemy import select

from app.agents import petition_graph, runner, verification
from app.agents.criteria import EB1A_CRITERIA
from app.agents.schemas import (
    BeneficiaryProfileOut,
    CriterionAssessmentOut,
    DraftCitation,
    DraftedSection,
    ExtractedFactOut,
    ExtractedFactsOut,
    FactCheckResult,
    StrategyOut,
)
from app.db import session_scope
from app.models.assessment import CriterionAssessment, StrategyMemo
from app.models.case import Case, Document
from app.models.draft import Draft
from app.models.ops import AgentRun, BillingEvent
from app.models.tenant import Firm


async def _fake_call_structured(*, tier, system, user, response_model, max_tokens=4096):
    if response_model is ExtractedFactsOut:
        return ExtractedFactsOut(
            facts=[ExtractedFactOut(fact_type="award", payload={"name": "National Excellence Award"}, source_page=1)]
        )
    if response_model is BeneficiaryProfileOut:
        return BeneficiaryProfileOut(
            education=["PhD, Example University"],
            career=["Lead Researcher, Example Corp"],
            headline_achievements=["National Excellence Award"],
        )
    if response_model is CriterionAssessmentOut:
        # "awards" argued and met; everything else weak/absent so strategy abandons it —
        # exercises the criteria_to_argue vs criteria_to_abandon split.
        if "awards" in user.split("\n", 1)[0]:
            return CriterionAssessmentOut(
                verdict="met", confidence=0.9, standard="...", analysis="Strong award evidence.",
                gaps="", evidence_refs=["EX-1"],
            )
        return CriterionAssessmentOut(
            verdict="absent", confidence=0.2, standard="...", analysis="No evidence found.",
            gaps="Nothing submitted.", evidence_refs=[],
        )
    if response_model is StrategyOut:
        return StrategyOut(
            recommended_category="EB-1A",
            viability="strong",
            criteria_to_argue=["eb1a.awards"],
            criteria_to_abandon=[c for c in EB1A_CRITERIA if c != "eb1a.awards"],
            evidence_gaps=[],
            rfe_risks=["Award may be characterized as regional."],
            narrative="The beneficiary's award anchors a strong extraordinary-ability case.",
        )
    if response_model is DraftedSection:
        return DraftedSection(
            heading="Criterion: Awards",
            body="The beneficiary's award [EX-1] is nationally recognized per 8 CFR 204.5(h)(3)(i).",
            citations=[DraftCitation(marker="[EX-1]", source_type="exhibit", exhibit_label="EX-1")],
            confidence=0.85,
        )
    if response_model is FactCheckResult:
        return FactCheckResult(blockers=[], warnings=[])
    raise AssertionError(f"unexpected response_model in test: {response_model}")


async def _seed_case() -> dict:
    async with session_scope() as db:
        firm = Firm(name="Test Firm")
        db.add(firm)
        await db.flush()

        case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="intake")
        db.add(case)
        await db.flush()

        award_document = Document(
            firm_id=firm.id, case_id=case.id, s3_key="k-award", content_type="application/pdf",
            kind="award", exhibit_label="EX-1", extracted_text="National Excellence Award certificate for Jane Doe.",
        )
        db.add(award_document)
        await db.flush()

        return {"firm_id": firm.id, "case_id": case.id}


def _initial_state(ids: dict) -> dict:
    return {
        "case_id": str(ids["case_id"]),
        "firm_id": str(ids["firm_id"]),
        "visa_category": "EB-1A",
        "assessed_criteria": [],
        "strategy_decision": None,
        "strategy_notes": None,
        "review_decision": None,
        "review_notes": None,
        "revision_round": 0,
    }


async def test_petition_graph_fans_out_over_all_criteria_then_both_gates_approve(graph_db, monkeypatch):
    monkeypatch.setattr(petition_graph, "call_structured", _fake_call_structured)
    monkeypatch.setattr(verification, "call_structured", _fake_call_structured)

    ids = await _seed_case()
    run_id, task = await runner.start_run(
        case_id=ids["case_id"], firm_id=ids["firm_id"], graph="petition", initial_state=_initial_state(ids)
    )
    await task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "waiting_review"
        assert run.current_gate == "strategy_review"

        assessments = list(
            (await db.execute(select(CriterionAssessment).where(CriterionAssessment.case_id == ids["case_id"])))
            .scalars()
        )
        assert {a.criterion_key for a in assessments} == set(EB1A_CRITERIA), "fan-out must cover every criterion"

        case = await db.get(Case, ids["case_id"])
        assert case is not None
        assert case.status == "strategy_review"

    strategy_approve_task = await runner.resume_run(run_id=run_id, decision="approve", notes=None)
    await strategy_approve_task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "waiting_review"
        assert run.current_gate == "draft_review"

        draft = (
            await db.execute(select(Draft).where(Draft.case_id == ids["case_id"], Draft.kind == "petition_letter"))
        ).scalar_one()
        assert draft.version == 1

    review_approve_task = await runner.resume_run(run_id=run_id, decision="approve", notes=None)
    await review_approve_task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"

        case = await db.get(Case, ids["case_id"])
        assert case is not None
        assert case.status == "ready_to_file"

        billing = await db.execute(select(BillingEvent).where(BillingEvent.case_id == ids["case_id"]))
        event = billing.scalar_one()
        assert event.event_type == "petition_package"


async def test_petition_graph_strategy_revision_loops_back_to_strategy(graph_db, monkeypatch):
    monkeypatch.setattr(petition_graph, "call_structured", _fake_call_structured)
    monkeypatch.setattr(verification, "call_structured", _fake_call_structured)

    ids = await _seed_case()
    run_id, task = await runner.start_run(
        case_id=ids["case_id"], firm_id=ids["firm_id"], graph="petition", initial_state=_initial_state(ids)
    )
    await task

    revise_task = await runner.resume_run(run_id=run_id, decision="revise", notes="Reconsider category.")
    await revise_task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        # Should re-run strategy and hit strategy_gate again, not fall through to drafting.
        assert run.status == "waiting_review"
        assert run.current_gate == "strategy_review"

        memo = (await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == ids["case_id"]))).scalar_one()
        assert memo.attorney_decision == "revise"
