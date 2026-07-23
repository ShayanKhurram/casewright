import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import ActiveCasesPanel from "../components/ActiveCasesPanel";
import DeadlinesRail from "../components/DeadlinesRail";
import { deadlineDays } from "../components/DeadlineBadge";
import RecentActivityStrip from "../components/RecentActivityStrip";
import { SkeletonBlock, SkeletonGate, SkeletonLine } from "../components/ui/Skeleton";
import { apiFetch } from "../lib/api";
import { groupOf } from "../lib/caseGroups";
import { humanizeStatus } from "../lib/statusTone";
import { ActiveRun, Case } from "../types";

interface StatCardProps {
  label: string;
  value: number;
  caption: string;
  /** Tint the big number with the tone's color only when there's something to flag (value > 0);
   * callers pass `tone` only in that case so the card stays neutral (`text-text`) at zero. */
  tone?: "gap" | "partial" | "met";
}

// Full literals (not `text-${tone}`) so Tailwind's JIT scanner emits each class — same pattern
// as ui/Pill.tsx / DeadlineBadge.
const STAT_TONE: Record<"gap" | "partial" | "met", string> = {
  gap: "text-gap",
  partial: "text-partial",
  met: "text-met",
};

function StatCard({ label, value, caption, tone }: StatCardProps) {
  return (
    <Link
      to="/cases"
      className="block rounded-card border border-border bg-surface p-5 transition-colors duration-hover hover:border-border-strong"
    >
      <p className="font-mono text-[11px] uppercase tracking-wide text-text-dim">{label}</p>
      <p className={["mt-2 font-display text-3xl", tone ? STAT_TONE[tone] : "text-text"].join(" ")}>
        {value}
      </p>
      <p className="mt-1 text-[13px] text-text-dim">{caption}</p>
    </Link>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <SkeletonLine width="40%" />
      <div className="mt-3">
        <SkeletonBlock width="55%" height="1.75rem" />
      </div>
      <div className="mt-2">
        <SkeletonLine width="75%" />
      </div>
    </div>
  );
}

/** Overview landing screen (Phase 8, T8.2). Replaces T8.1's "Coming soon" placeholder with the
 * real dashboard: a dated header, a 4-card stat row (all computed client-side from the shared
 * `["cases"]` response — no new backend calls), and a two-column work area (Active Cases panel
 * + Deadlines rail). Every card and row is a working link per the redesign's "everything is a
 * shortcut" principle. */
export default function Overview() {
  // Header date — computed once per render, no ticking clock needed (T8.2 brief).
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });
  // Same active-runs query + refetch cadence as CasesList — shared cache, no extra network cost.
  const { data: activeRuns } = useQuery({
    queryKey: ["runs", "active"],
    queryFn: () => apiFetch<ActiveRun[]>("/runs/active"),
    refetchInterval: (query) => (query.state.data && query.state.data.length > 0 ? 5000 : false),
  });
  const activeRunsByCase = useMemo(() => {
    const map = new Map<string, ActiveRun>();
    for (const run of activeRuns ?? []) map.set(run.case_id, run);
    return map;
  }, [activeRuns]);

  const cases = data ?? [];

  const reviewCases = useMemo(
    () => cases.filter((c) => groupOf(c.status) === "review"),
    [cases],
  );

  // --- Stat card counts (all client-side over the already-fetched `cases`) ---
  // "Total cases": currently-managed matters — closed (filed/approved/denied) excluded; stated
  // in the caption so the number is unambiguous.
  const openCount = cases.filter((c) => groupOf(c.status) !== "closed").length;
  const needsReview = cases.filter((c) => groupOf(c.status) === "review").length;
  // Filing deadlines <= 14d, overdue included — the same "urgent" bucket DeadlineBadge uses.
  const filingSoon = cases.filter(
    (c) => c.filing_deadline !== null && deadlineDays(c.filing_deadline) <= 14,
  ).length;
  // Filed this calendar quarter (status === "filed" + updated_at in the current quarter/year).
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const filedThisQuarter = cases.filter((c) => {
    if (c.status !== "filed") return false;
    const d = new Date(c.updated_at);
    return Math.floor(d.getMonth() / 3) === currentQuarter && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="font-display text-2xl text-text">Overview</h1>
      <p className="mt-2 text-text-dim">{today}</p>

      {error && <p className="mt-4 text-sm text-gap">Failed to load cases.</p>}

      {/* Stat card row */}
      <SkeletonGate
        loading={isLoading}
        skeleton={
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total cases" value={openCount} caption="All open matters" />
          <StatCard
            label="Needs review"
            value={needsReview}
            caption={needsReview > 0 ? "Awaiting your decision" : "Nothing waiting"}
            tone={needsReview > 0 ? "partial" : undefined}
          />
          <StatCard
            label="Filing deadlines <14d"
            value={filingSoon}
            caption={filingSoon > 0 ? "Due soon or overdue" : "None due soon"}
            tone={filingSoon > 0 ? "gap" : undefined}
          />
          <StatCard
            label="Filed this quarter"
            value={filedThisQuarter}
            caption={`Filed in Q${currentQuarter + 1} ${now.getFullYear()}`}
            tone={filedThisQuarter > 0 ? "met" : undefined}
          />
        </div>
      </SkeletonGate>

      {/* Two-column work area */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ActiveCasesPanel cases={cases} activeRunsByCase={activeRunsByCase} loading={isLoading} />
        <DeadlinesRail />
      </div>

      {/* Needs-your-review quick-action list (T8.5) — mirrors the "Needs review" stat card's count
          with the actual case names. Rendered only when there's at least one review-group case,
          so it doesn't add an empty block at zero. */}
      {reviewCases.length > 0 && (
        <section className="mt-6">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-dim">
            Needs your review
          </h2>
          <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
            {reviewCases.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/cases/${c.id}`}
                  className="flex items-center justify-between px-3 py-2 text-sm text-text hover:bg-surface-2"
                >
                  <span>{c.beneficiary_name}</span>
                  <span className="font-mono text-xs text-text-dim">{humanizeStatus(c.status)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent activity strip (T8.5) — omits itself entirely when the audit log is empty. */}
      <RecentActivityStrip />
    </div>
  );
}