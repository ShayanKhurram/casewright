"""RFE notice decomposition: one notice, many per-criterion objections."""

import uuid
from datetime import date

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDPKMixin


class RFENotice(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "rfe_notices"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    issued_date: Mapped[date | None] = mapped_column(nullable=True)
    response_deadline: Mapped[date | None] = mapped_column(
        nullable=True, doc="Drives the deadline ring in the RFE workspace."
    )
    summary: Mapped[str | None] = mapped_column(nullable=True)


class RFEObjection(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "rfe_objections"

    notice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rfe_notices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    criterion_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    officer_claim: Mapped[str] = mapped_column(nullable=False)
    deficiency_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rebuttal_plan: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
