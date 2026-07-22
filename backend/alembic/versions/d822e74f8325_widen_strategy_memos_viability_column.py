"""widen strategy_memos.viability column

Found live: strategy_node's real model output for viability is a nuanced explanatory
assessment ("Moderate — viable for O-1A with evidence development; not yet ready for EB-1A
without closing gaps in X, Y, Z"), not a short label — String(50) was a schema-design mistake
that only surfaced once a real model actually produced realistic output for the field.

Revision ID: d822e74f8325
Revises: c71cabce4bf1
Create Date: 2026-07-22 02:22:19.623719
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d822e74f8325"
down_revision: Union[str, None] = "c71cabce4bf1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "strategy_memos",
        "viability",
        existing_type=sa.String(length=50),
        type_=sa.String(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "strategy_memos",
        "viability",
        existing_type=sa.String(),
        type_=sa.String(length=50),
        existing_nullable=True,
    )
