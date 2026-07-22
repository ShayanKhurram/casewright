# Casewright UI Redesign — Implementation Plan
### Dark, polished, modern-SaaS interface with a first-class loading system

Reference class: Linear, Vercel, Raycast — dense, calm, dark surfaces with precise typography and motion that communicates system state. Casewright keeps its legal identity on top of that: verdict rails, exhibit-tab semantics, mono "instrument readout" for statutes and deadlines.

---

## 1. Diagnosis of the current UI

From the screenshots, the concrete failures to fix:

| Problem | Fix (spec below) |
|---|---|
| Raw firm UUID + role string in the header | User menu: avatar initials, name, role badge, firm name; UUID never rendered |
| Default browser `<select>`, bare inputs, washed-out button | Component library pass: styled Select, Input, Button with states (§5) |
| Status chip is unstyled mono text in a gray box | StatusPill system with per-status color + dot (§5) |
| Raw internal error surfaced ("Model did not call emit_result…") | Humanized error mapping + retry action; internals go to a collapsible "technical details" (§7) |
| Dead whitespace, no navigation structure, list rows float unanchored | App shell: left sidebar + topbar + max-width content grid, card surfaces (§4) |
| No loading states at all — data pops in | Full skeleton + agent-progress system (§6) |
| Light theme executed as "no theme" | Dark token system (§3) |

## 2. Design direction

One line: **a night-mode legal instrument panel** — deep ink surfaces (blue-black, never pure black), a single garnet accent inherited from the brand's oxblood, verdict colors doing the semantic work, serif display reserved for case names, and motion used exclusively to communicate machine state (what's running, what finished, what needs the attorney). No decorative animation.

## 3. Dark token system

Implement as CSS variables in `index.css`, mapped into `tailwind.config.js` (`colors: { bg: 'var(--bg)', … }`) so every component consumes tokens, never hex.

**Color.**

| Token | Value | Use |
|---|---|---|
| --bg | #0C1118 | App background (ink-black with blue undertone) |
| --surface | #121A24 | Cards, panels |
| --surface-2 | #18222E | Elevated: modals, popovers, hover rows |
| --hairline | rgba(255,255,255,0.07) | All borders/dividers (never solid gray) |
| --hairline-strong | rgba(255,255,255,0.14) | Focused/active borders |
| --text | #E8ECF2 | Primary text |
| --text-dim | #94A3B8 | Secondary text, labels |
| --text-faint | #5B6B7F | Placeholders, timestamps |
| --accent | #C1424F | Garnet (dark-mode oxblood): primary buttons, active nav, focus rings, links |
| --accent-hover | #D25562 | Hover lift |
| --met | #3FB47C | Verdict met; success |
| --partial | #D9A03E | Verdict partial; warnings; needs_attention |
| --gap | #E05252 | Verdict weak/absent; blockers; failed runs; deadline urgency |
| --run | #5B8DEF | The only blue: active/running state (pulses, progress) — kept distinct from accent so "running" never looks like "clickable" |

Elevation is done with borders + subtle background steps, not drop shadows (shadows read muddy on dark). One exception: popovers/modals get `0 16px 48px rgba(0,0,0,0.5)`.

**Typography.** Unchanged families, re-tuned for dark: Source Serif 4 (case names, page titles only — 28/22px, weight 600), Inter (everything else; body 14px/1.6, labels 12px uppercase +0.06em in --text-dim), IBM Plex Mono 12–13px for exhibit labels, statute refs, receipt numbers, deadlines, timestamps. On dark, drop Inter weights by one step (500 where 600 was) — light-on-dark text renders visually bolder.

**Shape & spacing.** Radius: 8px cards, 6px controls, 999px pills. Spacing scale 4/8/12/16/24/32/48. Content max-width 1200px; workspace uses a 12-col grid.

**Motion tokens.** `--ease: cubic-bezier(0.16, 1, 0.3, 1)`; durations 120ms (hover), 200ms (reveal), 320ms (panel/route). Everything respects `prefers-reduced-motion` (fade-only fallbacks).

## 4. App shell

```
┌──────┬──────────────────────────────────────────────┐
│      │ topbar: breadcrumb · run indicator · user ▾  │
│ side ├──────────────────────────────────────────────┤
│ bar  │                                              │
│      │            content (max 1200px)              │
│ 56px │                                              │
│ /224 │                                              │
└──────┴──────────────────────────────────────────────┘
```

Sidebar (collapsible 224px → 56px icon rail): wordmark, nav (Dashboard, Cases, Knowledge, Settings), bottom: firm name + plan. Active item: garnet left rail (2px) + --surface-2 fill — the verdict-rail language applied to navigation. Topbar: breadcrumb (`Cases / Dr. Maria Chen`), a global **RunIndicator** (pulsing --run dot + "1 run active" when any graph is executing anywhere; click → jumps to that case), user menu (initials avatar, name, role pill; sign out). Route transitions: 2px top progress bar in --accent (nprogress-style, CSS-only).

