"""Case root, uploaded documents, and normalized facts extracted from them."""

import uuid
from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDPKMixin

VISA_CATEGORIES = ("O-1A", "EB-1A")

CASE_STATUSES = (
    "intake",
    "analyzing",
    "strategy_review",
    "drafting",
    "draft_review",
    "ready_to_file",
    "filed",
    "rfe_received",
    "rfe_review",
    "approved",
    "denied",
)

DOCUMENT_KINDS = (
    "cv",
    "recommendation_letter",
    "publication",
    "award",
    "press",
    "employment",
    "prior_filing",
    "rfe_notice",
    "other",
)


class Case(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "cases"
    __table_args__ = (
        CheckConstraint(f"visa_category IN {VISA_CATEGORIES!r}", name="ck_cases_visa_category"),
        CheckConstraint(f"status IN {CASE_STATUSES!r}", name="ck_cases_status"),
    )

    beneficiary_name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_of_endeavor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visa_category: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="intake")
    profile: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    filing_deadline: Mapped[date | None] = mapped_column(nullable=True)


class Document(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "documents"
    __table_args__ = (CheckConstraint(f"kind IN {DOCUMENT_KINDS!r}", name="ck_documents_kind"),)

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    exhibit_label: Mapped[str | None] = mapped_column(
        String(16), nullable=True, doc='The handle drafts cite, e.g. "EX-3".'
    )
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(nullable=True)
    classification_confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)


class ExtractedFact(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "extracted_facts"

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fact_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    source_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    source_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_quote: Mapped[str | None] = mapped_column(nullable=True)
