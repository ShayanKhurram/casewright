"""add agent_runs progress column

T5.3 (UI redesign plan §6, PipelineTracker): the runner now streams node
start/finish events while a graph executes and writes them here, so the
frontend's progress tracker is truthful (driven by the real graph) rather
than simulated.

Revision ID: 0da14565c97a
Revises: d822e74f8325
Create Date: 2026-07-22 13:19:57.682524
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0da14565c97a"
down_revision: Union[str, None] = "d822e74f8325"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agent_runs",
        sa.Column("progress", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
    )
    op.alter_column("agent_runs", "progress", server_default=None)


def downgrade() -> None:
    op.drop_column("agent_runs", "progress")
