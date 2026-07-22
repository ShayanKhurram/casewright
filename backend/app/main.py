"""App factory. Routers own their own prefixes; this just wires CORS, request-id logging
middleware, optional Sentry, and mounts /api."""

import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api import assessment, audit, auth, cases, deadlines, documents, drafts, health, qa, rfe, rollups, runs
from app.config import get_settings
from app.logging_config import configure_logging
from app.services.storage import ensure_bucket

configure_logging()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # LangGraph checkpoint-table setup runs once, pre-boot, in entrypoint.sh — not here.
    # With multiple uvicorn workers each running this lifespan, concurrent DDL from
    # AsyncPostgresSaver.setup() races (see scripts/setup_checkpointer.py).
    if settings.sentry_dsn:
        # Local import keeps the dependency optional: dev/test envs without sentry-sdk
        # installed must still import app.main cleanly.
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn)
    await ensure_bucket()
    yield


app = FastAPI(title="Casewright API", lifespan=lifespan)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next) -> Response:
    """Binds a per-request id into structlog's contextvars so every log line emitted while
    handling the request carries it, and surfaces it on the response for client correlation."""
    request_id = str(uuid.uuid4())
    structlog.contextvars.bind_contextvars(request_id=request_id)
    try:
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        structlog.contextvars.clear_contextvars()


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(documents.firmwide_router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(rfe.router, prefix="/api")
app.include_router(drafts.router, prefix="/api")
app.include_router(assessment.router, prefix="/api")
app.include_router(qa.router, prefix="/api")
app.include_router(rollups.router, prefix="/api")
app.include_router(deadlines.router, prefix="/api")
app.include_router(audit.router, prefix="/api")