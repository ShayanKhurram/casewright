"""RFE graph state. Every field here is an identifier or control flag — never a heavy artifact.
Nodes write facts/plans/drafts to Postgres as they run (see plan §5)."""

from typing import TypedDict

MAX_REVISION_ROUNDS = 2


class RFEState(TypedDict):
    case_id: str
    firm_id: str
    rfe_notice_id: str
    rfe_document_id: str
    objection_ids: list[str]
    review_decision: str | None
    review_notes: str | None
    revision_round: int
