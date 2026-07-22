"""Async engine/session setup. Nodes and routes never manage transactions manually — session_scope does."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

# pool_size + max_overflow deliberately small and explicit, not SQLAlchemy's default (5 + 10 =
# 15). Supabase's session pooler caps at 15 *total* clients for the whole project, shared with
# the LangGraph checkpointer's own separate connection (app/agents/checkpointer.py) and any
# concurrent request. A 10-way Send fan-out (assess_criterion, EB-1A's 10 criteria) checking out
# a connection per branch can by itself reach the default pool's ceiling — confirmed live
# against Supabase (EMAXCONNSESSION errors mid-run). Keeping this well under 15 makes the engine
# queue extra checkouts briefly instead of bursting past what the pooler actually allows.
engine = create_async_engine(settings.database_url, pool_pre_ping=True, pool_size=5, max_overflow=2)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def session_scope() -> AsyncGenerator[AsyncSession, None]:
    """Commits on clean exit, rolls back on exception. Business logic never calls commit/rollback itself."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency. Routes get a session scoped to the request; commit/rollback handled here."""
    async with session_scope() as session:
        yield session
