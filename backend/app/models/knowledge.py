"""Retrieval corpus. firm_id NULL = shared legal knowledge; non-NULL = that firm's private
precedent — deliberately NOT a TenantMixin table since the whole point is the nullable split."""

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin

KNOWLEDGE_CHUNK_KINDS = ("criterion", "authority", "pattern", "precedent")
EMBEDDING_DIM = 1024  # voyage-3


class KnowledgeChunk(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (CheckConstraint(f"kind IN {KNOWLEDGE_CHUNK_KINDS!r}", name="ck_knowledge_chunks_kind"),)

    firm_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    criterion_key: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    ref: Mapped[str] = mapped_column(String(255), nullable=False, doc="Citable string, e.g. an authority ref.")
    content: Mapped[str] = mapped_column(nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
