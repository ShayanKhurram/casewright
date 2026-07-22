"""LangGraph checkpointing via Postgres — every graph step is persisted, and thread_id
(== agent_runs.thread_id) is the resumption key (plan §5)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.config import get_settings

settings = get_settings()


def _psycopg_url() -> str:
    """AsyncPostgresSaver wants a plain postgresql:// URL, not the SQLAlchemy dialect prefix."""
    return settings.database_url_sync.replace("postgresql+psycopg://", "postgresql://")


@asynccontextmanager
async def get_checkpointer() -> AsyncIterator[AsyncPostgresSaver]:
    async with AsyncPostgresSaver.from_conn_string(_psycopg_url()) as saver:
        yield saver


async def setup_checkpointer_tables() -> None:
    """Idempotent (CREATE TABLE IF NOT EXISTS internally) — safe to call on every backend boot."""
    async with AsyncPostgresSaver.from_conn_string(_psycopg_url()) as saver:
        await saver.setup()
