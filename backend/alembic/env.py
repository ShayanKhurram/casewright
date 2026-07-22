"""Alembic runs synchronously (psycopg) even though the app is async (asyncpg) — migrations
don't need to be async, and it keeps this file simple."""

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.config import get_settings
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """LangGraph's AsyncPostgresSaver owns the checkpoint_* tables (created by
    scripts/setup_checkpointer.py, not by our SQLAlchemy models) — exclude them from
    autogenerate so a careless `alembic revision --autogenerate` never proposes dropping them
    just because they're not in Base.metadata."""
    if type_ == "table" and name is not None and name.startswith("checkpoint"):
        return False
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
