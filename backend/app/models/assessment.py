"""The criterion matrix and the strategy memo it feeds into."""

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDPKMixin

VERDICTS = ("met", "partial", "weak", "absent")


class CriterionAssessment(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "criterion_assessments"
    __table_args__ = (
        CheckConstraint(f"verdict IN {VERDICTS!r}", name="ck_criterion_assessments_verdict"),
        UniqueConstraint("case_id", "criterion_key", name="uq_criterion_assessments_case_criterion"),
    )

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    criterion_key: Mapped[str] = mapped_column(String(100), nullable=False, doc='e.g. "eb1a.awards".')
    verdict: Mapped[str] = mapped_column(String(10), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    reasoning: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, doc="{standard, analysis, gaps}"
    )
    evidence_refs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class StrategyMemo(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "strategy_memos"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recommended_category: Mapped[str | None] = mapped_column(String(10), nullable=True)
    viability: Mapped[str | None] = mapped_column(nullable=True)
    """Unbounded, not a short label — found live: the model gives a nuanced assessment
    ("Moderate — viable for O-1A with evidence development; not yet ready for EB-1A without
    closing gaps in X, Y, Z"), not a single word, and that's the right behavior for an
    attorney-facing product. String(50) was a schema-design mistake, not a model problem."""
    criteria_to_argue: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    criteria_to_abandon: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    evidence_gaps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    rfe_risks: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    narrative: Mapped[str | None] = mapped_column(nullable=True)
    attorney_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    attorney_notes: Mapped[str | None] = mapped_column(nullable=True)
