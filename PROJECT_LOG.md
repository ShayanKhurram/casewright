# Casewright — Project Log

## Overview

Immigration argumentation engine for O-1A/EB-1A boutiques (petition + RFE workflows), built
behind attorney review gates. Full design in `casewright-implementation-plan.md`. Stack:
FastAPI + SQLAlchemy 2 async + PostgreSQL 16/pgvector, LangGraph agent layer (from Phase 1),
React + Vite + Tailwind frontend, Docker Compose → single VPS.

Run it: see `README.md` (`docker compose up -d --build`, then `scripts/create_firm.py`).
Tests: `cd backend && pytest` (needs a reachable Postgres — `docker compose up -d db`).

## Architecture & Key Decisions

- **Tenant isolation is structural, not query-discipline.** Every tenant table carries `firm_id`;
  the only sanctioned way a route touches a `Case` is `app/api/deps.py:get_case_scoped`, which
  filters by the caller's firm and 404s (not 403) on a cross-tenant id, so there's no existence
  leak. Verified with a real end-to-end test (two firms, real HTTP stack, not just unit-level).
- **Audit log immutability via a Postgres trigger, not a GRANT.** The plan's data model
  (§4) calls for "DB grant: INSERT/SELECT only — no UPDATE/DELETE" on `audit_log`. A `REVOKE`
  doesn't actually bind the table *owner*, and the app's runtime role and migration-owning role
  are the same in this deployment (single DB user for simplicity in Phase 0). A
  `BEFORE UPDATE OR DELETE` trigger that raises an exception binds every role including the
  owner, so it was used instead — a stronger guarantee for a simpler setup. Splitting into a
  separate non-owner runtime DB role (closer to the letter of the spec) is a reasonable Phase 1+
  hardening step if a stricter compliance posture is needed, but the trigger already delivers
  the actual guarantee (nothing can mutate an audit row).
- **Tests run against real Postgres, not sqlite.** The schema uses JSONB and pgvector, which
  sqlite can't represent, and the tenancy test is exactly the kind of thing an in-memory
  substitute would falsely pass. `tests/conftest.py` provisions a `casewright_test` database and
  wraps each test in a rolled-back transaction/savepoint for isolation.
- **`engine` fixture is function-scoped, not session-scoped.** pytest-asyncio gives each test
  function its own event loop by default; asyncpg connections are bound to the loop that created
  them and break with "attached to a different loop" if reused across loops. Function-scoped
  fixtures cost a bit of per-test overhead (schema create/drop) but sidestep this correctly.
- **Alembic autogenerate needed two manual fixes** it doesn't do on its own: the `pgvector`
  import for the `Vector` column type, and `CREATE EXTENSION IF NOT EXISTS vector` before the
  table that uses it. Both are now baked into `alembic/versions/..._initial_schema.py`.
- **`ruff` config**: line-length raised to 120 (100 was fighting docstrings and SQLAlchemy
  `CheckConstraint` lines with no readability win), `B008` (Depends-in-default) ignored since
  that's the idiomatic FastAPI pattern, `alembic/versions/` excluded from lint since it's
  generated code.
- **Frontend is a deliberately thin Phase 0 shell** — login + case list, wired to the real API,
  styled with the §9 design tokens (ink/paper/oxblood/verdict colors, Source Serif 4 + Inter +
  IBM Plex Mono) — proves the Compose pipeline and auth flow end-to-end without doing Phase 3's
  actual product UI work early.

## Timeline

### 2026-07-22

- Built Phase 1 (RFE engine — the wedge product) directly, same as Phase 0: user again asked
  to build it directly rather than via the pi-delegation loop. Scope: document upload with
  native PDF extraction + vision-OCR fallback, the 18-criterion knowledge corpus with hybrid
  pgvector retrieval, the Anthropic router with tool-forced structured output + one self-repair
  retry, the RFE LangGraph (parse → plan_rebuttals → draft → verification → interrupt gate →
  finalize) with a bounded revision loop and `AsyncPostgresSaver` checkpointing, the runner
  module, the verification layer, the run/rfe/draft API surface, and a minimal Case Workspace
  UI (Evidence/RFE/Drafts tabs, gate banner, section reviewer, deadline badge).