## 5. Component system

Build on **Radix primitives** (Select, Dialog, Popover, Tabs, Tooltip, Toast) + Tailwind tokens; add **framer-motion** only for the loading/reveal choreography in §6. Component inventory and specs:

**Button.** Variants: primary (garnet fill, white text, hover lift + 1px translate-y), secondary (--surface-2 fill, hairline border), ghost, destructive (--gap). Sizes sm/md. Loading state: label persists, 14px spinner replaces left icon, `disabled` + `aria-busy` — never a width-collapsing spinner swap.

**Input / Select / Textarea.** --surface fill, hairline border, focus: --accent ring (2px, 40% alpha) + border-strong. Labels 12px uppercase --text-dim. Inline validation text in --gap, 12px, appears with 120ms fade.

**StatusPill.** Dot + label, tinted background at 12% alpha of its color, 999px radius, mono 11px uppercase. Mapping: intake/analyzing → --run (analyzing pulses), strategy_review + draft_review + rfe_review → --partial ("YOUR REVIEW" affordance), drafting → --run, ready_to_file → --met, filed → --text-dim, rfe_received → --gap, approved → --met, denied → --gap.

**VerdictRail.** 3px left border on criterion cards and draft sections: met/partial/weak/absent → --met/--partial/--gap/--text-faint. The signature element, now doing double duty as scan-reading on dark.

**CitationChip.** Inline `[EX-3]` rendered as mono chip (--surface-2, hairline); hover → popover with source document name, page, and the anchoring quote; click → opens source panel. Unverified citations get a --gap underline.

**DeadlineRing.** SVG ring, mono day-count center ("41d"). Color by remaining time: >30d --text-dim, 14–30d --partial, <14d --gap with a slow 2s pulse. Sits in the RFE tab header and on dashboard cards with active RFEs.

**GateBanner.** Full-width bar atop the workspace when a run waits at a gate: --partial left rail, title ("Strategy ready for review"), context line, primary "Review & approve" + secondary "Request changes". Slides down 320ms on arrival; toast fires simultaneously.

**Toast system.** Bottom-right, --surface-2, hairline, auto-dismiss 5s; variants success/error/info; errors include a retry action where the failed call is retryable.

**EmptyState.** Centered, 320px max: line-art icon (single-weight strokes, --text-faint), one-sentence explanation, one primary action. Every list/tab gets one (e.g. Evidence: "No documents yet — upload the beneficiary's CV, awards, and letters to begin." + Upload button).

## 6. Loading & progress system (the centerpiece)

Principle: **the interface always knows what the machine is doing.** Three tiers:

**Tier 1 — Skeletons (data fetching).** Skeleton primitives: `SkeletonLine` (h-3.5, varied widths), `SkeletonBlock`, `SkeletonPill`, `SkeletonRow`. Shimmer: a 1.6s translating gradient sweep (rgba-white 0.03 → 0.07 → 0.03), CSS keyframe, GPU-composited. Rule: skeletons are **content-shaped** — each screen ships a matching skeleton layout (DashboardSkeleton renders the exact card grid; CriteriaSkeleton renders 8–10 rail-carded rows; DraftSkeleton renders heading + paragraph masses with a right rail). No generic gray boxes, no full-screen spinners, ever. Skeletons appear only if the query exceeds 150ms (avoid flash), and fade out 200ms as real content fades in.

**Tier 2 — Agent progress (the graph is running).** This is where the product earns "polished." A **PipelineTracker** component renders the actual graph topology as a horizontal stepper:

```
Intake ✓ ─ Profile ✓ ─ Eligibility ◉ 6/10 ─ Strategy ○ ─ Gate ○ ─ Drafting ○ ─ Verify ○
```

Node states: done (--met check, 200ms pop-in), active (--run ring with 1.8s pulse + elapsed mono timer beneath), pending (--text-faint hollow), failed (--gap ×), gate (diamond shape — visually distinct because it waits on a *human*). The eligibility node shows a live `n/m` fan-out counter with a mini progress ring as parallel criterion branches complete. Data source: poll `GET /cases/{id}/runs` at 2.5s while a run is active (TanStack Query `refetchInterval` conditional on status), exponential backoff to 15s when idle, stop on terminal states. Backend addition required: the runner writes `current_node` + per-node timestamps onto `agent_runs.gate_payload`-style progress JSON so the tracker is truthful, not simulated.

**Progressive reveal.** As eligibility branches finish, criterion cards appear in the matrix one by one — staggered 60ms entrance (fade + 8px rise), newest card briefly rail-glows. The attorney watches the matrix fill in live instead of staring at a blank tab. Same pattern for RFE objections during parsing and draft sections during drafting.

**Tier 3 — Micro-feedback (user actions).** Buttons: in-place spinner (§5). Uploads: per-file rows with filename, size, thin progress bar (--run), then state swap to "Processing text…" (indeterminate shimmer) → classified kind + exhibit label pop in. Gate decisions: optimistic — banner collapses immediately, PipelineTracker resumes pulsing, toast "Strategy approved — drafting started." Section approve/revise: optimistic status flip with rollback-on-error toast.

