"""Drives graphs in a background task until END or the next interrupt (plan §5). Queue-shaped
on purpose (one entrypoint keyed by thread_id) so promotion to a dedicated worker later is a
transport change, not a redesign."""

import asyncio
import uuid

import structlog
from langgraph.types import Command

from app.agents.checkpointer import get_checkpointer
from app.agents.criteria import criteria_for
from app.agents.petition_graph import build_petition_graph
from app.agents.rfe_graph import build_rfe_graph
from app.agents.state import PetitionState, RFEState
from app.db import session_scope
from app.logging_config import get_logger
from app.models.ops import AgentRun

log = get_logger(__name__)

GRAPH_BUILDERS = {"rfe": build_rfe_graph, "petition": build_petition_graph}

# Nodes that run via langgraph.types.Send fan-out (one "task"/"task_result" debug event per
# parallel branch, not one for the node as a whole) — only petition_graph's assess_criterion
# does this today. Maps node name -> a function computing the fan-out total from the graph's
# *initial* input, so the tracker can show "n/m" instead of just a running count. Only ever
# consulted on a fresh `start_run` (input is the real state dict); a `resume_run`'s input is a
# `Command`, which never contains this info, but assess_criterion never re-runs after resume in
# either graph's current topology, so that gap is never actually hit.
FAN_OUT_TOTALS = {
    "assess_criterion": lambda state: len(criteria_for(state["visa_category"])),
}


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
    structlog.contextvars.bind_contextvars(run_id=str(run_id), thread_id=thread_id)
    log.info("agent_run.drive_start", graph=graph_name)
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async with get_checkpointer() as checkpointer:
            graph = GRAPH_BUILDERS[graph_name](checkpointer)
            await _stream_with_progress(graph, initial_state, config, run_id)
            await _sync_status(graph, config, run_id)
    except Exception as exc:
        log.error("agent_run.drive_failed", error=str(exc))
        await _mark_failed(run_id, str(exc))
    finally:
        structlog.contextvars.clear_contextvars()


async def _resume(run_id: uuid.UUID, graph_name: str, thread_id: str, decision: str, notes: str | None) -> None:
    structlog.contextvars.bind_contextvars(run_id=str(run_id), thread_id=thread_id)
    log.info("agent_run.resume_start", graph=graph_name, decision=decision)
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async with get_checkpointer() as checkpointer:
            graph = GRAPH_BUILDERS[graph_name](checkpointer)
            resume_input: Command = Command(resume={"decision": decision, "notes": notes})
            await _stream_with_progress(graph, resume_input, config, run_id)
            await _sync_status(graph, config, run_id)
    except Exception as exc:
        log.error("agent_run.resume_failed", error=str(exc))
        await _mark_failed(run_id, str(exc))
    finally:
        structlog.contextvars.clear_contextvars()


async def _stream_with_progress(
    graph, input_: RFEState | PetitionState | Command, config: dict, run_id: uuid.UUID
) -> None:
    """Drives the graph via `astream(..., stream_mode="debug")` instead of `ainvoke` so that
    `agent_runs.progress` reflects node start/finish as they actually happen (redesign plan §6's
    PipelineTracker needs this to be truthful, not simulated from the final state). Each
    "task"/"task_result" debug event is one node execution — for Send-fan-out nodes (e.g.
    assess_criterion), each parallel branch gets its own pair of events, which is what makes a
    live "n/m" fan-out counter possible."""
    progress: dict = {"current_node": None, "completed_nodes": [], "node_timestamps": {}, "fan_out": {}}

    async for chunk in graph.astream(input_, config, stream_mode="debug"):
        event_type = chunk.get("type")
        if event_type not in ("task", "task_result"):
            continue
        payload = chunk.get("payload") or {}
        name = payload.get("name")
        if not name:
            continue
        timestamp = chunk.get("timestamp")
        progress["current_node"] = name
        node_ts = progress["node_timestamps"].setdefault(name, {})

        if event_type == "task":
            # Overwritten (not setdefault) each time so a revision-loop re-entry into an
            # already-visited node resets its elapsed-time baseline instead of accumulating
            # across rounds; also drop it from completed_nodes since it's active again.
            node_ts["started_at"] = timestamp
            if name in progress["completed_nodes"]:
                progress["completed_nodes"].remove(name)
            if name in FAN_OUT_TOTALS and name not in progress["fan_out"]:
                total = FAN_OUT_TOTALS[name](input_) if isinstance(input_, dict) else 0
                progress["fan_out"][name] = {"done": 0, "total": total}
        else:  # task_result
            node_ts["finished_at"] = timestamp
            interrupted = bool(payload.get("interrupts"))
            if name in progress["fan_out"]:
                fan = progress["fan_out"][name]
                fan["done"] = min(fan["done"] + 1, fan["total"]) if fan["total"] else fan["done"] + 1
                if fan["done"] >= fan["total"] and name not in progress["completed_nodes"]:
                    progress["completed_nodes"].append(name)
            elif not interrupted and name not in progress["completed_nodes"]:
                # A gate node's task_result with non-empty interrupts means it PAUSED here for
                # human review, not that it finished — don't mark it done; current_node staying
                # on the gate name is what tells the frontend "waiting here."
                progress["completed_nodes"].append(name)

        await _write_progress(run_id, progress)


async def _write_progress(run_id: uuid.UUID, progress: dict) -> None:
    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        if run is not None:
            run.progress = progress


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
            log.info("agent_run.paused", current_gate=run.current_gate)
        else:
            run.status = "completed"
            run.current_gate = None
            run.gate_payload = {}
            log.info("agent_run.completed")


async def _mark_failed(run_id: uuid.UUID, error: str) -> None:
    log.error("agent_run.marked_failed", error=error)
    async with session_scope() as db:
        run = await db.get(AgentRun, run_id)
        if run is not None:
            run.status = "failed"
            run.error = error
