# Casewright — Implementation Plan
### Production build plan for an immigration argumentation engine (O-1A / EB-1A boutiques)

This document specifies everything needed to build the system: scope, architecture, stack, data model, agent design (LangGraph), verification, API, frontend and UI theme, security, infrastructure, engineering standards, testing, delivery phases, costs, and risks.

---

## 1. Scope of v1

The product automates the judgment layer of employment-based petitions behind attorney review gates. Version 1 ships two workflows on two visa categories (O-1A and EB-1A):

**Petition workflow.** Document intake → fact extraction → beneficiary profile → criterion-by-criterion eligibility assessment → strategy memo → attorney gate → drafting with inline exhibit citations → automated verification → attorney gate → finalized package.

**RFE workflow.** Notice upload → objection parsing → per-objection rebuttal planning → response drafting → verification → attorney gate → finalized response. This is the wedge product and gets built first inside the shared architecture.

Out of scope for v1: CMS integrations (import/export only), e-filing, additional visa types (NIW, L-1A, H-1B come in phase 4), client-facing portals, payments automation (billing events are recorded; invoicing is manual).

## 2. Architecture overview

```
┌──────────────────────  Frontend (React + Vite + Tailwind)  ─────────────────────┐
│  Dashboard · Case Workspace (Evidence / Criterion Matrix / Strategy /           │
│  Drafts / RFE) · Review gates (approve / revise)                                │
└──────────────▲──────────────────────────────────────────────────────────────────┘
               │ REST + JWT (firm-scoped)
┌──────────────┴──────────────────  FastAPI backend  ─────────────────────────────┐
│  api/       auth · cases · documents · runs · drafts · rfe                      │
│  services/  storage (S3) · doc processing (PDF text + vision OCR) · audit       │
│  agents/    LangGraph engine                                                    │
└──────┬──────────────────────────────────────┬───────────────────────────────────┘
       │                                      │
┌──────▼─────────────┐              ┌─────────▼──────────────────────────────────┐
│ PostgreSQL 16      │              │ LangGraph runtime                          │
│  + pgvector        │              │  Petition graph: intake → profile →        │
│  app tables        │              │   fan-out per criterion → strategy →       │
│  knowledge corpus  │              │   ⏸ gate → drafting → verification →       │
│  graph checkpoints │              │   ⏸ gate → finalize                        │
└────────────────────┘              │  RFE graph: parse → plan → draft →         │
                                    │   verification → ⏸ gate → finalize        │
┌────────────────────┐              └─────────┬──────────────────────────────────┘
│ MinIO / S3         │                        │
│  document objects  │              ┌─────────▼─────────┐  ┌────────────────────┐
└────────────────────┘              │ Anthropic API      │  │ Voyage embeddings  │
                                    │ (routed by task)   │  │ (retrieval)        │
                                    └────────────────────┘  └────────────────────┘
```

Three principles govern the design. First, state lives in Postgres, not in prompts: every artifact (facts, assessments, memos, drafts, citations) is a queryable row the moment it exists, so the UI can render mid-run and a crash loses nothing. Second, humans are graph nodes: attorney review is implemented as LangGraph `interrupt()` gates, giving durable pauses with full audit trail rather than a chat back-and-forth. Third, nothing uncited ships: a verification layer sits between generation and review and blocks unsupported claims.

## 3. Technology decisions

