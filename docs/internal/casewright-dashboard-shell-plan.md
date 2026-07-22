# Casewright — Dashboard & Shell Plan
### Building the "LexPath-style" polished dark case-management interface

The reference screenshot is a calm, dense, dark case-management dashboard: branded sidebar, top search bar, a stat-card overview, and a two-column Active Cases / Deadlines split. This plan specifies how to build that exact shape for Casewright — the menus, tabs, cards, and overview screen — reconciled with the token system and domain already defined.

---

## 1. What the reference gets right (and we adopt)

- **Branded sidebar identity** — logo tile + product name + practice-area subtitle, not just a wordmark.
- **CRM-style top-level nav** — Dashboard / Cases / Clients / Documents / Calendar. Broader than a pure agent workspace; this is what a firm actually navigates.
- **Nav count badges** — "Cases 2" signals attention items inline.
- **Overview-first landing** — a date-stamped Overview with at-a-glance stat cards before any list.
- **Stat card row** — Total / Urgent / In Review / Approved: label (mono caps) + big number + sub-caption.
- **Two-column work split** — Active Cases (primary, left) + Deadlines (rail, right).
- **Case rows** — avatar initials, name, visa type, status pill, deadline chip, chevron affordance.
- **Deadline rail** — name + day-countdown + a thin progress bar showing urgency.
- **Bottom-anchored account** — Settings + user identity (name + role) pinned to sidebar foot.
- **Persistent help affordance** — "?" bottom-right.

All of this sits cleanly on the dark token system from the redesign plan; no new palette needed.

## 2. Information architecture

The reference implies a richer IA than the current agent-only workspace. Adopt these as top-level destinations:

```
Sidebar
├─ Dashboard        ← the Overview screen (§4)
├─ Cases      [n]   ← case list + the 6-tab Case Workspace
├─ Clients    [n]   ← people/orgs; a client has many cases  (NEW)
├─ Documents        ← firm-wide document library across cases (NEW)
├─ Calendar         ← deadlines + filing dates, month/week view (NEW)
└─ (bottom) Settings · User account
```

Cases, Clients, Documents, and Calendar are all *views over the same data* you already model — a client is the beneficiary/petitioner layer above `cases`; Documents is a firm-scoped roll-up of the `documents` table; Calendar is `filing_deadline` + `rfe_notices.response_deadline` on a grid. So the IA expands without a data-model rewrite (one new `clients` table, everything else is a query).

## 3. Shell layout

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ LexPath tile │  ⌕ Search cases…                              🔔  ?   │  ← topbar 64px
│ ───────────  ├──────────────────────────────────────────────────────┤
│ ▸ Dashboard  │                                                      │
│   Cases  [2] │   Overview                                           │
│   Clients    │   Tuesday, July 22, 2026                             │
│   Documents  │                                                      │
│   Calendar   │   [ stat ] [ stat ] [ stat ] [ stat ]                │
│              │                                                      │
│              │   ┌ Active Cases ──────┐  ┌ Deadlines ──────┐       │
│              │   │ rows…              │  │ rail…           │       │
│ ─────────────│   └────────────────────┘  └─────────────────┘       │
│ ⚙ Settings   │                                                      │
│ ◍ Sarah O.   │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
   240px fixed                     fluid content, max 1200px
