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
(pgvector) behind Nginx, LangGraph agent layer lands in Phase 1+, React/Vite/Tailwind frontend.