## 7. Error & edge states

Error taxonomy mapped to human copy: model/validation failures → "The drafting engine hit a problem on this step. Your case data is safe — retry the run from where it stopped." (checkpointing makes this literally true; the retry button re-invokes the same thread_id). Raw error strings move into a collapsed `<details>` "Technical details" mono block. Failed PipelineTracker node shows --gap state with "Retry from here." Network errors: toast + automatic TanStack retry (2, backoff). 401 → clean redirect to login with "Session expired." Long-idle gate (>24h): dashboard card shows a --partial "waiting N days" chip — gates are SLAs, surface them.

## 8. Screen-by-screen

**Login.** Split layout: left 45% — ink panel, serif wordmark, one-line product statement, subtle animated hairline grid (reduced-motion: static); right — centered card, email/password, garnet submit. No marketing fluff.

**Dashboard.** Header: "Cases" (serif) + New case (primary, opens Dialog — no inline form row). Filter rail: search input, status filter (Radix Select), category segmented control. Case cards in a responsive grid: serif beneficiary name, mono category, StatusPill, deadline chip (DeadlineRing-mini if RFE active), PipelineTracker-mini (a 4px segmented progress strip) if a run is active, "waiting on you" highlight (--partial rail) when a gate is open. Sections grouped: **Needs your review** (gates open) pinned first, then Active, then Filed/Closed collapsed.

**Case Workspace.** Serif case title + StatusPill + category mono; GateBanner slot; Radix Tabs (Overview / Evidence / Criteria / Strategy / Drafts / RFE) with garnet active underline and count badges (Evidence 12 · Criteria 10 · Drafts 2). Overview: two-column — beneficiary profile card (structured, not raw bullet dump) + PipelineTracker with run history timeline (mono timestamps, humanized errors). Evidence: table rows — exhibit label (mono chip), filename, kind pill, classification confidence bar, pages, uploaded-at; row click → presigned preview in a right slide-over panel. Criteria: verdict-railed cards, verdict + confidence meter (thin bar, not a number dump), reasoning collapsible, evidence chips linking to exhibits; header shows the "3 of 10" scoreboard (met count vs required, --met when satisfied). Strategy: memo as a document surface (--surface, generous padding, serif section heads), argue/abandon as two railed lists, RFE-risk cards, gate actions sticky at bottom. Drafts: three-pane — section nav (left, rails + status dots), section body (center, citations as chips), source panel (right, opens the cited exhibit at the anchor quote); per-section approve/revise bar; needs_attention sections auto-expanded with --partial rail and verification notes listed. RFE: DeadlineRing header + issued/deadline mono dates, objection cards (officer claim quoted, deficiency type pill, rebuttal plan collapsible), response sections in the same three-pane reviewer.

## 9. Accessibility & quality floor

WCAG AA contrast verified for every token pair (all listed pairs pass on --bg/--surface); focus visible everywhere (--accent ring); full keyboard reach including tabs, gate actions, section review; `aria-live="polite"` on PipelineTracker updates and toasts; reduced-motion: all pulses/staggers become fades; touch targets ≥40px; tables collapse to cards at <768px (partners review on tablets).

## 10. Implementation notes

Dependencies to add: `@radix-ui/react-*` (tabs, dialog, select, popover, toast, tooltip), `framer-motion`. Structure: `src/theme/tokens.css`, `src/components/ui/` (Button, Input, Select, Pill, Skeleton, Toast — the primitive kit), `src/components/loading/` (Skeleton layouts, PipelineTracker, ProgressStrip), feature components consume only the kit. Migration is screen-at-a-time behind the new shell — shell + tokens land first, then screens re-skin inside it. Backend touch: extend runner to persist `progress` JSON (current_node, node timestamps, fan-out counts) on `agent_runs`; add it to `RunOut`.

## 11. Phases & effort

| Phase | Contents | Est. |
|---|---|---|
| 1 | Tokens, dark shell (sidebar/topbar/user menu), ui-kit primitives, toast, route progress bar | 2–3 days |
| 2 | Loading system: skeleton primitives + per-screen skeletons, PipelineTracker + backend progress field, progressive reveal | 3–4 days |
| 3 | Dashboard + Login re-skin, empty states, error taxonomy | 2 days |
| 4 | Workspace tabs: Evidence, Criteria (rails + scoreboard), Strategy + gates | 3 days |
| 5 | Draft reviewer three-pane + citation chips + source panel; RFE workspace + DeadlineRing | 3–4 days |
| 6 | Accessibility pass, reduced-motion, tablet responsive, polish sweep | 1–2 days |

Total ≈ 2.5–3 weeks of focused frontend work.

---

*Every visual decision above derives from the token table in §3; if a screen needs a value that isn't a token, the token system — not the screen — gets amended.*
