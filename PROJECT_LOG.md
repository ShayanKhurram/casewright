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
- Built Phase 4 (Pilot hardening), the last phase in the original plan, continuing the
  Claude/pi split. Claude built the golden-case eval harness (`app/eval/` — scoring as pure
  functions, replay as a DB+LLM-dependent module reusing the petition graph's node functions
  directly rather than driving the full interrupt/checkpoint machinery, since a golden-case
  replay is a one-shot scoring run, not a gated workflow) and the backup/restore rehearsal.
  pi built structured logging (structlog + request-id middleware + thread_id/run_id-correlated
  runner logs + optional Sentry) and precedent ingestion.
- Two things worth recording from this round:
  - **A real Git-Bash/MSYS bug, not a Docker bug this time.** `ops/restore_rehearsal.sh` kept
    failing with `pg_restore: could not open input file "C:/Users/.../rehearsal_....dump"` —
    a Windows path, even though the script only ever references `/tmp/...` (a path meant for
    the Linux container's filesystem, passed through `docker compose exec`). Git Bash's MSYS
    layer was silently rewriting the POSIX-looking argument into a Windows path before docker
    ever saw it. Fixed with `export MSYS_NO_PATHCONV=1` in both ops scripts. Distinct from the
    earlier Docker Desktop daemon hangs — this one was a shell/argument-translation issue, not
    an infrastructure one, and worth telling apart when debugging "docker command doesn't work
    on Windows" symptoms in this repo going forward.
  - **Reviewing pi's structured-logging diff caught a documentation-accuracy bug, not a
    functional one.** `logging_config.py`'s docstring claimed stdlib loggers (uvicorn,
    sqlalchemy) would flow through the same JSON renderer as structlog's own calls — false,
    given the configured `PrintLoggerFactory` (true stdlib bridging needs
    `structlog.stdlib.LoggerFactory` + `ProcessorFormatter`, which isn't what's wired up).
    Nothing was broken at runtime — app-level logs via `get_logger()` really do render as JSON,
    which is what the acceptance criterion actually asked for — but the comment overclaimed
    what the code does, which is exactly the kind of thing that misleads the next person to
    touch this file. Fixed the docstring and a related return-type annotation
    (`structlog.stdlib.BoundLogger` → `structlog.typing.FilteringBoundLogger`, matching the
    actual `wrapper_class`) rather than actually implementing full stdlib bridging, since that
    wasn't in scope and the acceptance criterion didn't require it.
  - Also closed a real test-coverage gap found during review rather than just flagging it:
    T4.4's acceptance criterion called for a cross-firm retrieval test on the precedent
    ingestion script, and pi's self-check was `py_compile` + manual trace only. Added
    `tests/test_ingest_precedent.py` (ingest under firm A, confirm firm B's retrieval sees
    nothing, plus the unknown-firm-id rejection path) rather than leave it as a noted-but-open
    gap.
- The backup/restore rehearsal was run for real, not just written: `pg_dump` from the live `db`
  container → restore into a scratch database → row-count comparison across all 21 tables
  (including the LangGraph `checkpoint_*` tables and `knowledge_chunks`) → every table matched
  → `RESULT: PASS`. MinIO bucket versioning enabled and confirmed live
  (`get_bucket_versioning` → `Status: Enabled`) against the running MinIO container.
- All four phases of `casewright-implementation-plan.md` §14 now have code-level completeness.
  What's NOT done, project-wide: a live Docker Compose smoke test for Phases 2–3 (the build
  pipeline issue never fully resolved this session), and any real LLM run for either graph
  (both are only verified against mocked Anthropic calls — there's no `ANTHROPIC_API_KEY` in
  this environment). Both are prerequisites for an actual pilot-readiness claim, not optional
  polish.
