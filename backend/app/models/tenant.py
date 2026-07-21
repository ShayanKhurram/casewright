"""Firms (tenants) and users. Every other tenant table hangs off firms via firm_id."""

from sqlalchemy import Boolean, CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, UUIDPKMixin

USER_ROLES = ("admin", "partner", "associate", "paralegal")


class Firm(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "firms"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    style_notes: Mapped[str | None] = mapped_column(
        String, nullable=True, doc="House voice injected into drafting prompts (phase 2+)."
    )


class User(Base, UUIDPKMixin, TenantMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin','partner','associate','paralegal')", name="ck_users_role"),)

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
