"""Structlog setup: JSON-rendered logs with a per-request context (request_id, thread_id,
run_id) propagated via contextvars so nested graph-node calls inherit identifiers without
passing them explicitly (plan §4.2)."""

import logging
import sys

import structlog
from structlog.contextvars import merge_contextvars


def configure_logging() -> None:
    """Configure structlog once at process boot. JSON output is required so log lines are
    machine-ingestible downstream (e.g. Sentry/ELK). This wires structlog's own call sites
    (app.logging_config.get_logger(...).info(...)) to render as JSON via PrintLoggerFactory —
    it does NOT bridge third-party stdlib logging (uvicorn access logs, sqlalchemy engine
    logs, etc.) into the same renderer; those still print via the stdlib formatter below.
    Full bridging would need structlog.stdlib.LoggerFactory + ProcessorFormatter instead —
    worth doing if/when those libraries' logs need to land in the same JSON pipeline."""
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format="%(message)s",
    )

    structlog.configure(
        processors=[
            merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.typing.FilteringBoundLogger:
    """Thin wrapper around structlog.get_logger so callers don't import structlog directly.
    Matches wrapper_class above (make_filtering_bound_logger) — NOT structlog.stdlib.BoundLogger,
    since logger_factory is PrintLoggerFactory, not structlog.stdlib.LoggerFactory."""
    return structlog.get_logger(name)