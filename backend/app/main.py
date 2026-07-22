"""App factory. Routers own their own prefixes; this just wires CORS and mounts /api."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, cases, documents, drafts, health, rfe, runs
from app.config import get_settings
from app.services.storage import ensure_bucket

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # LangGraph checkpoint-table setup runs once, pre-boot, in entrypoint.sh — not here.
    # With multiple uvicorn workers each running this lifespan, concurrent DDL from
    # AsyncPostgresSaver.setup() races (see scripts/setup_checkpointer.py).
    await ensure_bucket()
    yield


app = FastAPI(title="Casewright API", lifespan=lifespan)

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
app.include_router(runs.router, prefix="/api")
app.include_router(rfe.router, prefix="/api")
app.include_router(drafts.router, prefix="/api")
