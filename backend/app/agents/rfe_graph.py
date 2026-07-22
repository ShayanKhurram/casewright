"""RFE graph: START -> parse_rfe -> plan_rebuttals -> draft_rfe -> verification ->
review_gate (interrupt) -> finalize -> END, with a bounded revision loop from review_gate
back to draft_rfe (MAX_REVISION_ROUNDS, plan §5). This is the wedge product's graph."""

import uuid

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from sqlalchemy import select

from app.agents.llm import call_structured
from app.agents.schemas import DraftedSection, ParsedRFENotice, RebuttalPlan
from app.agents.state import MAX_REVISION_ROUNDS, RFEState
from app.agents.verification import verify_section
from app.db import session_scope
from app.models.case import Case, Document
from app.models.draft import Citation, Draft, DraftSection
from app.models.ops import BillingEvent
from app.models.rfe import RFENotice, RFEObjection
from app.models.tenant import Firm
from app.services import audit, retrieval

PARSE_SYSTEM_PROMPT = """You are analyzing a USCIS Request for Evidence (RFE) notice for an
O-1A or EB-1A petition. Extract the issued date, the response deadline, a one-paragraph
summary, and every distinct objection the officer raised, in the order they appear. For each
objection, identify the criterion it relates to if identifiable (e.g. "eb1a.awards",
"o1a.critical_employment") and classify the deficiency type (e.g. "insufficient_evidence",
"credibility", "eligibility_standard_not_met")."""

PLAN_SYSTEM_PROMPT = """You are planning a rebuttal to one USCIS RFE objection for an O-1A/EB-1A
petition. You are given the officer's claim and retrieved legal standard/authority/pattern
context. Decide what (if anything) to concede, what evidence to marshal, the argument
structure, and which authorities to cite. You may cite ONLY authorities present in the
retrieved context below — never cite a regulation or case from memory."""

DRAFT_SYSTEM_PROMPT = """You are drafting one section of a USCIS RFE response for an O-1A/EB-1A
petition, rebutting a specific officer objection per the rebuttal plan. Structure: state the
standard, present the evidence, argue satisfaction of the standard. Every factual claim tied to
an exhibit must carry an inline [EX-n] marker matching the exhibit's label exactly. Cite legal
authorities ONLY from the retrieved context, never from memory. Give a calibrated confidence:
0.9+ means this section could be filed with only light attorney edits."""


async def _get_current_draft(db, case_id: uuid.UUID) -> Draft | None:
    result = await db.execute(
        select(Draft)
        .where(Draft.case_id == case_id, Draft.kind == "rfe_response")
        .order_by(Draft.version.desc())
    )
    return result.scalars().first()


async def parse_rfe_node(state: RFEState) -> dict:
    async with session_scope() as db:
        document = await db.get(Document, uuid.UUID(state["rfe_document_id"]))
        notice = await db.get(RFENotice, uuid.UUID(state["rfe_notice_id"]))
        assert document is not None and notice is not None

        parsed = await call_structured(
            tier="reasoning",
            system=PARSE_SYSTEM_PROMPT,
            user=document.extracted_text or "",
            response_model=ParsedRFENotice,
        )

        notice.issued_date = parsed.issued_date
        notice.response_deadline = parsed.response_deadline
        notice.summary = parsed.summary

        objection_ids: list[str] = []
        for position, parsed_objection in enumerate(parsed.objections, start=1):
            objection = RFEObjection(
                firm_id=notice.firm_id,
                notice_id=notice.id,
                position=position,
                criterion_key=parsed_objection.criterion_key,
                officer_claim=parsed_objection.officer_claim,
                deficiency_type=parsed_objection.deficiency_type,
                rebuttal_plan={},
            )
            db.add(objection)
            await db.flush()
            objection_ids.append(str(objection.id))

        await audit.record(
            db,
            firm_id=notice.firm_id,
            actor="agent:parse_rfe",
            action="rfe.parsed",
            case_id=uuid.UUID(state["case_id"]),
            detail={"notice_id": str(notice.id), "objection_count": len(objection_ids)},
        )

    return {"objection_ids": objection_ids}


