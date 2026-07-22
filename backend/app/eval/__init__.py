"""Golden-case evaluation harness (plan §13). Replays assess_criterion/strategy/drafting
against a firm's own decided cases and scores agreement with the real outcome. Split into
scoring.py (pure functions, no DB/LLM — the part that's actually unit-testable without a
running model) and replay.py (the DB+LLM-dependent replay itself)."""