| Layer | Choice | Rationale |
|---|---|---|
| API | FastAPI (Python 3.12) | Async-native, Pydantic v2 validation, same language as the agent layer |
| ORM / DB | SQLAlchemy 2 async + PostgreSQL 16 | One database for app data, vector search (pgvector), and LangGraph checkpoints — minimal ops surface |
| Migrations | Alembic (autogenerate) | Standard, reviewable schema history |
| Agents | LangGraph | Typed state graphs, `interrupt()` human gates, `Send` fan-out, Postgres checkpointing — matches legal workflow exactly |
| LLM | Anthropic API, env-routed | `REASONING_MODEL=claude-sonnet-4-6` for eligibility/strategy/drafting/RFE; `FAST_MODEL=claude-haiku-4-5` for classification/extraction/OCR. Router in one module so pricing policy is centralized |
| Embeddings | Voyage (`voyage-3`), hash fallback for dev | Strong retrieval quality; fallback lets the stack run without external keys |
| Object storage | S3-compatible (MinIO locally) | Firm-namespaced keys, presigned URLs |
| Frontend | React 18 + Vite + Tailwind + TanStack Query + React Router | Fast to build, easy to keep disciplined with a token system |
| Runtime | Docker Compose → single VPS initially | Nginx reverse proxy, TLS termination; scale path documented in §11 |
| Auth | JWT (short-lived) + bcrypt, RBAC | Roles: admin, partner, associate, paralegal |

## 4. Data model

All tenant-owned tables carry `firm_id`; UUID primary keys; `created_at`/`updated_at` throughout. The provenance chain — draft sentence → citation → extracted fact → document page — is the backbone of the trust story.

| Table | Purpose | Key fields |
|---|---|---|
| firms | Tenant | name, style_notes (house voice injected into drafting prompts) |
| users | Auth + RBAC | email, hashed_password, role, is_active |
| cases | Case root | beneficiary_name, field_of_endeavor, visa_category (O-1A/EB-1A), status (11-state machine: intake → analyzing → strategy_review → drafting → draft_review → ready_to_file → filed → rfe_received → rfe_review → approved/denied), profile JSONB, filing_deadline |
| documents | Uploaded files | s3_key, content_type, kind (cv, recommendation_letter, publication, award, press, employment, prior_filing, rfe_notice, other), exhibit_label ("EX-n" — the handle drafts cite), page_count, extracted_text, classification_confidence |
| extracted_facts | Normalized facts with provenance | fact_type, payload JSONB, source_document_id, source_page, source_quote (verbatim anchor) |
| criterion_assessments | The matrix | criterion_key (e.g. "eb1a.awards"), verdict (met/partial/weak/absent), confidence 0–1, reasoning JSONB {standard, analysis, gaps}, evidence_refs JSONB |
| strategy_memos | Gate-1 artifact | recommended_category, viability, criteria_to_argue, criteria_to_abandon, evidence_gaps, rfe_risks, narrative, attorney_decision, attorney_notes |
| drafts / draft_sections | Review unit is the section | kind (petition_letter, support_letter, expert_letter, rfe_response), version; sections: position, heading, body, criterion_key, status (generated/needs_attention/approved/revision_requested), confidence, verification_notes JSONB, reviewer_comment |
| citations | Sentence-level source links | section_id, source_type (exhibit/authority), document_id or authority_ref (e.g. "8 CFR 204.5(h)(3)(i)"), marker ("[EX-3]"), verified flag |
| rfe_notices / rfe_objections | RFE decomposition | issued_date, response_deadline (drives the deadline ring); objections: position, criterion_key, officer_claim, deficiency_type, rebuttal_plan JSONB |
| agent_runs | One graph execution | graph (petition/rfe), thread_id (checkpointer key), status (running/waiting_review/completed/failed), current_gate, gate_payload JSONB, error |
| audit_log | Append-only trail | at, actor ("user:jane@…" / "agent:strategy"), action, case_id, detail JSONB. DB grant: INSERT/SELECT only — no UPDATE/DELETE |
| billing_events | Per-unit metering | event_type (petition_package/rfe_response), quantity, meta. This table is the pricing model: per-unit, never per-seat |
| knowledge_chunks | Retrieval corpus | firm_id NULL = shared legal knowledge; non-NULL = that firm's private precedent. kind (criterion/authority/pattern/precedent), criterion_key, ref (citable string), content, embedding vector |