async def plan_rebuttals_node(state: RFEState) -> dict:
    firm_id = uuid.UUID(state["firm_id"])
    async with session_scope() as db:
        for objection_id in state["objection_ids"]:
            objection = await db.get(RFEObjection, uuid.UUID(objection_id))
            assert objection is not None

            context_chunks = []
            if objection.criterion_key:
                context_chunks += await retrieval.retrieve(
                    db, query=objection.officer_claim, firm_id=firm_id, kind="criterion",
                    criterion_key=objection.criterion_key, limit=1,
                )
            context_chunks += await retrieval.retrieve(
                db, query=objection.officer_claim, firm_id=firm_id, kind="authority", limit=3
            )
            context_chunks += await retrieval.retrieve(
                db, query=objection.officer_claim, firm_id=firm_id, kind="pattern", limit=2
            )
            context_text = "\n\n".join(f"[{c.ref}] {c.content}" for c in context_chunks)

            plan = await call_structured(
                tier="reasoning",
                system=PLAN_SYSTEM_PROMPT,
                user=f"OFFICER CLAIM:\n{objection.officer_claim}\n\nRETRIEVED CONTEXT:\n{context_text}",
                response_model=RebuttalPlan,
            )
            objection.rebuttal_plan = plan.model_dump()

        await audit.record(
            db,
            firm_id=firm_id,
            actor="agent:plan_rebuttals",
            action="rfe.rebuttals_planned",
            case_id=uuid.UUID(state["case_id"]),
            detail={"objection_count": len(state["objection_ids"])},
        )

    return {}


async def draft_rfe_node(state: RFEState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])

    async with session_scope() as db:
        firm = await db.get(Firm, firm_id)
        existing_draft = await _get_current_draft(db, case_id)
        if existing_draft is not None:
            draft = Draft(firm_id=firm_id, case_id=case_id, kind="rfe_response", version=existing_draft.version + 1)
        else:
            draft = Draft(firm_id=firm_id, case_id=case_id, kind="rfe_response", version=1)
        db.add(draft)
        await db.flush()

        documents_result = await db.execute(select(Document).where(Document.case_id == case_id))
        documents_by_label = {d.exhibit_label: d for d in documents_result.scalars().all() if d.exhibit_label}

        for objection_id in state["objection_ids"]:
            objection = await db.get(RFEObjection, uuid.UUID(objection_id))
            assert objection is not None

            pattern_chunks = await retrieval.retrieve(
                db, query=objection.officer_claim, firm_id=firm_id, kind="pattern", limit=2
            )
            style_note = f"\n\nFIRM STYLE NOTES:\n{firm.style_notes}" if firm and firm.style_notes else ""
            user_prompt = (
                f"OFFICER CLAIM:\n{objection.officer_claim}\n\n"
                f"REBUTTAL PLAN:\n{objection.rebuttal_plan}\n\n"
                f"AVAILABLE EXHIBITS:\n{', '.join(sorted(documents_by_label)) or '(none)'}\n\n"
                f"ARGUMENT PATTERNS:\n{chr(10).join(f'[{c.ref}] {c.content}' for c in pattern_chunks)}"
                f"{style_note}"
            )

            drafted: DraftedSection = await call_structured(
                tier="reasoning", system=DRAFT_SYSTEM_PROMPT, user=user_prompt, response_model=DraftedSection
            )

            section = DraftSection(
                firm_id=firm_id,
                draft_id=draft.id,
                position=objection.position,
                heading=drafted.heading,
                body=drafted.body,
                criterion_key=objection.criterion_key,
                status="generated",
                confidence=drafted.confidence,
                verification_notes={},
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
                        firm_id=firm_id,
                        section_id=section.id,
                        source_type=citation.source_type,
                        document_id=document_id,
                        authority_ref=citation.authority_ref,
                        marker=citation.marker,
                        verified=False,
                    )
                )

        await audit.record(
            db,
            firm_id=firm_id,
            actor="agent:draft_rfe",
            action="rfe.drafted",
            case_id=case_id,
            detail={"draft_id": str(draft.id), "version": draft.version},
        )

    return {}


