"""Petition graph: START -> intake -> profile -> [Send fan-out over 8/10 criteria] ->
assess_criterion -> strategy -> interrupt(strategy_gate) -> drafting -> verification ->
interrupt(review_gate) -> finalize -> END, with two independently bounded revision loops
(strategy_gate revise -> strategy; review_gate revise -> drafting). Fan-out is the one
mechanic this graph has that the RFE graph doesn't: assess_criterion runs once per criterion
key via langgraph.types.Send, and each branch contributes to the assessed_criteria reduce
channel — the graph runtime joins all branches before "strategy" (the node assess_criterion
has a normal edge to) runs.
"""

import uuid

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, interrupt
from sqlalchemy import delete, select

from app.agents.criteria import criteria_for
from app.agents.llm import call_structured
from app.agents.schemas import (
    BeneficiaryProfileOut,
    CriterionAssessmentOut,
    DraftedSection,
    ExtractedFactsOut,
    StrategyOut,
)
from app.agents.state import MAX_REVISION_ROUNDS, CriterionAssessInput, PetitionState
from app.agents.verification import verify_section
from app.db import session_scope
from app.models.assessment import CriterionAssessment, StrategyMemo
from app.models.case import Case, Document, ExtractedFact
from app.models.draft import Citation, Draft, DraftSection
from app.models.ops import BillingEvent
from app.models.tenant import Firm
from app.services import audit, retrieval

INTAKE_SYSTEM_PROMPT = """You are extracting normalized facts from one document submitted in
support of an O-1A/EB-1A extraordinary-ability petition. Extract every discrete fact relevant
to eligibility (awards, publications, roles/titles, salary figures, memberships, judging
activity, media coverage) with a verbatim source quote and page number anchor. Do not
editorialize or infer beyond what the document states."""

PROFILE_SYSTEM_PROMPT = """You are synthesizing a beneficiary's extracted facts into a
structured profile for an O-1A/EB-1A petition: education history, career history, and the
handful of headline achievements that will anchor the petition's narrative. Be concrete —
names, dates, institutions — not generic praise."""

ASSESS_SYSTEM_PROMPT = """You are evaluating whether this beneficiary's record satisfies ONE
specific O-1A/EB-1A extraordinary-ability criterion. Evaluate as a skeptical 2026-era USCIS
officer would, not as an advocate — overclaiming here poisons the strategy that gets built on
top of this assessment. State the standard, analyze the evidence against it, name any gaps
explicitly, give a calibrated verdict and confidence, and cite only exhibit labels that
actually appear in the evidence provided."""

STRATEGY_SYSTEM_PROMPT = """You are the strategist consuming a completed criterion-assessment
matrix for an O-1A/EB-1A petition. Decide the recommended filing category, which criteria to
argue vs. abandon (a criterion assessed "weak" or "absent" is usually not worth arguing —
padding the petition with weak criteria invites RFEs rather than preventing them), evidence
gaps to flag to the attorney, and predicted RFE risks. Write a narrative synthesizing why the
combination of criteria argued shows sustained acclaim, not just a checklist."""

DRAFT_SYSTEM_PROMPT = """You are drafting one section of an O-1A/EB-1A petition letter arguing
that the beneficiary satisfies ONE specific criterion, per the criterion assessment and
retrieved legal context. Structure: state the standard, present the evidence, argue
satisfaction of the standard. Every factual claim tied to an exhibit must carry an inline
[EX-n] marker matching the exhibit's label exactly. Cite legal authorities ONLY from the
retrieved context, never from memory. Give a calibrated confidence: 0.9+ means this section
could be filed with only light attorney edits."""


async def intake_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])

    async with session_scope() as db:
        documents_result = await db.execute(
            select(Document).where(Document.case_id == case_id, Document.kind != "rfe_notice")
        )
        documents = [d for d in documents_result.scalars().all() if d.extracted_text]

        fact_count = 0
        for document in documents:
            await db.execute(delete(ExtractedFact).where(ExtractedFact.source_document_id == document.id))

            extracted = await call_structured(
                tier="fast",
                system=INTAKE_SYSTEM_PROMPT,
                user=document.extracted_text or "",
                response_model=ExtractedFactsOut,
            )
            for fact in extracted.facts:
                db.add(
                    ExtractedFact(
                        firm_id=firm_id,
                        case_id=case_id,
                        fact_type=fact.fact_type,
                        payload=fact.payload,
                        source_document_id=document.id,
                        source_page=fact.source_page,
                        source_quote=fact.source_quote,
                    )
                )
                fact_count += 1

        await audit.record(
            db, firm_id=firm_id, actor="agent:intake", action="petition.intake",
            case_id=case_id, detail={"documents_processed": len(documents), "facts_extracted": fact_count},
        )

    return {}


