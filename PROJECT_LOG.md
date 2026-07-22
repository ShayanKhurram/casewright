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

- Built Phase 2 (Petition engine) the same day, this time genuinely splitting work with pi per
  the user's instruction ("use pi-build... distribute the work with yourself and pi"), rather
  than building everything directly as in Phases 0–1. Claude built the petition LangGraph
  (`petition_graph.py`: intake → profile → `Send`-based fan-out over all 8 O-1A / 10 EB-1A
  criteria → assess_criterion → strategy → gate → drafting → verification → gate → finalize,
  two independently bounded revision loops) and its API endpoints — the fan-out/reduce-channel
  mechanic and the state-shape-coupled endpoints were kept in-house rather than delegated,
  consistent with `PLAN.md`'s stated reasoning (getting a `Send` join wrong is hard to catch
  from outside). pi built `CriterionMatrix` and `StrategyMemo`, the two frontend components
  that could be scoped as pure presentational components against a known prop shape,
  independent of the backend work — genuine parallelism, not sequential work relabeled as
  parallel. Reviewed pi's actual diff (not its self-report, which claimed everything was
  correct): one real defect — the strategy-memo decision badge rendered green for *both*
  "approved" and "revision requested," which misrepresents a revision request as a success
  state. Fixed (amber for revision requested). Everything else in pi's diff matched the brief
  on the first pass; no re-guide round was needed. Claude then wired both components into
  `CaseWorkspace` as new Criteria/Strategy tabs once the live API existed.
