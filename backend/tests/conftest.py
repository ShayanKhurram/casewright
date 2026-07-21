"""Integration tests run against a real Postgres (casewright_test), not sqlite — the schema
uses Postgres-only types (JSONB, pgvector) that sqlite can't represent. Each test runs inside
a transaction that's rolled back afterward, so tests never see each other's rows.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models.base import Base

settings = get_settings()


def _test_db_url() -> str:
    base, _, _ = settings.database_url.rpartition("/")
    return f"{base}/casewright_test"


@pytest_asyncio.fixture
async def engine():
    """Function-scoped (not session-scoped): pytest-asyncio gives each test function its own
    event loop, and asyncpg connections can't cross event loops — so the engine that owns
    them must be scoped to match."""
    admin_engine = create_async_engine(settings.database_url, isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        exists = await conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = 'casewright_test'")
        )
        if exists.scalar_one_or_none() is None:
            await conn.execute(text("CREATE DATABASE casewright_test"))
    await admin_engine.dispose()

    test_engine = create_async_engine(_test_db_url())
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    yield test_engine

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    connection = await engine.connect()
    trans = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    session = session_factory()

    yield session

    await session.close()
    await trans.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def anyio_backend():
    return "asyncio"
