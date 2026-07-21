"""Drafts are versioned; the review unit is the section, not the whole document."""

import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDPKMixin

DRAFT_KINDS = ("petition_letter", "support_letter", "expert_letter", "rfe_response")
SECTION_STATUSES = ("generated", "needs_attention", "approved", "revision_requested")
CITATION_SOURCE_TYPES = ("exhibit", "authority")


class Draft(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "drafts"
    __table_args__ = (CheckConstraint(f"kind IN {DRAFT_KINDS!r}", name="ck_drafts_kind"),)

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class DraftSection(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "draft_sections"
    __table_args__ = (CheckConstraint(f"status IN {SECTION_STATUSES!r}", name="ck_draft_sections_status"),)

    draft_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drafts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    heading: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(nullable=False, default="")
    criterion_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="generated")
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    verification_notes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reviewer_comment: Mapped[str | None] = mapped_column(nullable=True)


class Citation(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "citations"
    __table_args__ = (
        CheckConstraint(f"source_type IN {CITATION_SOURCE_TYPES!r}", name="ck_citations_source_type"),
    )

    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("draft_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(10), nullable=False)
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    authority_ref: Mapped[str | None] = mapped_column(
        String(255), nullable=True, doc='e.g. "8 CFR 204.5(h)(3)(i)".'
    )
    marker: Mapped[str] = mapped_column(String(20), nullable=False, doc='e.g. "[EX-3]".')
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
