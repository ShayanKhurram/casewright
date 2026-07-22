"""Agent runs, the audit trail, and billing events. audit_log is append-only at the DB grant
level (see alembic/versions — INSERT/SELECT only, no UPDATE/DELETE) because it is the
malpractice-defensibility story: it must not be editable even by a compromised app role."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TenantMixin, TimestampMixin, UUIDPKMixin

AGENT_RUN_GRAPHS = ("petition", "rfe")
AGENT_RUN_STATUSES = ("running", "waiting_review", "completed", "failed")


class AgentRun(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "agent_runs"
    __table_args__ = (
        CheckConstraint(f"graph IN {AGENT_RUN_GRAPHS!r}", name="ck_agent_runs_graph"),
        CheckConstraint(f"status IN {AGENT_RUN_STATUSES!r}", name="ck_agent_runs_status"),
    )

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    graph: Mapped[str] = mapped_column(String(20), nullable=False)
    thread_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, doc="LangGraph checkpointer key.")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    current_gate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gate_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(nullable=True)
    progress: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        doc=(
            "Live graph-execution progress written by app/agents/runner.py as it streams node "
            "start/finish events (redesign plan §6's PipelineTracker): "
            "{current_node, completed_nodes: [...], node_timestamps: {node: {started_at, "
            "finished_at}}, fan_out: {node: {done, total}}}. Graph topology itself is a frontend "
            "constant per graph type, not stored here — this column is only the dynamic state."
        ),
    )


class AuditLog(Base, UUIDPKMixin, TenantMixin):
    __tablename__ = "audit_log"

    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False, doc='e.g. "user:jane@…" or "agent:strategy".')
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class BillingEvent(Base, UUIDPKMixin, TenantMixin, CreatedAtMixin):
    __tablename__ = "billing_events"
    __table_args__ = (
        CheckConstraint("event_type IN ('petition_package','rfe_response')", name="ck_billing_events_type"),
    )

    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
