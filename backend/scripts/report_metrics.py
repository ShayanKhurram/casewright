"""Reports the two operational metrics from plan §11 that are actually derivable from the
current schema without new instrumentation: verification blocker rate and gate wait time.

NOT included here (a real gap, not an oversight — see docs/internal/PROJECT_LOG.md): run duration by node
and tokens per case. Neither is derivable today. Node-level timing would need a per-node
start/end timestamp (agent_runs only has one updated_at, overwritten on every transition,
so individual node durations within a run aren't reconstructable after the fact). Token usage
would need the Anthropic response's usage block captured somewhere (app/agents/llm.py
currently discards it). Both need new columns before this script can report them.

Run: python -m scripts.report_metrics
"""

import asyncio
from datetime import timedelta

from sqlalchemy import select

from app.db import session_scope
from app.models.draft import DraftSection
from app.models.ops import AuditLog


async def verification_blocker_rate() -> tuple[int, int]:
    """Returns (needs_attention_count, total_count) across all draft sections ever produced."""
    async with session_scope() as db:
        total = (await db.execute(select(DraftSection))).scalars().all()
        blocked = [s for s in total if s.status == "needs_attention"]
        return len(blocked), len(total)


async def gate_wait_times() -> list[timedelta]:
    """Approximates gate wait time as the delta between each 'agent_run.gate_decision' audit
    entry and the most recent PRECEDING audit entry for the same case — which in practice is
    whatever node just finished right before the graph paused (verification, strategy, etc.).
    This is a heuristic, not an exact "interrupt() called at T0" timestamp — agent_runs only
    keeps updated_at (overwritten on every transition), so the actual gate-open moment isn't
    separately recorded anywhere today. Good enough for a rough operational signal; revisit
    with a dedicated gate_opened_at column if precision matters.
    """
    async with session_scope() as db:
        rows = (
            await db.execute(
                select(AuditLog).where(AuditLog.case_id.isnot(None)).order_by(AuditLog.case_id, AuditLog.at)
            )
        ).scalars().all()

    waits: list[timedelta] = []
    previous_by_case: dict = {}
    for row in rows:
        prior = previous_by_case.get(row.case_id)
        if row.action == "agent_run.gate_decision" and prior is not None:
            waits.append(row.at - prior.at)
        previous_by_case[row.case_id] = row
    return waits


async def main() -> None:
    blocked, total = await verification_blocker_rate()
    rate = blocked / total if total else 0.0
    print(f"Verification blocker rate: {rate:.1%} ({blocked}/{total} draft sections)")

    waits = await gate_wait_times()
    if waits:
        avg_seconds = sum(w.total_seconds() for w in waits) / len(waits)
        print(f"Gate wait time (approx., n={len(waits)}): avg {avg_seconds:.0f}s")
    else:
        print("Gate wait time: no resolved gates yet.")


if __name__ == "__main__":
    asyncio.run(main())