- **pi CLI session-syntax finding** (operational, not a bug in this codebase, but worth
  recording so it isn't rediscovered the hard way next time): the pattern in this workspace's
  `CLAUDE.md` — `--session-dir .pi-sessions --session build-<slug>` — fails on a first-time
  session with `No session found matching '<slug>'`. `--session` only *resumes* an existing
  session by id/partial-UUID; it doesn't create one from a bare slug. The fix is to pass a full
  file path with extension for first creation — `--session .pi-sessions/build-<slug>.jsonl` —
  which both creates the session on first use and resumes it (since the file now exists) on
  every subsequent re-guide call with the identical flag.
- **Docker Desktop instability, mid-session.** The daemon became unresponsive for an extended
  stretch (`docker ps` and `docker compose` hanging indefinitely) after several rapid
  build/up/down cycles. Diagnosis: `Get-Process docker,docker-compose` showed a growing pile of
  zombie CLI client processes from commands that had been backgrounded after hitting tool
  timeouts — these appear to have queued up and wedged the daemon's connection handling.
  `Stop-Process` on the stray `docker`/`docker-compose` processes plus a full Docker Desktop
  restart resolved it once; it recurred once more later in the session (same symptom, same
  fix). **Net effect: Phase 2's live Docker Compose smoke test was not completed** — test-level
  verification (pytest against real Postgres, ruff, mypy, frontend build) is solid, but the
  "does the actual stack deploy and run this code" check that Phase 0/1 both got is a genuine
  gap for Phase 2. Do that check before treating Phase 2 as pilot-ready. If Docker instability
  recurs on this machine, check for a pileup of stray docker CLI processes first before
  assuming the daemon itself is broken.
- **The Docker issue recurred a second and third time** on Phase 3 attempts (same near-zero-CPU
  wedge signature, this time specifically in `docker compose build` — `docker ps` and non-build
  compose operations, e.g. starting the already-pulled `minio` image, worked fine throughout,
  isolating the problem to the image-build path specifically). Tried `DOCKER_BUILDKIT=0` to rule
  out a BuildKit-specific bug — same wedge, so it's not BuildKit-specific. Asked the user how to
  proceed rather than keep burning cycles on infrastructure outside this session's control; they
  chose to continue with test-level verification and accept the deploy-check gap for now.
- Built Phase 3 (Product UI) with a genuine Claude/pi split, continuing the pattern from Phase 2.
  pi built `Shell` (nav, JWT-decoded firm/role display, sign-out), `AgentRunTimeline`,
  `OverviewTab` (beneficiary profile + run timeline, defensively typed against the untyped
  `case.profile` JSON blob), and `DeadlineRing` (a real SVG progress ring replacing the Phase 1
  `DeadlineBadge` text countdown, static/unanimated so `prefers-reduced-motion` is trivially
  satisfied). One small defect on review: an unused `color` variable applied to an SVG element's
  className where nothing inherited `currentColor` from it — dead code, removed; otherwise clean.
  Claude built the frontend test infrastructure (vitest + RTL, new tooling worth setting up
  deliberately rather than delegating blind), a first real test suite, and — the most valuable
  part of this round — an actual WCAG AA contrast audit of the plan's §9 verdict palette rather
  than a cosmetic "looks fine" pass. Computed relative luminance and contrast ratios by hand for
  every verdict color against its actual usage background and found two real failures: (1)
  `verdict-partial` (#B0770A, amber) is 3.7:1 on `paper` — passes WCAG's 3:1 threshold for
  borders/UI components but fails the 4.5:1 threshold that applies to actual body text, and it
  was being used as text color in five places (CriterionMatrix's gaps note, StrategyMemo's
  warning lists and decision badge, StatusPill's revision/waiting badges, DeadlineBadge); added
  `verdict-partial-text` (#8F6208, 5.2:1) for those, kept the brand amber for borders/pills. (2)
  `Shell`'s user-info text used the standard secondary-text token (`slate`) on its dark `bg-ink`
  header — `slate` on `ink` is ~2.9:1, which fails AA even for large text; switched to
  `hairline` (~12.7:1 on `ink`), an existing token, no new one needed. Writing the GateBanner
  test also surfaced an unrelated but real bug: `decide()` had no error handling, so a failed
  gate request (e.g. hitting the 409 when a run already moved past `waiting_review`) became a
  silent unhandled promise rejection — fixed with the same catch+setError pattern used
  everywhere else data gets mutated in this app.
- T3.5 (the actual "attorney runs a case end-to-end through the UI" walkthrough) is blocked on
  the Docker issue above — it needs a live stack, not component-level tests. Left undone rather
  than faked.

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

- Phase 4 (pilot hardening) is not started — see `PLAN.md`.
- **No live Docker Compose smoke test since Phase 1** (Docker Desktop's build pipeline has been
  wedged for the rest of this session — see 2026-07-22 timeline). Phases 2 and 3 both have solid
  test-level verification (real Postgres, real graph execution or component tests, mocked LLM
  only) but not the "deploys and runs for real" check that Phase 0/1 got. Phase 3's T3.5 (the
  actual attorney-runs-a-case-through-the-UI walkthrough) is explicitly blocked on this. Do a
  full live-stack pass across Phases 2–3 before any pilot-readiness claim.
- `audit_log` immutability relies on a trigger rather than a separate non-owner DB role; revisit
  if a compliance review specifically wants privilege-based (not trigger-based) enforcement.
- Frontend accessibility: WCAG AA contrast has been audited and fixed for the verdict palette
  (see 2026-07-22 timeline). Not yet done: a systematic keyboard-navigation walkthrough (only
  confirmed that no component strips the default focus outline — that's a floor, not a
  deliberate pass) and real tablet-viewport testing (button groups use `flex-wrap`, but no
  breakpoint-specific layout work exists anywhere in the app yet).
- LLM-dependent nodes (all reasoning/fast-tier nodes in both graphs, plus verification's
  fact-check) are only tested with a mocked LLM — there is no `ANTHROPIC_API_KEY` in this dev
  environment, so a real end-to-end run (real documents in, real drafted output out) has not
  been observed for either graph, only the graceful-failure path (no key configured →
  `status=failed`) and mocked graph mechanics. Worth a real run against a live key before
  calling either workflow pilot-ready.
- Document upload doesn't auto-classify `kind` — the uploader picks it from a dropdown, for both
  workflows. The plan frames per-document classification as an intake-node (LLM) responsibility;
  Phase 2's `intake_node` extracts facts but does not reclassify `kind` after upload. Revisit if
  auto-classification turns out to matter in practice.
- `knowledge_chunks` embeddings use the hash fallback in this environment (no `VOYAGE_API_KEY`)
  — deterministic but not semantically meaningful, so retrieval quality has not been evaluated,
  only retrieval *plumbing* (the query runs, returns rows, respects tenant/kind/criterion
  filters). This affects both graphs' retrieval-grounded nodes equally.
- Petition drafting (`drafting_node`) versions the whole `petition_letter` draft on every
  redraft (same pattern as RFE), but unlike RFE, a petition revision loop restarts from
  `strategy` (not just `drafting`) when `strategy_gate` sends `revise` — meaning
  `criteria_to_argue` can change between draft versions. Not a bug (each redraft correctly
  reflects the latest strategy), but worth knowing: draft version N and N+1 aren't necessarily
  arguing the same set of criteria.
- Frontend test coverage exists now (vitest + RTL, 14 tests) but is intentionally narrow —
  GateBanner, CriterionMatrix, StrategyMemo only, per the plan's "highest-value components"
  scoping. Shell, OverviewTab, AgentRunTimeline, DeadlineRing, and every data-fetching tab
  component (EvidenceTab, CriteriaTab, StrategyTab, DraftsTab, RFETab) have zero test coverage.