## 5. Agent layer (LangGraph)

**State design.** Graph state stays thin — identifiers, control flags, reduce channels. Heavy artifacts are written to Postgres by nodes as they run. This keeps checkpoints small, makes everything queryable mid-run, and survives crashes.

```
PetitionState: case_id, firm_id, visa_category,
               assessed_criteria (Annotated[list, operator.add] — reduce channel),
               strategy_decision/notes, review_decision/notes, revision_round
RFEState:      case_id, firm_id, rfe_notice_id, rfe_document_id,
               objection_ids, review_decision/notes, revision_round
```

**Petition graph topology.**

```
START → intake → profile → [Send fan-out: one branch per criterion]
      → assess_criterion (parallel ×8 or ×10) → strategy → ⏸ strategy_gate
        approve → drafting → verification → ⏸ review_gate
                                              approve → finalize → END
                                              revise (≤2 rounds) → drafting
        revise (≤2 rounds) → strategy
```

**RFE graph topology.** `START → parse → plan → draft → verification → ⏸ review_gate → finalize → END`, with the same bounded revision loop back to `draft`.

**Node responsibilities.**

| Node | Model tier | Does |
|---|---|---|
| intake | fast | Classify each document, assign next exhibit label (EX-n), extract facts with page + quote anchors. Idempotent per document |
| profile | reasoning | Synthesize facts into structured beneficiary profile (education, career, headline achievements) stored on the case |
| assess_criterion | reasoning | Per criterion: retrieve legal standard + argument patterns, evaluate this record as a skeptical officer would, emit verdict/confidence/reasoning/evidence_refs. Delete-then-insert upsert makes reruns clean |
| strategy | reasoning | Consume the matrix; decide category, criteria to argue vs abandon, evidence gaps, predicted RFE risks; write the memo; set case to strategy_review |
| strategy_gate | — | `interrupt({gate:"strategy_review"})`; resume payload {decision: approve/revise, notes} feeds revision loop |
| drafting | reasoning | One section per criterion-to-argue, grounded on assessment + retrieved patterns + firm style notes; inline [EX-n] markers plus machine-readable citation list |
| verification | mixed | See §7 |
| review_gate | — | `interrupt({gate:"draft_review"})` |
| finalize | — | Set final status, emit BillingEvent, audit |
| parse_rfe | reasoning | Notice text → issued/deadline dates, summary, isolated objections mapped to criterion keys |
| plan_rebuttals | reasoning | Per objection: concession scope, evidence plan, argument plan, authorities |
| draft_rfe | reasoning | Per objection: response section with citations |

**Checkpointing and execution.** `AsyncPostgresSaver` persists every step; `thread_id` keys each run. A runner module (`start_run` / `resume_run`) creates an `agent_runs` row, drives the graph in a background task until END or the next interrupt, and records gate payloads for the UI. The runner is queue-shaped (single execute entrypoint keyed by thread_id) so promotion to a dedicated worker (arq/Celery) at scale is a transport change, not a redesign. Revision loops are bounded (MAX_REVISION_ROUNDS = 2) to prevent infinite regenerate cycles.

**Prompt conventions (the IP).** Every drafting prompt enforces: exhibit citations as inline [EX-n] markers; legal authorities citable only from retrieved context (never from model memory); "state the standard → present evidence → argue satisfaction" section structure; calibrated self-reported confidence where 0.9+ means "file with light edits." The eligibility prompt is explicitly adversarial — evaluate as a skeptical 2026-era officer, because overclaiming upstream poisons strategy downstream. Structured outputs are validated against Pydantic schemas with one self-repair retry (validation error fed back in-context).

## 6. Knowledge & retrieval