async def verification_node(state: RFEState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    async with session_scope() as db:
        draft = await _get_current_draft(db, case_id)
        assert draft is not None
        sections_result = await db.execute(select(DraftSection).where(DraftSection.draft_id == draft.id))
        sections = list(sections_result.scalars().all())

        for section in sections:
            await verify_section(db, section, case_id)

        blocker_count = sum(1 for s in sections if s.status == "needs_attention")
        await audit.record(
            db,
            firm_id=uuid.UUID(state["firm_id"]),
            actor="agent:verification",
            action="rfe.verified",
            case_id=case_id,
            detail={"draft_id": str(draft.id), "sections_needing_attention": blocker_count},
        )

    return {}


async def review_gate_node(state: RFEState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    async with session_scope() as db:
        draft = await _get_current_draft(db, case_id)
        assert draft is not None
        sections_result = await db.execute(
            select(DraftSection).where(DraftSection.draft_id == draft.id).order_by(DraftSection.position)
        )
        sections = list(sections_result.scalars().all())
        summary = [
            {"id": str(s.id), "heading": s.heading, "status": s.status, "confidence": float(s.confidence or 0)}
            for s in sections
        ]

    resume_value = interrupt(
        {
            "gate": "draft_review",
            "draft_id": str(draft.id),
            "sections": summary,
        }
    )

    decision = resume_value["decision"]
    notes = resume_value.get("notes")
    revision_round = state["revision_round"]
    if decision == "revise":
        revision_round += 1

    return {"review_decision": decision, "review_notes": notes, "revision_round": revision_round}


async def finalize_node(state: RFEState) -> dict:
    case_id = uuid.UUID(state["case_id"])
    firm_id = uuid.UUID(state["firm_id"])
    hit_cap = state["review_decision"] == "revise" and state["revision_round"] >= MAX_REVISION_ROUNDS

    async with session_scope() as db:
        case = await db.get(Case, case_id)
        assert case is not None
        case.status = "filed"

        db.add(BillingEvent(firm_id=firm_id, case_id=case_id, event_type="rfe_response", quantity=1, meta={}))

        await audit.record(
            db,
            firm_id=firm_id,
            actor="agent:finalize",
            action="rfe.finalized",
            case_id=case_id,
            detail={"revision_cap_reached": hit_cap, "review_decision": state["review_decision"]},
        )

    return {}


def _route_after_gate(state: RFEState) -> str:
    if state["review_decision"] == "revise" and state["revision_round"] < MAX_REVISION_ROUNDS:
        return "draft_rfe"
    return "finalize"


def build_rfe_graph(checkpointer):
    graph = StateGraph(RFEState)
    graph.add_node("parse_rfe", parse_rfe_node)
    graph.add_node("plan_rebuttals", plan_rebuttals_node)
    graph.add_node("draft_rfe", draft_rfe_node)
    graph.add_node("verification", verification_node)
    graph.add_node("review_gate", review_gate_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "parse_rfe")
    graph.add_edge("parse_rfe", "plan_rebuttals")
    graph.add_edge("plan_rebuttals", "draft_rfe")
    graph.add_edge("draft_rfe", "verification")
    graph.add_edge("verification", "review_gate")
    graph.add_conditional_edges("review_gate", _route_after_gate, ["draft_rfe", "finalize"])
    graph.add_edge("finalize", END)

    return graph.compile(checkpointer=checkpointer)