async def profile_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])

    async with session_scope() as db:
        facts_result = await db.execute(select(ExtractedFact).where(ExtractedFact.case_id == case_id))
        facts = list(facts_result.scalars().all())
        facts_text = "\n".join(f"- ({f.fact_type}) {f.payload}" for f in facts)

        profile = await call_structured(
            tier="reasoning", system=PROFILE_SYSTEM_PROMPT, user=facts_text or "(no facts extracted)",
            response_model=BeneficiaryProfileOut,
        )

        case = await db.get(Case, case_id)
        assert case is not None
        case.status = "analyzing"
        case.profile = profile.model_dump()

        await audit.record(
            db, firm_id=firm_id, actor="agent:profile", action="petition.profiled",
            case_id=case_id, detail={"fact_count": len(facts)},
        )

    return {}


def route_to_criteria(state: PetitionState) -> list[Send]:
    return [
        Send("assess_criterion", {"case_id": state["case_id"], "firm_id": state["firm_id"], "criterion_key": ck})
        for ck in criteria_for(state["visa_category"])
    ]


async def assess_criterion_node(payload: CriterionAssessInput) -> dict:
    case_id = uuid.UUID(payload["case_id"])
    firm_id = uuid.UUID(payload["firm_id"])
    criterion_key = payload["criterion_key"]

    async with session_scope() as db:
        standard_chunks = await retrieval.retrieve(
            db, query=criterion_key, firm_id=firm_id, kind="criterion", criterion_key=criterion_key, limit=1
        )
        pattern_chunks = await retrieval.retrieve(
            db, query=criterion_key, firm_id=firm_id, kind="pattern", limit=2
        )
        context_text = "\n\n".join(f"[{c.ref}] {c.content}" for c in [*standard_chunks, *pattern_chunks])

        facts_result = await db.execute(select(ExtractedFact).where(ExtractedFact.case_id == case_id))
        documents_result = await db.execute(select(Document).where(Document.case_id == case_id))
        facts_text = "\n".join(f"- ({f.fact_type}) {f.payload}" for f in facts_result.scalars().all())
        exhibits_text = ", ".join(
            d.exhibit_label for d in documents_result.scalars().all() if d.exhibit_label
        )

        assessment = await call_structured(
            tier="reasoning",
            system=ASSESS_SYSTEM_PROMPT,
            user=(
                f"CRITERION: {criterion_key}\n\nRETRIEVED CONTEXT:\n{context_text}\n\n"
                f"EXTRACTED FACTS:\n{facts_text}\n\nAVAILABLE EXHIBITS: {exhibits_text}"
            ),
            response_model=CriterionAssessmentOut,
        )

        await db.execute(
            delete(CriterionAssessment).where(
                CriterionAssessment.case_id == case_id, CriterionAssessment.criterion_key == criterion_key
            )
        )
        db.add(
            CriterionAssessment(
                firm_id=firm_id,
                case_id=case_id,
                criterion_key=criterion_key,
                verdict=assessment.verdict,
                confidence=assessment.confidence,
                reasoning={
                    "standard": assessment.standard,
                    "analysis": assessment.analysis,
                    "gaps": assessment.gaps,
                },
                evidence_refs=assessment.evidence_refs,
            )
        )
        await audit.record(
            db, firm_id=firm_id, actor="agent:assess_criterion", action="petition.criterion_assessed",
            case_id=case_id, detail={"criterion_key": criterion_key, "verdict": assessment.verdict},
        )

    return {"assessed_criteria": [criterion_key]}


