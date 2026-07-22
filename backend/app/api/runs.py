"""Starting and driving agent runs (plan §8). Gate decisions are role-guarded: partner/associate."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import runner
from app.api.deps import get_case_scoped, get_current_user, get_run_scoped, require_role
from app.db import get_db
from app.models.case import Case, Document
from app.models.ops import AgentRun
from app.models.rfe import RFENotice
from app.models.tenant import User
from app.schemas.run import GateDecisionRequest, RunOut, StartRFERunRequest
from app.services import audit

router = APIRouter(tags=["runs"])


@router.post("/cases/{case_id}/runs/petition", response_model=RunOut, status_code=201)
async def start_petition_run(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    case: Case = Depends(get_case_scoped),
) -> AgentRun:
    await audit.record(
        db,
        firm_id=case.firm_id,
        actor=f"user:{current_user.email}",
        action="petition_run.started",
        case_id=case.id,
        detail={},
    )
    await db.flush()

    run_id, _task = await runner.start_run(
        case_id=case.id,
        firm_id=case.firm_id,
        graph="petition",
        initial_state={
            "case_id": str(case.id),
            "firm_id": str(case.firm_id),
            "visa_category": case.visa_category,
            "assessed_criteria": [],
            "strategy_decision": None,
            "strategy_notes": None,
            "review_decision": None,
            "review_notes": None,
            "revision_round": 0,
        },
    )

    run = await db.get(AgentRun, run_id)
    assert run is not None
    return run


@router.post("/cases/{case_id}/runs/rfe", response_model=RunOut, status_code=201)
async def start_rfe_run(
    payload: StartRFERunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    case: Case = Depends(get_case_scoped),
) -> AgentRun:
    document = await db.get(Document, payload.document_id)
    if document is None or document.case_id != case.id:
        raise HTTPException(status_code=422, detail="document_id does not belong to this case")

    notice = RFENotice(firm_id=case.firm_id, case_id=case.id, document_id=document.id)
    db.add(notice)
    await db.flush()
    notice_id = notice.id

    case.status = "rfe_received"

    await audit.record(
        db,
        firm_id=case.firm_id,
        actor=f"user:{current_user.email}",
        action="rfe_run.started",
        case_id=case.id,
        detail={"notice_id": str(notice_id), "document_id": str(document.id)},
    )
    await db.flush()

    run_id, _task = await runner.start_run(
        case_id=case.id,
        firm_id=case.firm_id,
        graph="rfe",
        initial_state={
            "case_id": str(case.id),
            "firm_id": str(case.firm_id),
            "rfe_notice_id": str(notice_id),
            "rfe_document_id": str(document.id),
            "objection_ids": [],
            "review_decision": None,
            "review_notes": None,
            "revision_round": 0,
        },
    )

    run = await db.get(AgentRun, run_id)
    assert run is not None
    return run


@router.get("/cases/{case_id}/runs", response_model=list[RunOut])
async def list_runs(
    db: AsyncSession = Depends(get_db),
    case: Case = Depends(get_case_scoped),
) -> list[AgentRun]:
    result = await db.execute(
        select(AgentRun).where(AgentRun.case_id == case.id).order_by(AgentRun.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/runs/{run_id}/gate", response_model=RunOut)
async def submit_gate_decision(
    payload: GateDecisionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("partner", "associate")),
    run: AgentRun = Depends(get_run_scoped),
) -> AgentRun:
    if run.status != "waiting_review":
        raise HTTPException(status_code=409, detail=f"Run is not awaiting review (status={run.status})")

    await audit.record(
        db,
        firm_id=run.firm_id,
        actor=f"user:{current_user.email}",
        action="agent_run.gate_decision",
        case_id=run.case_id,
        detail={"run_id": str(run.id), "gate": run.current_gate, "decision": payload.decision},
    )
    await db.flush()

    await runner.resume_run(run_id=run.id, decision=payload.decision, notes=payload.notes)

    await db.refresh(run)
    return run
