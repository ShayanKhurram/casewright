"""Pure unit test of the revision-loop bound (plan §13: "revision-loop bounds" is one of the
things graph tests must verify) — no DB, no graph, no LLM needed."""

from app.agents.rfe_graph import _route_after_gate
from app.agents.state import MAX_REVISION_ROUNDS


def test_approve_routes_to_finalize():
    state = {"review_decision": "approve", "revision_round": 0}
    assert _route_after_gate(state) == "finalize"


def test_revise_under_cap_loops_back_to_draft():
    state = {"review_decision": "revise", "revision_round": MAX_REVISION_ROUNDS - 1}
    assert _route_after_gate(state) == "draft_rfe"


def test_revise_at_cap_forces_finalize():
    state = {"review_decision": "revise", "revision_round": MAX_REVISION_ROUNDS}
    assert _route_after_gate(state) == "finalize"