The corpus has four kinds of chunks: **criterion** (the legal standard and adjudication guidance for each of the 18 criterion keys — 8 O-1A per 8 CFR 214.2(o)(3)(iii), 10 EB-1A per 8 CFR 204.5(h)(3), plus Kazarian final-merits guidance), **authority** (statute/regulation/policy-manual passages with exact citable refs), **pattern** (argument structures from successful petitions, generalized), and **precedent** (a firm's own winning petitions — private to that firm, the compounding moat).

Retrieval is hybrid: cosine similarity over embeddings, filtered by kind and criterion_key, tenant-scoped (`firm_id IS NULL OR firm_id = :caller`). Retrieved chunks render into prompts with their refs; the ref strings are the only authorities the model may cite, which is what makes citation verification decidable.

Seeding: a `seed_knowledge.py` script loads the 18 criterion standards, core authorities, and starter argument patterns. Firm precedent is added per-tenant during onboarding.

## 7. Verification layer

Runs after drafting, before any human sees output. Three checks per section:

1. **Citation integrity (deterministic, cheap).** Every inline [EX-n] marker must resolve to a real exhibit on this case; every recorded citation row must resolve (exhibit exists / authority ref present in the corpus). Failures are blockers.
2. **Fact consistency (LLM).** Section claims cross-checked against extracted facts — names, dates, titles, figures. Findings labeled blocker or warning.
3. **Confidence surfacing.** Sections with blockers or confidence < 0.7 are marked `needs_attention`; the UI renders them prominently and they cannot be bulk-approved.

This layer is the difference between "attorney reviews" and "attorney rewrites," which is the adoption thesis.

## 8. API surface

All routes under `/api`, JWT-authenticated except login; firm scoping enforced in a single dependency (`get_case_scoped`), so no route can query across tenants.

| Method & path | Purpose |
|---|---|
| POST /auth/login · GET /auth/me | OAuth2 password login; current user |
| POST /cases · GET /cases · GET /cases/{id} | Create/list/read cases |
| POST /cases/{id}/documents | Upload; text acquired at upload (native PDF layer, vision OCR fallback when a page yields <40 chars) |
| GET /cases/{id}/documents · …/{doc_id}/url | Inventory; presigned read URL for the source viewer |
| GET /cases/{id}/criteria | The criterion matrix |
| GET /cases/{id}/strategy | The strategy memo |
| POST /cases/{id}/runs/petition · POST /cases/{id}/runs/rfe | Start a graph (RFE start takes the notice document id, creates the RFENotice, builds RFEState) |
| GET /cases/{id}/runs | Run status + gate payloads (UI polls) |
| POST /runs/{run_id}/gate | Attorney gate decision {approve/revise, notes} → resumes the graph. Role-guarded: partner/associate |
| GET /cases/{id}/drafts | Drafts with sections + citations (eager-loaded) |
| POST /sections/{id}/review | Approve or request revision on one section, with comment; audited |
| GET /cases/{id}/rfe | Notices + parsed objections |
| GET /health | Liveness |

## 9. Frontend plan

**Information architecture.** Login → Dashboard (case pipeline grouped by status, deadline clocks, active-run indicators) → Case Workspace with five tabs: Overview (profile, status, run timeline), Evidence (document inventory with exhibit labels and classification), Criterion Matrix (the signature screen), Strategy (memo + gate actions), Drafts (section reviewer), RFE (objection cards + deadline ring + rebuttal reviewer). Gate banners appear at the top of the workspace whenever a run is paused awaiting review.

**Component inventory.** Shell (nav + firm context), StatusPill, DeadlineRing (SVG countdown against the RFE response deadline), CriterionMatrix, EvidenceTable, StrategyMemo, DraftReviewer (per-section: body with citation markers rendered as chips linking to source documents, confidence badge, verification notes, approve / request-revision controls; `needs_attention` sections visually loud), RFEWorkspace, GateBanner (approve/revise → runs API), AgentRunTimeline. Data via TanStack Query with polling on active runs.

**UI theme — "legal instrumentation."** The aesthetic is drawn from the subject's world: petition binders, exhibit tabs, law-library bindings, the 87-day clock. Professional means restrained: one signature element, everything else quiet.

| Token | Value | Use |
|---|---|---|
| ink | #16233A | Primary text, nav surface |
| paper | #FBFBF9 | App background |
| slate | #5B6B7F | Secondary text |
| hairline | #E3E7EC | Borders, dividers |
| oxblood | #7A1F2B | The accent: primary actions, active states (law-library binding red — deliberate distance from generic SaaS blue) |
| met green | #1E7A4F | Verdict: met |
| partial amber | #B0770A | Verdict: partial; warnings |
| gap red | #B3372F | Verdict: weak/absent; blockers; deadline urgency |

Typography: **Source Serif 4** for display (case names, section headings — scholarly gravitas), **Inter** for UI and body, **IBM Plex Mono** for receipt numbers, statute refs, exhibit labels, and deadlines (the "instrument readout" register). Signature element: **verdict rails** — a colored left-edge tab on every criterion card and draft section, echoing exhibit-binder dividers, encoding the verdict at a glance. Quality floor: responsive to tablet, visible keyboard focus, `prefers-reduced-motion` respected, WCAG AA contrast on all verdict colors.

## 10. Security, tenancy, compliance

Authentication is JWT (short-lived, 8h default) over bcrypt-hashed passwords; identical error messages for unknown-user and wrong-password (no account enumeration). Authorization is role-based per route; gate decisions and section approvals require partner or associate. Tenant isolation is structural: every tenant table carries `firm_id`, and all case access flows through one dependency that filters by the caller's firm — there is no code path that queries cases unscoped. S3 keys are firm-namespaced; the UI receives only short-lived presigned URLs. The audit log is append-only at the database-grant level and interleaves human and agent actions in one timeline (the malpractice-defensibility story). LLM calls run with zero training-data retention at the API org level. SOC 2 preparation items — structured logging, secrets via environment, encrypted backups, TLS, access reviews — are listed in §11 so the audit is a documentation exercise, not a re-architecture.

## 11. Infrastructure & operations

**Topology (Compose):** `db` (pgvector/pgvector:pg16, healthchecked, volume), `minio` (volume), `backend` (uvicorn, 2 workers, non-root image), `frontend` (Vite build served by nginx), `nginx` (reverse proxy, 50 MB upload limit for exhibit PDFs, 300s read timeout for run kickoffs; TLS terminates here in production).

**Environments.** dev (compose, hash embeddings, seeded demo firm) → staging (mirrors prod, synthetic cases) → prod. Config is entirely environment variables validated by pydantic-settings at boot: database URLs (async for app, sync for Alembic + checkpointer), JWT secret, S3 credentials, `ANTHROPIC_API_KEY`, model names, embeddings provider, CORS origins.

**Deploy sequence.** `docker compose up -d --build` → `alembic upgrade head` → `python -m scripts.seed_knowledge` → `python -m scripts.create_firm --name … --email …`.

**Operations.** Nightly `pg_dump` plus WAL archiving, restore rehearsed quarterly; MinIO versioning on. Structured JSON logs (structlog) with request IDs and thread_ids; error tracking (Sentry); metrics worth watching from day one: run duration by node, gate wait time, verification blocker rate, tokens per case. Scaling path when needed, in order: move Postgres to managed (RDS), split the runner into a dedicated worker via a queue, add read replicas — the codebase is shaped so each is an isolated change.

## 12. Engineering standards

Python: type hints throughout, Pydantic v2 at every boundary, async end-to-end; nodes never call the SDK directly (all model access through one `llm.py` router); nodes own their sessions via a `session_scope` context manager that commits/rolls back — no manual transaction management in business logic. Comments explain *why*, not *what*: every module opens with a docstring stating its role in the system; non-obvious decisions (idempotency strategies, truncation limits, loop guards) are annotated inline. Ruff + mypy in CI. Frontend: components under ~200 lines, design tokens only (no ad-hoc hex values), server state exclusively via TanStack Query. Git: trunk-based, PR review, conventional commits; CI runs lint → typecheck → tests → build on every PR.

## 13. Testing & evaluation

The test pyramid: unit tests for pure logic (routing functions, citation-marker parsing, security helpers); integration tests against a real Postgres container for the API surface and tenant isolation (the cross-firm access test is non-negotiable); graph tests that run both topologies end-to-end with a mocked LLM layer to verify sequencing, fan-out/reduce, gate pause/resume, and revision-loop bounds.

Separately, **model evaluation** — the golden-case harness. Take 10–20 closed cases with known outcomes per firm; replay the eligibility and strategy nodes; report criterion-verdict agreement with the filed petition, RFE-risk precision against what USCIS actually challenged, and citation-verification pass rates. This harness is also the sales pilot instrument: "run it on ten of your decided cases" is the pitch, so it is a product feature, not just QA. Regression-run it on every prompt change.

## 14. Delivery phases

| Phase | Contents | Exit criterion | Est. (1 senior eng, AI-assisted) |
|---|---|---|---|
| 0. Foundation | Repo, compose, config, DB schema + migrations, auth/RBAC, tenancy, storage, audit, CI | Two firms cannot see each other's data; deploy from clean machine in <15 min | 1–1.5 wk |
| 1. RFE engine | Doc upload + OCR, knowledge seed, RFE graph (parse → plan → draft → verify), runner + gates, minimal review UI | Real RFE notice in → verified rebuttal draft out, gated, audited | 2–3 wk |
| 2. Petition engine | Intake/profile/eligibility fan-out, strategy + gate, drafting, full graph | Full case: documents in → strategy memo → drafts, both gates working | 2–3 wk |
| 3. Product UI | Full theme, dashboard, criterion matrix, draft reviewer with citation chips, RFE workspace + deadline ring | An attorney can run a case end-to-end without touching an API client | 2 wk |
| 4. Pilot hardening | Golden-case eval harness, monitoring, backups rehearsal, firm onboarding scripts, precedent ingestion | First design-partner firm live on real closed-case evals | 1–2 wk |

Roughly 8–11 weeks to pilot-ready. Phases 1 and 2 share every subsystem (runner, verification, review), which is why the RFE wedge is cheap to extend into the full pipeline.

## 15. Cost model (estimates)

Per full petition run at current API pricing: ~10 parallel criterion assessments plus strategy, 4–6 drafted sections, and verification lands around 150–250K input / 50–80K output tokens on the reasoning model plus fast-model extraction — roughly **$2–5 per petition**, under $2 per RFE response. Against per-unit pricing of $300–800 per RFE and $1,500–3,000 per petition package, model cost is 1–3% of revenue. Infra: a single 8 GB VPS (~$40–80/mo) carries pilots comfortably; managed Postgres adds ~$50–100/mo when adopted.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Eligibility reasoning not trusted by attorneys | Adversarial-officer prompt framing, calibrated confidence, evidence-linked verdicts, golden-case evals shown per firm |
| Hallucinated authorities | Closed-world citation: only retrieved refs are citable; verification rejects everything else as a blocker |
| Long runs feel opaque | Artifacts persist to DB as nodes complete; UI polls and renders progressively; run timeline shows node-level status |
| Revision loops spiral | MAX_REVISION_ROUNDS bound; further changes go through section-level review, not whole-graph reruns |
| Tenant data leakage | Single scoped-access dependency, cross-firm integration test in CI, firm-namespaced object keys |
| Model/pricing drift | All model names env-routed; eval harness re-run on any model change before rollout |
| Scanned/garbage documents | Tiered OCR with vision fallback, per-page character threshold, classification confidence surfaced in Evidence tab |

---

*End of plan. The build follows this document phase by phase; any deviation gets written back here first.*
