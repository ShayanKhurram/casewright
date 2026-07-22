"""Graph state. Every field here is an identifier or control flag — never a heavy artifact.
Nodes write facts/plans/drafts to Postgres as they run (see plan §5)."""

import operator
from typing import Annotated, TypedDict

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


class PetitionState(TypedDict):
    case_id: str
    firm_id: str
    visa_category: str
    assessed_criteria: Annotated[list[str], operator.add]
    """Reduce channel: each parallel assess_criterion branch contributes its criterion_key here.
    The graph runtime joins all Send branches before any node that reads this list runs next."""
    strategy_decision: str | None
    strategy_notes: str | None
    review_decision: str | None
    review_notes: str | None
    revision_round: int


class CriterionAssessInput(TypedDict):
    """The per-branch payload Send() delivers to assess_criterion — deliberately not a subset
    of PetitionState, since each branch only needs enough to do its one criterion's work."""

    case_id: str
    firm_id: str
    criterion_key: str
