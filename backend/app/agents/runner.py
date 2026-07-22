"""Drives graphs in a background task until END or the next interrupt (plan §5). Queue-shaped
on purpose (one entrypoint keyed by thread_id) so promotion to a dedicated worker later is a
transport change, not a redesign."""

import asyncio
import uuid

from langgraph.types import Command

from app.agents.checkpointer import get_checkpointer
from app.agents.petition_graph import build_petition_graph
from app.agents.rfe_graph import build_rfe_graph
from app.agents.state import PetitionState, RFEState
from app.db import session_scope
from app.models.ops import AgentRun

GRAPH_BUILDERS = {"rfe": build_rfe_graph, "petition": build_petition_graph}


async def start_run(
    *, case_id: uuid.UUID, firm_id: uuid.UUID, graph: str, initial_state: RFEState | PetitionState
) -> tuple[uuid.UUID, asyncio.Task]:
    """Returns (run_id, task) — API callers can ignore the task (it's already scheduled and
    runs in the background); tests await it directly to observe the run reach its next pause."""
    thread_id = str(uuid.uuid4())
    async with session_scope() as db:
        run = AgentRun(firm_id=firm_id, case_id=case_id, graph=graph, thread_id=thread_id, status="running")
        db.add(run)
        await db.flush()
        run_id = run.id

    task = asyncio.create_task(_drive(run_id, graph, thread_id, initial_state))
    return run_id, task


async def resume_run(*, run_id: uuid.UUID, decision: str, notes: str | None) -> asyncio.Task:
    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        graph, thread_id = run.graph, run.thread_id
        run.status = "running"

    return asyncio.create_task(_resume(run_id, graph, thread_id, decision, notes))


async def _drive(
    run_id: uuid.UUID, graph_name: str, thread_id: str, initial_state: RFEState | PetitionState
) -> None:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async with get_checkpointer() as checkpointer:
            graph = GRAPH_BUILDERS[graph_name](checkpointer)
            await graph.ainvoke(initial_state, config)
            await _sync_status(graph, config, run_id)
    except Exception as exc:
        await _mark_failed(run_id, str(exc))


async def _resume(run_id: uuid.UUID, graph_name: str, thread_id: str, decision: str, notes: str | None) -> None:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async with get_checkpointer() as checkpointer:
            graph = GRAPH_BUILDERS[graph_name](checkpointer)
            await graph.ainvoke(Command(resume={"decision": decision, "notes": notes}), config)
            await _sync_status(graph, config, run_id)
    except Exception as exc:
        await _mark_failed(run_id, str(exc))


async def _sync_status(graph, config: dict, run_id: uuid.UUID) -> None:
    snapshot = await graph.aget_state(config)
    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        assert run is not None
        if snapshot.next:
            run.status = "waiting_review"
            interrupts = snapshot.tasks[0].interrupts if snapshot.tasks else ()
            payload = interrupts[0].value if interrupts else {}
            run.gate_payload = payload
            run.current_gate = payload.get("gate")
        else:
            run.status = "completed"
            run.current_gate = None
            run.gate_payload = {}


async def _mark_failed(run_id: uuid.UUID, error: str) -> None:
    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        if run is not None:
            run.status = "failed"
            run.error = error