```

**Sidebar (240px, fixed).**
- **Brand tile** (top): rounded icon tile (--accent or firm color) + "Casewright" (Inter 600, 15px) + practice-area subtitle ("Immigration", --text-dim 12px). Click → Dashboard.
- **Nav list**: icon (20px, line-weight) + label (14px). Active item: --surface-2 fill, 6px radius, --accent icon + text; a subtle 2px --accent left rail. Hover: --surface fill. Count badges: small pill, --surface-2 fill or --accent for urgent counts, mono 11px, right-aligned.
- **Bottom block** (pinned, `margin-top:auto`): hairline divider, Settings row, then account row — avatar initials circle + name (14px) + role (--text-dim 12px). Click account → user popover (from redesign plan).

**Topbar (64px).**
- **Global search** (left-of-center, 360px): rounded --surface field, search icon, placeholder "Search cases…". Focus expands + shows a results dropdown (cases, clients, documents grouped). Wire ⌘K to focus it.
- **Right cluster**: notification bell (badge dot when unread → popover list of gate-ready reviews, new RFEs, run completions) · help "?" (opens docs/shortcuts).

Uses the existing shell tokens (--bg app background, --surface sidebar, --hairline borders). Sidebar sits on --surface, one step lighter than the --bg content area — matching the reference's subtle panel separation.

## 4. Overview (Dashboard) screen

**Header.** "Overview" (Source Serif 4, 28px, 600) + weekday-stamped date beneath (Inter, --text-dim). Date is live.

**Stat card row** (4 cards, responsive → 2×2 on tablet, stacked on mobile):
- Each card: --surface fill, hairline border, 8px radius, 20px padding.
- Layout: label (mono 11px uppercase +0.06em, --text-dim) → number (Source Serif or Inter 600, 34px, --text) → caption (13px, --text-dim).
- Casewright metrics mapped to the domain:
  - **Total cases** — currently managed (all non-closed).
  - **Needs review** — cases with an open gate (strategy/draft/rfe). This is the money metric; tint the number --partial when > 0.
  - **RFE deadlines <14d** — count of urgent clocks; tint --gap when > 0.
  - **Filed this quarter** — throughput; --met.
- Hover: border-strong + 1px lift. Click a card → filtered Cases view.
- Optional: a tiny sparkline or delta ("+2 this week") under the caption for movement.

**Two-column work area** (grid, ~62% / 38%):

**Left — Active Cases panel.**
- Panel header: "Active Cases" (serif 16px) + "View all ↗" link (--accent, right).
- Case rows (hover: --surface-2, cursor pointer → workspace):
  - Avatar (initials circle, 36px, deterministic color from name)
  - Name (Inter 500, 14px) + visa line beneath (mono 12px, --text-dim) — supports transitions like "F-1 → H-1B"
  - Right cluster: StatusPill (Urgent → --gap, Active → --run/--met, In Review → --partial) · deadline chip (mono; ⚠ + "6d" when urgent, else a date) · chevron (--text-faint)
- Rows separated by hairline; ~4–6 visible, panel scrolls.
- Skeleton: 5 row-shaped shimmer placeholders.

**Right — Deadlines rail.**
- Header: "Deadlines" (serif 16px).
- Rows: name (14px) + day-countdown (mono, right) + a thin progress bar beneath (fill = urgency, color ramps --text-dim → --partial → --gap as the clock shrinks). Sorted soonest-first.
- Each row links to that case's RFE/Overview tab.
- This rail is the same data the Calendar page renders, condensed.

**Below the fold (optional, adds depth):** a "Recent activity" strip (audit-log-driven: "Strategy approved for Dr. Chen · 2h ago"), and a "Needs your review" quick-action list mirroring the stat card.

## 5. Cases screen (list + workspace)

- **List view**: reuse the Dashboard's Active Cases row pattern at full height, with the filter rail from the redesign plan (search, status Select, category segmented control) and the grouping (Needs review / Active / Completed).
- **Row click → Case Workspace**: the 6-tab layout already specced (Overview / Evidence / Criteria / Strategy / Drafts / RFE) with the garnet active-underline tabs. This is where the agent engine lives; the CRM shell wraps around it.

## 6. New destinations (thin at first)

- **Clients**: table of people/orgs (name, type petitioner/beneficiary, # cases, most-urgent status). Client detail = header + their cases list. Needs one `clients` table + FK from `cases`.
- **Documents**: firm-wide document library — the `documents` table unscoped from a single case, with filters (case, kind, date) and the same exhibit/kind pills. Reuses the Evidence table component.
- **Calendar**: month/week grid of `filing_deadline` + `rfe_notices.response_deadline`, color-urgency-coded, click → case. The DeadlineRing/urgency ramp reused as day markers.

Ship these as read-only roll-ups first; they make the product feel like a complete system without new backend depth.

## 7. Component delta (what's new vs the inventory)

Most components already exist in the inventory. New/extended for this shell:

| Component | Status |
|---|---|
| BrandTile (logo + product + practice subtitle) | new |
| SidebarNavItem (icon + label + count badge + active rail) | new |
| TopbarSearch (expanding, grouped-results dropdown, ⌘K) | new |
| NotificationBell (badge + popover feed) | new |
| StatCard (label / number / caption / delta / click-filter) | new |
| OverviewHeader (serif title + live date) | new |
| ActiveCasesPanel + CaseRow | new (CaseRow reused across Dashboard/Cases) |
| DeadlinesRail + DeadlineRow (name + countdown + urgency bar) | new |
| RecentActivityStrip (audit-driven) | optional new |
| HelpButton (persistent ?) | new |
| Avatar, StatusPill, VerdictRail, DeadlineRing, Skeletons, Toast | reuse from inventory |

## 8. Build phases

| Phase | Contents | Est. |
|---|---|---|
| 1 | Shell: 240px branded sidebar (nav + count badges + bottom account), 64px topbar (search + bell + help), route wiring | 2 days |
| 2 | Overview screen: StatCard row (live metrics), ActiveCasesPanel + CaseRow, DeadlinesRail, skeletons | 2–3 days |
| 3 | Cases list (reusing CaseRow + filter rail) → hand off to existing Workspace tabs | 1 day |
| 4 | New destinations as read-only roll-ups: Clients, Documents, Calendar | 3–4 days |
| 5 | Search dropdown + ⌘K, notification feed, recent-activity strip, polish | 2 days |

≈ 2 weeks to the full LexPath-style shell with a live Overview, on top of the token system and component kit already planned.

## 9. Fidelity notes

- Keep the **calm density** of the reference: generous padding inside panels, quiet hairlines, one accent, numbers doing the visual work. Resist adding color — the urgency ramp (dim → amber → red) is the only place hue carries meaning besides the accent.
- **Numbers are serif or heavy Inter**; labels are mono caps. That pairing is what gives the reference its "instrument" feel — carry it through every stat.
- **Everything on the Overview is a shortcut**: every card, row, and deadline links somewhere. The dashboard is a launcher, not a report.
- Deterministic **avatar colors** from name hash so the same person is always the same color across Dashboard, Cases, Clients.

---

*This wraps the existing agent workspace in the case-management shell the reference implies — same tokens, same domain, mostly new surfaces over data you already have. Point me at a phase and I'll spec components or build it.*
