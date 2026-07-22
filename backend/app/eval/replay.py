"""The DB+LLM-dependent half of the harness: seeds a throwaway case under a dedicated eval
firm, runs the real petition-graph nodes against it, and returns what was predicted. Deliberately
calls the node functions directly rather than driving the full graph — a golden-case run is a
one-shot replay, not a gated multi-step workflow, so the interrupt/checkpoint machinery
doesn't apply here."""

import uuid

from sqlalchemy import select

from app.agents.petition_graph import assess_criterion_node, drafting_node, strategy_node
from app.agents.state import PetitionState
from app.agents.verification import verify_section
from app.db import session_scope
from app.eval.schemas import GoldenCase
from app.models.assessment import CriterionAssessment, StrategyMemo
from app.models.case import Case, Document
from app.models.draft import Citation, Draft, DraftSection
from app.models.tenant import Firm

EVAL_FIRM_NAME = "__golden_case_eval__"


async def _get_or_create_eval_firm(db) -> Firm:
    result = await db.execute(select(Firm).where(Firm.name == EVAL_FIRM_NAME))
    firm = result.scalar_one_or_none()
    if firm is None:
        firm = Firm(name=EVAL_FIRM_NAME)
        db.add(firm)
        await db.flush()
    return firm


async def replay_case(fixture: GoldenCase, *, run_drafting: bool = False) -> dict:
    """Only assesses the criteria present in known_outcome.criteria_verdicts (not the full
    8/10-criterion matrix) — those are the only ones scoreable against the fixture, and it
    keeps LLM call volume proportional to what the fixture actually specifies."""
    async with session_scope() as db:
        firm = await _get_or_create_eval_firm(db)
        case = Case(
            firm_id=firm.id,
            beneficiary_name=fixture.beneficiary_name,
            visa_category=fixture.visa_category,
            status="analyzing",
        )
        db.add(case)
        await db.flush()

        for doc in fixture.documents:
            db.add(
                Document(
                    firm_id=firm.id,
                    case_id=case.id,
                    s3_key=f"eval/{uuid.uuid4()}",
                    content_type="text/plain",
                    kind=doc.kind,
                    exhibit_label=doc.exhibit_label,
                    extracted_text=doc.extracted_text,
                )
            )
        await db.flush()
        case_id, firm_id = case.id, firm.id

    for criterion_key in fixture.known_outcome.criteria_verdicts:
        await assess_criterion_node(
            {"case_id": str(case_id), "firm_id": str(firm_id), "criterion_key": criterion_key}
        )

    async with session_scope() as db:
        assessments = (
            await db.execute(select(CriterionAssessment).where(CriterionAssessment.case_id == case_id))
        ).scalars().all()
        predicted_verdicts = {a.criterion_key: a.verdict for a in assessments}

    state: PetitionState = {
        "case_id": str(case_id),
        "firm_id": str(firm_id),
        "visa_category": fixture.visa_category,
        "assessed_criteria": list(predicted_verdicts),
        "strategy_decision": None,
        "strategy_notes": None,
        "review_decision": None,
        "review_notes": None,
        "revision_round": 0,
    }
    await strategy_node(state)

    async with session_scope() as db:
        memo = (await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case_id))).scalar_one()
        predicted_risks = list(memo.rfe_risks)

    verified_flags: list[bool] = []
    if run_drafting:
        await drafting_node(state)
        async with session_scope() as db:
            draft = (
                await db.execute(
                    select(Draft)
                    .where(Draft.case_id == case_id, Draft.kind == "petition_letter")
                    .order_by(Draft.version.desc())
                )
            ).scalars().first()
            if draft is not None:
                sections = (
                    await db.execute(select(DraftSection).where(DraftSection.draft_id == draft.id))
                ).scalars().all()
                for section in sections:
                    await verify_section(db, section, case_id)
                citations = (
                    (
                        await db.execute(
                            select(Citation).where(Citation.section_id.in_([s.id for s in sections]))
                        )
                    )
                    .scalars()
                    .all()
                    if sections
                    else []
                )
                verified_flags = [c.verified for c in citations]

    return {
        "case_id": case_id,
        "predicted_verdicts": predicted_verdicts,
        "predicted_risks": predicted_risks,
        "verified_flags": verified_flags,
    }


async def delete_eval_case(case_id: uuid.UUID) -> None:
    """Cascades to documents/assessments/memo/drafts (all FK ondelete=CASCADE) so repeated
    harness runs don't accumulate junk rows."""
    async with session_scope() as db:
        case = await db.get(Case, case_id)
        if case is not None:
            await db.delete(case)