async def strategy_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])

    async with session_scope() as db:
        assessments_result = await db.execute(
            select(CriterionAssessment).where(CriterionAssessment.case_id == case_id)
        )
        assessments = list(assessments_result.scalars().all())
        matrix_text = "\n".join(
            f"- {a.criterion_key}: {a.verdict} (confidence {a.confidence}) — {a.reasoning.get('analysis', '')}"
            for a in assessments
        )

        strategy = await call_structured(
            tier="reasoning", system=STRATEGY_SYSTEM_PROMPT, user=matrix_text, response_model=StrategyOut
        )

        memo_result = await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case_id))
        memo = memo_result.scalar_one_or_none()
        if memo is None:
            memo = StrategyMemo(firm_id=firm_id, case_id=case_id)
            db.add(memo)

        memo.recommended_category = strategy.recommended_category
        memo.viability = strategy.viability
        memo.criteria_to_argue = strategy.criteria_to_argue
        memo.criteria_to_abandon = strategy.criteria_to_abandon
        memo.evidence_gaps = strategy.evidence_gaps
        memo.rfe_risks = strategy.rfe_risks
        memo.narrative = strategy.narrative

        case = await db.get(Case, case_id)
        assert case is not None
        case.status = "strategy_review"

        await audit.record(
            db, firm_id=firm_id, actor="agent:strategy", action="petition.strategy_drafted",
            case_id=case_id, detail={"criteria_to_argue": strategy.criteria_to_argue},
        )

    return {}


async def strategy_gate_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    async with session_scope() as db:
        memo_result = await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case_id))
        memo = memo_result.scalar_one()
        payload = {
            "gate": "strategy_review",
            "recommended_category": memo.recommended_category,
            "viability": memo.viability,
            "criteria_to_argue": memo.criteria_to_argue,
            "narrative": memo.narrative,
        }

    resume_value = interrupt(payload)
    decision = resume_value["decision"]
    notes = resume_value.get("notes")
    revision_round = state["revision_round"]
    if decision == "revise":
        revision_round += 1

    async with session_scope() as db:
        memo_result = await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case_id))
        memo = memo_result.scalar_one()
        memo.attorney_decision = decision
        memo.attorney_notes = notes

    return {"strategy_decision": decision, "strategy_notes": notes, "revision_round": revision_round}


def route_after_strategy_gate(state: PetitionState) -> str:
    if state["strategy_decision"] == "revise" and state["revision_round"] < MAX_REVISION_ROUNDS:
        return "strategy"
    return "drafting"


async def _get_current_petition_draft(db, case_id: uuid.UUID) -> Draft | None:
    result = await db.execute(
        select(Draft).where(Draft.case_id == case_id, Draft.kind == "petition_letter").order_by(Draft.version.desc())
    )
    return result.scalars().first()


async def drafting_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])

    async with session_scope() as db:
        firm = await db.get(Firm, firm_id)
        memo_result = await db.execute(select(StrategyMemo).where(StrategyMemo.case_id == case_id))
        memo = memo_result.scalar_one()

        existing_draft = await _get_current_petition_draft(db, case_id)
        version = existing_draft.version + 1 if existing_draft else 1
        draft = Draft(firm_id=firm_id, case_id=case_id, kind="petition_letter", version=version)
        db.add(draft)
        await db.flush()

        documents_result = await db.execute(select(Document).where(Document.case_id == case_id))
        documents_by_label = {d.exhibit_label: d for d in documents_result.scalars().all() if d.exhibit_label}

        assessments_result = await db.execute(
            select(CriterionAssessment).where(
                CriterionAssessment.case_id == case_id,
                CriterionAssessment.criterion_key.in_(memo.criteria_to_argue),
            )
        )
        assessments_by_key = {a.criterion_key: a for a in assessments_result.scalars().all()}

        for position, criterion_key in enumerate(memo.criteria_to_argue, start=1):
            assessment = assessments_by_key.get(criterion_key)
            if assessment is None:
                continue

            pattern_chunks = await retrieval.retrieve(
                db, query=criterion_key, firm_id=firm_id, kind="pattern", limit=2
            )
            style_note = f"\n\nFIRM STYLE NOTES:\n{firm.style_notes}" if firm and firm.style_notes else ""
            user_prompt = (
                f"CRITERION: {criterion_key}\n\nASSESSMENT:\n{assessment.reasoning}\n\n"
                f"EVIDENCE REFS: {assessment.evidence_refs}\n\n"
                f"AVAILABLE EXHIBITS: {', '.join(sorted(documents_by_label)) or '(none)'}\n\n"
                f"ARGUMENT PATTERNS:\n{chr(10).join(f'[{c.ref}] {c.content}' for c in pattern_chunks)}"
                f"{style_note}"
            )

            drafted: DraftedSection = await call_structured(
                tier="reasoning", system=DRAFT_SYSTEM_PROMPT, user=user_prompt, response_model=DraftedSection
            )

            section = DraftSection(
                firm_id=firm_id, draft_id=draft.id, position=position, heading=drafted.heading,
                body=drafted.body, criterion_key=criterion_key, status="generated",
                confidence=drafted.confidence, verification_notes={},
            )
            db.add(section)
            await db.flush()

            for citation in drafted.citations:
                document_id = None
                if citation.source_type == "exhibit" and citation.exhibit_label:
                    matched = documents_by_label.get(citation.exhibit_label)
                    document_id = matched.id if matched else None
                db.add(
                    Citation(
                        firm_id=firm_id, section_id=section.id, source_type=citation.source_type,
                        document_id=document_id, authority_ref=citation.authority_ref,
                        marker=citation.marker, verified=False,
                    )
                )

        case = await db.get(Case, case_id)
        assert case is not None
        case.status = "drafting"

        await audit.record(
            db, firm_id=firm_id, actor="agent:drafting", action="petition.drafted",
            case_id=case_id, detail={"draft_id": str(draft.id), "version": draft.version},
        )

    return {}


