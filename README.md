# Casewright

Immigration argumentation engine for O-1A / EB-1A boutiques. See `casewright-implementation-plan.md`
for the full design; `PROJECT_LOG.md` for build history; `PLAN.md` for the task ledger.

## Quickstart (local)

```
cp .env.example .env
docker compose up -d --build
docker compose exec backend python -m scripts.create_firm --name "Your Firm" --email admin@yourfirm.test --password change-me
```

- App: http://localhost:8080
- API: http://localhost:8080/api (direct backend also on :8000)
- MinIO console: http://localhost:9001

## Backend development

```
cd backend
python -m venv .venv && .venv/Scripts/activate  # or source .venv/bin/activate on macOS/Linux
pip install -r requirements-dev.txt
```

Point `DATABASE_URL` / `DATABASE_URL_SYNC` at a running Postgres (e.g. `docker compose up -d db`,
which publishes on host port 5433) and run:

```
alembic upgrade head
ruff check .
mypy app
pytest
```

Tests run against a real Postgres (`casewright_test`, created automatically) — the schema uses
Postgres-only types (JSONB, pgvector) that sqlite can't represent, and the cross-firm tenancy
test is the one that actually matters.

## Frontend development

```
cd frontend
npm install
npm run dev
```

## Architecture

See `casewright-implementation-plan.md` §2–§3. In short: FastAPI + SQLAlchemy async + Postgres
(pgvector) behind Nginx, LangGraph agent layer (RFE + petition graphs), React/Vite/Tailwind
frontend.

## Operations

```
ops/backup_db.sh                       # pg_dump the live db into ./backups/ (gitignored)
ops/restore_rehearsal.sh <dump-file>   # restore into a scratch db, verify row counts, clean up
```

Both scripts talk to the running `db` compose service via `docker exec` — no local `pg_dump`/
`psql` install needed. Rehearse restores quarterly, not just after writing the backup script once.

```
python -m scripts.eval_golden_cases --fixtures-dir eval_fixtures   # golden-case eval harness
python -m scripts.ingest_precedent --firm-id <uuid> --file f.txt --ref "..."  # firm precedent
python -m scripts.report_metrics                                    # verification blocker rate, gate wait time
```

The eval harness's `eval_fixtures/` ships one clearly-labeled *synthetic* example — real usage
means a firm supplying their own closed cases in the same JSON format (see
`app/eval/schemas.py`), not fixtures shipped with the repo.

Structured JSON logs (`structlog`) are on by default; set `SENTRY_DSN` to enable error tracking
(no-op, not an error, when unset).