- Testing strategy: unit test for the revision-loop bound (pure function, no infra), integration
  tests for citation-integrity verification and document upload (storage mocked so the suite
  doesn't need MinIO), and a real graph-mechanics test that runs the full RFE graph against a
  live Postgres checkpointer with only the Anthropic calls mocked — this is what caught that
  `session_scope()` (used directly by graph nodes, not through FastAPI's `get_db`) and the
  LangGraph checkpointer both needed to be redirected at the test database; a new `graph_db`
  fixture in `conftest.py` monkeypatches `app.db.async_session_factory` and the checkpointer's
  `database_url_sync` for the duration of the test.
- Two defects caught only by the live Docker end-to-end pass, not by the (green) unit suite —
  worth recording because they're the kind of bug that only shows up under real multi-process/
  real-network conditions:
  - **Checkpointer boot race.** `uvicorn --workers 2` runs the FastAPI lifespan once per worker;
    both workers called `AsyncPostgresSaver.setup()` concurrently, and its internal migration
    DDL isn't safe under concurrent execution (`UniqueViolation` on `checkpoint_migrations`).
    Fix: moved checkpointer setup out of the lifespan into `scripts/setup_checkpointer.py`, run
    once in `entrypoint.sh` before `uvicorn` starts — the same one-time-pre-boot pattern already
    used for `alembic upgrade head`. Also hardened `ensure_bucket()` (which *does* stay in the
    lifespan) against the analogous MinIO race by tolerating `BucketAlreadyOwnedByYou`.
  - **Presigned URL used the container-internal host.** `S3_ENDPOINT_URL=http://minio:9000` is
    correct for backend→MinIO traffic inside the Compose network, but a presigned URL built
    against it is unreachable from a browser. Since SigV4 signs the `Host` header, the fix isn't
    a string-replace after generation (that would invalidate the signature) — it's a second
    boto3 client (`_presign_client`) constructed against a separate `S3_PUBLIC_ENDPOINT_URL`
    used only for `generate_presigned_url`.
  - Also caught in the same pass: `pymupdf.open()` raises on a corrupt/garbage PDF, which was
    turning a bad upload into a 500. Now caught and degraded to `classification_confidence=0.0`
    with the file still stored (plan §16's "scanned/garbage documents" risk, handled).
  - And a schema bug the migration autogenerate step (correctly) forced a second look at:
    `citations.marker` was `String(20)`, too short for an authority citation like
    `[8 CFR 204.5(h)(3)(i)]` (22 chars). Widened to `String(255)` via a proper new migration
    (`c71cabce4bf1`), not a hand-edit of the already-applied Phase 0 migration.
- Verified for real: full `docker compose up -d --build` from a stopped state, `seed_knowledge`
  (18 criteria / 4 authorities / 3 patterns, confirmed idempotent), `create_firm`, uploaded a
  real generated RFE-notice PDF through the live API (native text extracted, `EX-1` assigned,
  presigned URL fetched and returned 200), started an RFE run with no `ANTHROPIC_API_KEY`
  configured and confirmed the run reaches `status=failed` with a legible error rather than
  hanging — the correct behavior for a credential-less dev environment, not a bug. 16/16 backend
  tests pass, ruff/mypy clean, frontend `npm run build` clean.

### 2026-07-21

- Built Phase 0 (Foundation) directly — user explicitly asked to skip the pi-delegation loop
  ("do it yourself") for this build, so it was implemented directly rather than via the usual
  pi-build brief/review cycle. Scope: repo scaffold, Docker Compose (db/minio/backend/frontend/
  nginx), all 14 SQLAlchemy models from plan §4, initial Alembic migration, JWT auth + RBAC,
  firm-scoped tenancy dependency, audit log (with the trigger-based immutability decision above),
  onboarding scripts, integration tests, CI workflow, and a minimal frontend shell.
- Verified for real, not just by inspection: `alembic upgrade head` against a live Postgres
  container; the audit-log trigger manually confirmed to block both `UPDATE` and `DELETE`;
  `pytest` (5/5, including the non-negotiable cross-firm isolation test) against real Postgres;
  `ruff check` and `mypy` clean; then a full `docker compose up -d --build` from a stopped state
  (~4m40s including image pulls, comfortably under the plan's 15-minute budget) with an
  end-to-end HTTP smoke test through nginx: created two firms via `create_firm.py`, logged in as
  each, firm A created a case, confirmed firm B gets 404 on a direct-id read and an empty list,
  firm A can read its own case, and unauthenticated requests get 401.
- No corrections needed this round (single-pass build, not a pi review cycle) — the two things
  that needed fixing were caught and fixed during the build itself: the autogenerated migration's
  missing pgvector import/extension statement, and the test suite's event-loop-per-fixture
  mismatch (session-scoped engine fixture vs. function-scoped pytest-asyncio loops).

## Known Issues / Open TODOs

- Phases 2–4 (petition engine, product UI, pilot hardening) are not started — see `PLAN.md`.
- `audit_log` immutability relies on a trigger rather than a separate non-owner DB role; revisit
  if a compliance review specifically wants privilege-based (not trigger-based) enforcement.
- Frontend has no test coverage yet (RFE workspace shell only, built quickly to unblock Phase 1
  verification); Phase 3 is where the real component suite and its tests land, along with the
  full theme (verdict rails, criterion matrix, etc. — only a subset of §9's component inventory
  exists so far).
- LLM-dependent nodes (parse_rfe, plan_rebuttals, draft_rfe, and verification's fact-check) are
  only tested with a mocked LLM — there is no `ANTHROPIC_API_KEY` in this dev environment, so a
  real end-to-end run (real notice in, real drafted rebuttal out) has not been observed, only the
  graceful-failure path (no key configured → `status=failed`) and the mocked graph mechanics.
  Worth a real run against a live key before calling the RFE wedge pilot-ready.
- Document upload doesn't auto-classify `kind` — the uploader picks it from a dropdown. The plan
  frames per-document classification as an intake-node (LLM) responsibility for the petition
  workflow; whether RFE-workflow uploads should also get auto-classification is a Phase 2
  question, not decided yet.
- `knowledge_chunks` embeddings use the hash fallback in this environment (no `VOYAGE_API_KEY`)
  — deterministic but not semantically meaningful, so retrieval quality has not been evaluated,
  only retrieval *plumbing* (the query runs, returns rows, respects tenant/kind/criterion
  filters).