async def verification_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    async with session_scope() as db:
        draft = await _get_current_petition_draft(db, case_id)
        assert draft is not None
        sections_result = await db.execute(select(DraftSection).where(DraftSection.draft_id == draft.id))
        sections = list(sections_result.scalars().all())

        for section in sections:
            await verify_section(db, section, case_id)

        case = await db.get(Case, case_id)
        assert case is not None
        case.status = "draft_review"

        await audit.record(
            db, firm_id=uuid.UUID(state["firm_id"]), actor="agent:verification", action="petition.verified",
            case_id=case_id,
            detail={"sections_needing_attention": sum(1 for s in sections if s.status == "needs_attention")},
        )

    return {}


async def review_gate_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    async with session_scope() as db:
        draft = await _get_current_petition_draft(db, case_id)
        assert draft is not None
        sections_result = await db.execute(
            select(DraftSection).where(DraftSection.draft_id == draft.id).order_by(DraftSection.position)
        )
        summary = [
            {"id": str(s.id), "heading": s.heading, "status": s.status, "confidence": float(s.confidence or 0)}
            for s in sections_result.scalars().all()
        ]

    resume_value = interrupt({"gate": "draft_review", "draft_id": str(draft.id), "sections": summary})

    decision = resume_value["decision"]
    notes = resume_value.get("notes")
    revision_round = state["revision_round"]
    if decision == "revise":
        revision_round += 1

    return {"review_decision": decision, "review_notes": notes, "revision_round": revision_round}


def route_after_review_gate(state: PetitionState) -> str:
    if state["review_decision"] == "revise" and state["revision_round"] < MAX_REVISION_ROUNDS:
        return "drafting"
    return "finalize"


async def finalize_node(state: PetitionState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])

    async with session_scope() as db:
        case = await db.get(Case, case_id)
        assert case is not None
        case.status = "ready_to_file"

        db.add(BillingEvent(firm_id=firm_id, case_id=case_id, event_type="petition_package", quantity=1, meta={}))

        await audit.record(
            db, firm_id=firm_id, actor="agent:finalize", action="petition.finalized",
            case_id=case_id, detail={"review_decision": state["review_decision"]},
        )

    return {}


def build_petition_graph(checkpointer):
    graph = StateGraph(PetitionState)
    graph.add_node("intake", intake_node)
    graph.add_node("profile", profile_node)
    graph.add_node("assess_criterion", assess_criterion_node)
    graph.add_node("strategy", strategy_node)
    graph.add_node("strategy_gate", strategy_gate_node)
    graph.add_node("drafting", drafting_node)
    graph.add_node("verification", verification_node)
    graph.add_node("review_gate", review_gate_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "intake")
    graph.add_edge("intake", "profile")
    graph.add_conditional_edges("profile", route_to_criteria, ["assess_criterion"])
    graph.add_edge("assess_criterion", "strategy")
    graph.add_edge("strategy", "strategy_gate")
    graph.add_conditional_edges("strategy_gate", route_after_strategy_gate, ["strategy", "drafting"])
    graph.add_edge("drafting", "verification")
    graph.add_edge("verification", "review_gate")
    graph.add_conditional_edges("review_gate", route_after_review_gate, ["drafting", "finalize"])
    graph.add_edge("finalize", END)

    return graph.compile(checkpointer=checkpointer)
