"""End-to-end RFE graph test with a mocked LLM layer (plan §13): sequencing, gate pause/resume,
and Postgres checkpointing, all against the real graph — only the Anthropic calls are faked."""

from datetime import date

from sqlalchemy import select

from app.agents import rfe_graph, runner, verification
from app.agents.schemas import (
    DraftCitation,
    DraftedSection,
    FactCheckResult,
    ParsedObjection,
    ParsedRFENotice,
    RebuttalPlan,
)
from app.db import session_scope
from app.models.case import Case, Document
from app.models.draft import Draft
from app.models.ops import AgentRun, BillingEvent
from app.models.rfe import RFENotice, RFEObjection
from app.models.tenant import Firm


async def _fake_call_structured(*, tier, system, user, response_model, max_tokens=4096):
    if response_model is ParsedRFENotice:
        return ParsedRFENotice(
            issued_date=date(2026, 1, 5),
            response_deadline=date(2026, 4, 5),
            summary="Officer questions whether the award satisfies the awards criterion.",
            objections=[
                ParsedObjection(
                    position=1,
                    criterion_key="eb1a.awards",
                    officer_claim="The submitted award is not nationally recognized.",
                    deficiency_type="insufficient_evidence",
                )
            ],
        )
    if response_model is RebuttalPlan:
        return RebuttalPlan(
            concession_scope="None.",
            evidence_plan=["Submit selection statistics for the award."],
            argument_plan="Argue national recognition via applicant pool breadth and press coverage.",
            authorities=["8 CFR 204.5(h)(3)(i)"],
        )
    if response_model is DraftedSection:
        return DraftedSection(
            heading="Criterion: Awards",
            body="The beneficiary's award [EX-1] is nationally recognized per 8 CFR 204.5(h)(3)(i).",
            citations=[
                DraftCitation(marker="[EX-1]", source_type="exhibit", exhibit_label="EX-1"),
                DraftCitation(
                    marker="[8 CFR 204.5(h)(3)(i)]", source_type="authority", authority_ref="8 CFR 204.5(h)(3)(i)"
                ),
            ],
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

        case = Case(firm_id=firm.id, beneficiary_name="Jane Doe", visa_category="EB-1A", status="rfe_received")
        db.add(case)
        await db.flush()

        rfe_document = Document(
            firm_id=firm.id, case_id=case.id, s3_key="k-notice", content_type="application/pdf",
            kind="rfe_notice", exhibit_label="EX-0", extracted_text="RFE notice text challenging the awards criterion.",
        )
        award_document = Document(
            firm_id=firm.id, case_id=case.id, s3_key="k-award", content_type="application/pdf",
            kind="award", exhibit_label="EX-1", extracted_text="National Excellence Award certificate for Jane Doe.",
        )
        db.add_all([rfe_document, award_document])
        await db.flush()

        notice = RFENotice(firm_id=firm.id, case_id=case.id, document_id=rfe_document.id)
        db.add(notice)
        await db.flush()

        return {
            "firm_id": firm.id,
            "case_id": case.id,
            "notice_id": notice.id,
            "rfe_document_id": rfe_document.id,
        }


async def test_rfe_graph_runs_to_gate_then_approve_and_finalizes(graph_db, monkeypatch):
    monkeypatch.setattr(rfe_graph, "call_structured", _fake_call_structured)
    monkeypatch.setattr(verification, "call_structured", _fake_call_structured)

    ids = await _seed_case()
    initial_state = {
        "case_id": str(ids["case_id"]),
        "firm_id": str(ids["firm_id"]),
        "rfe_notice_id": str(ids["notice_id"]),
        "rfe_document_id": str(ids["rfe_document_id"]),
        "objection_ids": [],
        "review_decision": None,
        "review_notes": None,
        "revision_round": 0,
    }

    run_id, task = await runner.start_run(
        case_id=ids["case_id"], firm_id=ids["firm_id"], graph="rfe", initial_state=initial_state
    )
    await task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "waiting_review"
        assert run.current_gate == "draft_review"
        assert run.gate_payload["sections"][0]["heading"] == "Criterion: Awards"

        objections = list(
            (await db.execute(select(RFEObjection).where(RFEObjection.notice_id == ids["notice_id"]))).scalars()
        )
        assert len(objections) == 1
        assert objections[0].rebuttal_plan["argument_plan"]

    resume_task = await runner.resume_run(run_id=run_id, decision="approve", notes="Looks good.")
    await resume_task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"

        case = await db.get(Case, ids["case_id"])
        assert case is not None
        assert case.status == "filed"

        billing = await db.execute(select(BillingEvent).where(BillingEvent.case_id == ids["case_id"]))
        assert billing.scalar_one_or_none() is not None


async def test_rfe_graph_revise_then_approve_redrafts_once(graph_db, monkeypatch):
    monkeypatch.setattr(rfe_graph, "call_structured", _fake_call_structured)
    monkeypatch.setattr(verification, "call_structured", _fake_call_structured)

    ids = await _seed_case()
    initial_state = {
        "case_id": str(ids["case_id"]),
        "firm_id": str(ids["firm_id"]),
        "rfe_notice_id": str(ids["notice_id"]),
        "rfe_document_id": str(ids["rfe_document_id"]),
        "objection_ids": [],
        "review_decision": None,
        "review_notes": None,
        "revision_round": 0,
    }

    run_id, task = await runner.start_run(
        case_id=ids["case_id"], firm_id=ids["firm_id"], graph="rfe", initial_state=initial_state
    )
    await task

    revise_task = await runner.resume_run(run_id=run_id, decision="revise", notes="Tighten the argument.")
    await revise_task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "waiting_review", "should redraft and hit the gate again, not finish"

    approve_task = await runner.resume_run(run_id=run_id, decision="approve", notes=None)
    await approve_task

    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        assert run.status == "completed"

        drafts = list(
            (await db.execute(select(Draft).where(Draft.case_id == ids["case_id"]))).scalars()
        )
        assert max(d.version for d in drafts) == 2, "one revision round should have produced a second draft version"