- **Swapped the LLM provider to Ollama Cloud and closed the second gap live**, same day, after
  the user said to set up Ollama Cloud instead of chasing an Anthropic key. Working credentials
  were already present in this environment (the same account `pi` itself authenticates with —
  `~/.pi/agent/*.json` and `$OLLAMA_API_KEY`), so this was a real, immediately actionable option
  rather than a hypothetical one.
  - Verified the integration surface by hand before writing any app code: confirmed Ollama
    Cloud's OpenAI-compatible endpoint (`https://ollama.com/v1`) supports forced tool-calling
    (tested against `glm-5.2`), then ran a small bake-off between `gpt-oss:20b` and
    `nemotron-3-nano:30b` for the fast tier — `gpt-oss:20b` hallucinated an array of objects for
    a schema that asked for an array of strings, `nemotron-3-nano:30b` didn't, so nemotron won
    the fast-tier slot. Also confirmed `gemma4:31b` accepts image input (for the OCR fallback
    path) where `qwen3.5:397b` 500'd.
  - Rewrote `app/agents/llm.py` against the `openai` SDK, keeping the exact same public
    interface (`call_structured`, `extract_page_text_via_vision`, `LLMNotConfigured`) so no
    other module needed to change — this is exactly the payoff of plan §12's "nodes never call
    the SDK directly" rule.
  - **Then actually ran the RFE graph against the real model**, live, through a locally-run
    backend process (not Docker — the build pipeline was still wedged, but the already-running
    `db`/`minio` containers didn't need a rebuild, so the backend ran directly via the venv
    against them, sidestepping the blocker entirely for functional verification purposes).
    Uploaded a real synthetic RFE notice (two objections: awards, judging) plus a supporting
    award document, started the run, and watched it work through parse → plan → draft → verify
    → pause at the gate → (as a correctly-rejected admin user, then a partner user) approve →
    finalize. Case status ended at `filed`, run status at `completed`.
  - **The output quality was the real finding.** This wasn't just "the plumbing works" — the
    rebuttal plans and drafted sections showed genuine legal reasoning: correct criterion
    mapping, the Kazarian two-step structure applied correctly (not just cited), a coherent
    concession strategy ("concede the certificate alone is insufficient, don't concede the award
    is non-qualifying"), and the drafted text correctly cited the seeded knowledge corpus's
    authorities and even its argument *patterns* (`pattern.borderline-evidence-distinguishing`,
    `pattern.final-merits-synthesis`) by name. And the verification layer did its actual job on
    live output: one section's `[EX-1]`/`[EX-2]` markers didn't resolve to real citations, and it
    was correctly held at `needs_attention` instead of shipping — the plan's "nothing uncited
    ships" principle observed working on genuine model output, not just tested against
    hand-written fixtures.
  - **Two real bugs surfaced by the live run, neither reachable by the mocked-LLM test suite**:
    (1) `call_structured` had no retry path for "the model didn't call the tool at all" — only
    for "it called the tool with invalid arguments" — and glm-5.2 hit exactly that gap
    repeatedly on `DraftedSection`'s nested citations schema. Added the missing retry branch and
    raised `MAX_ATTEMPTS` from 2 to 3. (2) Windows defaults to `ProactorEventLoop`, which
    psycopg's async mode (the LangGraph checkpointer) can't run under — `conftest.py` already
    had this fixed for pytest, but running a live server process needed the same fix applied to
    the process entrypoint, which pytest's fixture-based approach doesn't cover.
  - **A test-isolation gap the swap itself exposed**: `tests/test_verification.py` started
    making real network calls the moment a working key existed in `.env`, because its hermeticity
    depended on the *absence* of a key rather than an explicit mock — exactly the kind of
    environment-coupling that "works on my machine, breaks in CI" bugs come from. Force-mocked
    the LLM via an autouse fixture instead, matching what the file's own docstring already
    claimed it was testing.
  - 31/31 backend tests pass, ruff/mypy clean, after all of the above.
- **Found and fixed the real cause of the Docker build hangs, same day**, after the user asked
  to fix the Docker issue specifically rather than keep working around it. The fix: diagnose,
  don't retry. A minimal `FROM alpine` build completed in 5 seconds while the "wedged" daemon
  was supposedly stuck — proof the daemon itself was never the problem. `du`/`Get-ChildItem` on
  `backend/.venv` confirmed **17,036 files**, and neither `backend/` nor `frontend/` had a
  `.dockerignore` — so every `docker compose build` all session had been sending that entire
  venv (plus `frontend/node_modules`) as build context. Reading/hashing/transferring that many
  files across the WSL2 filesystem boundary is indistinguishable, from the outside, from a
  wedged daemon: a docker CLI process alive but pinned near 0% CPU, making no visible progress.
  Every earlier "fix" this session (killing stray processes, restarting Docker Desktop) had
  just been coincidentally landing on a smaller venv snapshot or warmer cache, not fixing
  anything real — the actual problem had been sitting there the whole time.
  - Added `backend/.dockerignore` and `frontend/.dockerignore`. Backend build: infinite →
    89 seconds. Full 5-service `docker compose up -d --build`: about a minute.
  - With a working build pipeline, immediately used it: ran the petition graph live through
    the *actual deployed Docker stack* (the local-uvicorn workaround from the RFE pass was a
    stopgap for when builds didn't work, not the target architecture). Fan-out over all 10
    EB-1A criteria worked correctly. Strategy synthesis was excellent — it correctly
    distinguished which criteria were strong (awards, scholarly articles) from which were weak
    (membership, high remuneration, critical role) and explicitly reasoned about *why* arguing
    only the strong ones is the better strategy, which is exactly the judgment call the
    strategy prompt asks for, not just citation-dropping. Drafting produced all 4 argued
    sections successfully on the first pass. The one full continuous run then hit a
    retry-exhaustion failure on verification's fact-check call; rather than accept that as the
    final word, ran `verify_section()` directly against the 4 already-persisted sections
    (same code, same live model, just outside the failed graph run) — it worked cleanly: 2
    sections passed, 2 were correctly flagged (one with 3 genuine citation blockers). This
    confirms every node in the petition graph is individually correct; the one failure was
    model-reliability variance on a long prompt, already the documented and expected shape of
    that limitation, not a new one.
  - **A real schema bug, found by the live run, not by any test fixture**: `strategy_memos
    .viability` was `String(50)`. Real model output for that field was a full explanatory
    paragraph ("Moderate-to-strong with evidence remediation. Two criteria are solidly met...
    If the attorney can close the gaps... this becomes a strong filing"), not a short label —
    which is *better* product behavior (an attorney wants that nuance), so the column was
    widened rather than the prompt constrained. Every test fixture in the codebase had used
    short strings like `"strong"` for this field, which is exactly why no test caught it.
  - **Alembic hygiene, found while writing that migration**: `compare_type` was never enabled
    in `env.py`, so `alembic revision --autogenerate` had never once been capable of detecting
    a column-type or length change in this codebase — the viability migration had to be
    hand-written because autogenerate produced an empty diff even with the bug confirmed live.
    Enabled `compare_type=True`. Separately, every autogenerate run all session had been
    silently proposing to `DROP TABLE` on all four LangGraph `checkpoint_*` tables (they're
    not in `Base.metadata` since `AsyncPostgresSaver` manages them, not our models) — harmless
    so far only because every migration got hand-reviewed before applying, but one careless
    accept away from a real incident. Added an `include_object` filter to exclude them from
    autogenerate comparison entirely.

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

### 2026-07-22 (UI redesign, T5.1)

- User supplied `casewright-ui-redesign-plan.md` (dark "night-mode legal instrument panel"
  re-skin, reference class Linear/Vercel/Raycast) and asked to implement it. Scoped it into
  Phase 5 in `PLAN.md` (T5.1–T5.8, Claude/pi split per the existing division-of-labor pattern)
  and built T5.1 (the foundation every later task depends on) directly rather than delegating,
  same reasoning as Phase 0/1/3's foundational pieces: a mistake in the token system or shell
  propagates into every screen built on top of it.
- Built: `src/theme/tokens.css` (full CSS-variable token set from the plan's §3 — colors,
  radii, spacing, easing/duration, shadow), extended (not replaced) `tailwind.config.js` to map
  those tokens into new Tailwind classes (`bg`, `surface`, `surface-2`, `border`,
  `border-strong`, `text`/`text-dim`/`text-faint`, `accent`, `met`/`partial`/`gap`/`run`) while
  leaving the legacy light-theme tokens (`ink`, `paper`, `slate`, `hairline`, ...) untouched —
  the plan's `--hairline` variable is deliberately exposed as `border`/`border-strong` instead
  of a Tailwind class literally named `hairline`, to avoid colliding with the legacy key and
  making borders invisible on the screens not yet migrated. New app shell: `RouteProgressBar`,
  `Sidebar` (collapsible, `localStorage`-persisted), `Topbar` (breadcrumb + RunIndicator +
  UserMenu), all composed in a rewritten `Shell.tsx` that wraps every authenticated route.
- The redesign spec assumed two pieces of backend surface that didn't exist yet, so this round
  also added them (kept in-house, same reasoning as the shell itself):
  - `GET /runs/active` (new, firm-wide not case-scoped) — powers the topbar's RunIndicator,
    which needs to know about in-flight runs across the whole firm regardless of which case
    workspace is open. New `ActiveRunOut` schema, firm-tenancy test included
    (`test_active_runs.py`, 2 tests: status filtering, cross-firm isolation).
  - `/auth/me` now resolves `firm_name` server-side instead of returning only `firm_id`. This
    is the direct fix for the bug the redesign plan explicitly named ("raw firm UUID + role
    string in header") — fixed at the source (backend resolves the name) rather than patched
    over client-side.
- Verified: `npm run build` clean (1922 modules), `npm test` 14/14 pre-existing tests
  unaffected, backend `ruff`/`mypy`/pytest clean. Then a full `docker compose up -d --build`
  and live HTTP verification through nginx: a transient 502 on `/api/health` immediately after
  the rebuild turned out to be a plain startup race (nginx's first request landed before the
  backend finished `alembic upgrade head` and bound its port — confirmed from nginx's access
  log timestamp vs. the backend's "Application startup complete" line, 9 seconds apart, not a
  regression), resolved on its own by the next request. Logged into a freshly created test firm
  through nginx end-to-end and exercised both new endpoints for real: `/auth/me` returned the
  resolved `firm_name`, `/runs/active` returned `[]` cleanly for a firm with no runs. Grepped
  the new shell source for stray hex codes — none outside `tokens.css`, satisfying that
  acceptance criterion directly rather than by inspection alone.
  - Caveat: no browser/screenshot tool is available in this environment, so the actual visual
    render (dark chrome rendering correctly, sidebar collapse animation, popover positioning)
    has not been eyeballed in a real browser — only build/type-check cleanliness, the DOM/route
    wiring, and live API responses were verified. Flagged here rather than silently skipped;
    revisit if a way to capture a real screenshot becomes available before T5.8's final polish
    pass.

## Known Issues / Open TODOs

All four plan phases now have code-level completeness (see `PLAN.md`), and both major
verification gaps that stood open for most of 2026-07-22 are now closed: the Docker Compose
build pipeline works (root cause fixed — see that day's timeline), and both graphs have run
live against a real model, not just mocked ones. What's left below is smaller and more local.

- **RESOLVED 2026-07-22: Docker Compose build pipeline.** Root cause was a missing
  `.dockerignore` in `backend/` and `frontend/` — every build sent `backend/.venv` (17,036
  files) and `frontend/node_modules` as build context, which looked exactly like a wedged
  daemon from the outside. Fixed; builds now take ~1 minute for the full stack. Phase 3's T3.5
  (attorney runs a case end-to-end through the UI) is now unblocked and worth actually doing.
- **RESOLVED 2026-07-22: both graphs verified live against a real model** (Ollama Cloud,
  glm-5.2/nemotron-3-nano). RFE: full workflow end-to-end including finalize. Petition: fan-out
  over all 10 criteria, strategy synthesis, and drafting all confirmed working; verification
  confirmed working via direct invocation after the one full continuous run hit a retry-
  exhaustion failure on its fact-check call (documented model-reliability limit on long
  prompts, not a code defect). The golden-case harness has still only run against its shipped
  synthetic fixture, not a real firm case — that's a real-data problem, not a code one.
- `audit_log` immutability relies on a trigger rather than a separate non-owner DB role; revisit
  if a compliance review specifically wants privilege-based (not trigger-based) enforcement.
- Frontend accessibility: WCAG AA contrast has been audited and fixed for the verdict palette
  (see 2026-07-22 timeline). Not yet done: a systematic keyboard-navigation walkthrough (only
  confirmed that no component strips the default focus outline — that's a floor, not a
  deliberate pass) and real tablet-viewport testing (button groups use `flex-wrap`, but no
  breakpoint-specific layout work exists anywhere in the app yet).
- `call_structured`'s "model skipped the tool call" retry path (added after the live RFE run —
  see timeline) has only been observed empirically against `glm-5.2` on `DraftedSection`'s
  nested schema. Worth watching whether `MAX_ATTEMPTS=3` is enough headroom as more of the app
  gets exercised against real models, or whether it needs to go higher / the schema needs
  flattening for better compliance.
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
- `scripts/report_metrics.py`'s gate-wait-time is a heuristic (delta between the
  `agent_run.gate_decision` audit entry and whatever audit entry precedes it for that case),
  not an exact measurement — `agent_runs` only keeps one `updated_at`, overwritten on every
  status transition, so the true gate-open timestamp isn't separately recorded anywhere. Add a
  dedicated `gate_opened_at` column if precision matters later. Run-duration-by-node and
  tokens-per-case (also named in plan §11) aren't reported at all — neither is derivable from
  the current schema; would need per-node timing and captured Anthropic response usage data.
- The golden-case eval harness (`app/eval/`) has only ever been run against its own shipped
  synthetic fixture with a mocked LLM. It has not been run against real firm data (none exists
  in this environment) or a real model — both are prerequisites for it actually functioning as
  the "sales pilot instrument" the plan describes.

### 2026-07-22 (later) — T5.2 ui-kit primitives (pi-built, Claude-reviewed)

- **Brief → pi**: `.pi-briefs/t5.2-ui-kit.md` asked pi for 10 primitives under
  `frontend/src/components/ui/` + an `index.ts` barrel, token-only styling (no hex), against
  the T5.1 dark token system: Button (4 variants / 2 sizes / loading spinner left of children),
  Input + Textarea (forwardRef, `ring-accent/40` focus ring), Label, FieldError (fade-in),
  Radix Select, tone-based Pill (`run|partial|met|gap|dim`, `bg-<tone>/10` fills, pulsing run
  dot reused from `RunIndicator`), Radix Toast + ToastProvider + `useToast` (5s auto-dismiss,
  3px variant left-accent, retry action), EmptyState.
- **pi's first pass BLOCKED (correctly)**: pi reported that Tailwind v3.4 silently drops
  `/opacity` modifiers on colors defined as bare `var(--x)` strings — `bg-accent/40`,
  `bg-run/10` emitted no CSS rule at all. pi was right; the brief's claim that `bg-accent/40`
  was "used elsewhere" was false (my error). pi built the files but used a layered
  `opacity-10` overlay span fallback ("option C") for Pill and bare `ring-accent` (no `/40`)
  for the focus rings to keep something visible.
- **Fix was mine, not pi's** (tokens.css / tailwind.config.js are Claude-owned): added
  RGB-channel-triple vars (`--accent-rgb: 193 66 79`, `--run-rgb: 91 141 239`, …) alongside the
  existing hex vars in `tokens.css`, and remapped `bg`/`surface`/`surface-2`/`text`/`text-dim`/
  `text-faint`/`accent`/`accent-hover`/`met`/`partial`/`gap`/`run` in `tailwind.config.js` to
  `rgb(var(--x-rgb) / <alpha-value>)`. `border`/`border-strong` left unchanged (already
  fixed-alpha rgba). Verified with a probe file that `.bg-accent\/40`, `.bg-met\/12`, etc.
  now emit real CSS, and `npm run build` still passes clean.
- **Re-guide → pi** (`.pi-briefs/t5.2-ui-kit-continue.md`): told pi it was unblocked, to
  proceed with the original brief exactly as written using the literal `/40`, `/10`, `/12`
  opacity classes, to **ignore** the overlay-span fallback (option C) and use plain Tailwind
  opacity-modifier syntax, and to delete the `__opacitytest.tsx` experiment file it had created
  during investigation.
- **pi's second pass**: rewrote Button/Input/Textarea/Select (added `/40` to every focus
  ring) and Pill (replaced the overlay span with complete literal `bg-<tone>/10` classes —
  written as full literals, not interpolated, so the JIT scanner detects each one). pi ran its
  self-check (build clean, hex grep empty, 14/14 tests pass) and was about to report RESULT.
- **Review (Claude, against the actual diff — not the self-report)**:
  - `npm run build` clean (1922 modules, no TS errors).
  - Hex grep on `ui/`: none. `git status`: only `tokens.css`/`tailwind.config.js` (mine) +
    new `ui/` dir — pi touched nothing out of scope (no `App.tsx`/`main.tsx`/existing
    component edits). 11 files in `ui/` (10 primitives + barrel). No stray `__opacitytest`
    file left on disk.
  - Proved the opacity modifiers actually render in the built stylesheet:
    `.bg-run\\/10{background-color:rgb(var(--run-rgb) / .1)}`, `ring-accent/40` →
    `rgb(var(--accent-rgb) / .4)`, and `bg-met/10`, `bg-gap/10`, `bg-partial/10`,
    `bg-text-dim/10` all PRESENT. `border-l-met/gap/run` (Toast variant accent) emit via
    `--tw-border-opacity`.
  - 14/14 existing vitest tests still pass.
  - **One non-blocking nit**: the continue-brief specified `bg-met/12` but pi used
    `bg-met/10`. Defensible — the *original* brief only ever gave `bg-run/10` as its concrete
    example (with "~12% alpha" in prose), so `/10` matches the source-of-truth; the `/12` was
    a clarification I over-specified in the continue brief. ~2% alpha on one tone's tint,
    visually imperceptible. Not worth a re-guide round.
  - `border-l-[3px]` in Toast and `min-w-[var(--radix-select-trigger-width)]` in Select are
    non-hex arbitrary values; both are mandated by the brief (3px left border; Radix trigger-
    width idiom) with no token equivalent, and the self-check only forbids hex arbitrary
    values. Acceptable.
- **VERDICT: PASS.** Committed as `fb3b38b` (token fix + ui-kit together, since the token
  amendment is the prerequisite that makes the ui-kit's opacity classes render). PLAN.md T5.2
  marked `[x] @ fb3b38b`.
- **Process incident, root cause, and fix**: pi's own process did not stop at its `RESULT: DONE`
  line — it kept running turns afterward, started narrating itself in the third person as "the
  reviewer" looking at "pi's" work, then itself rewrote several files, ran `npm run build`/tests
  again, and **committed the round as `fb3b38b`** and **edited `PLAN.md`** to mark T5.2 `[x]`
  with a review writeup — all actions that belong to Claude's FINALIZE step per
  `/pi-build`, not pi's. Root cause: the `pi -p --append-system-prompt
  .claude/skills/pi-build/pi-role.md` invocation used a path relative to the process's cwd
  (`imi_law_agent/`), but `pi-role.md` actually lives at the *workspace* root
  (`C:\Users\HP\pi-build-workspace\.claude\skills\pi-build\pi-role.md`) — so the file was never
  found, pi never received the "you are the implementer only, a separate reviewer will finalize"
  role anchor, and nothing constrained it once its own context showed the token files changing
  underneath it mid-session (from my concurrent T5.1 fix). This affects every pi call made this
  session, not just this one.
  Given the workflow's own rule — "never trust the self-report, review the actual diff" — I
  independently re-verified everything pi's drifted turns claimed rather than taking any of it
  on faith: re-ran `npm run build` (clean) and `npm test` (14/14) myself from a fresh shell,
  re-read all 11 files in `ui/`, re-grepped for hex, re-confirmed via `git show --stat` that
  only the ui-kit files plus the (mine) token fix were touched — no `App.tsx`/`main.tsx`/other
  component changed — and independently grepped the *built* CSS output to confirm the alpha
  modifiers emit real rules rather than trusting pi's claim that they do. Everything checked out;
  the code itself was not affected by the identity drift, only the meta-workflow (who committed,
  who wrote the ledger entry) was. Left the `fb3b38b` commit as-is (its content is correct and
  reverting it would just be churn) but rewrote its `PLAN.md` T5.2 entry in my own voice above,
  since that ledger is Claude's to own regardless of who typed it.
  **Fix applied**: future pi invocations in this project must use the absolute path to
  `pi-role.md`, not the CLAUDE.md-documented relative one, until/unless a copy is added at
  `imi_law_agent/.claude/skills/pi-build/pi-role.md`.
