import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";

import EmptyState from "./ui/EmptyState";
import { SkeletonGate, SkeletonLine } from "./ui/Skeleton";
import { apiFetch } from "../lib/api";
import { Deadline } from "../types";

// Full literal class strings (not interpolated `text-${tone}`) so Tailwind's JIT scanner emits
// each one — mirrors the pattern in ui/Pill.tsx's TONE table and DeadlineBadge's color literals.
const TEXT_TONE: Record<"gap" | "partial" | "met", string> = {
  gap: "text-gap",
  partial: "text-partial",
  met: "text-met",
};
const BAR_TONE: Record<"gap" | "partial" | "met", string> = {
  gap: "bg-gap",
  partial: "bg-partial",
  met: "bg-met",
};

function deadlineDays(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function deadlineTone(days: number): "gap" | "partial" | "met" {
  return days < 0 ? "gap" : days <= 14 ? "partial" : "met";
}

/** One shimmer placeholder shaped like a deadline row (a name line + the thin progress bar
 * beneath it). Repeated to form the rail's loading state. */
function DeadlineRowSkeleton() {
  return (
    <div className="px-4 py-3">
      <SkeletonLine width="70%" />
      <div
        className="mt-2 h-1 rounded-pill bg-surface-2 animate-shimmer motion-reduce:animate-none"
        style={{ width: "100%" }}
      />
    </div>
  );
}

/** Overview's right work-area panel (Phase 8, T8.2, upgraded in T8.4). Fetches
 * `GET /deadlines` — the merged filing + RFE response deadline feed (see docs/internal/PLAN.md's Phase 8
 * header, deviation #3: T8.2 shipped this sourced from `cases.filing_deadline` only, since the
 * firm-wide endpoint didn't exist yet; T8.4 closes that gap so the rail now shows the same data
 * the Calendar page renders, condensed, per the source doc's intent). Own query, own cache key —
 * shared with the Calendar page. */
export default function DeadlinesRail() {
  const { data, isLoading } = useQuery({
    queryKey: ["deadlines"],
    queryFn: () => apiFetch<Deadline[]>("/deadlines"),
  });

  const rows = (data ?? []).slice(0, 5);

  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-display text-base text-text">Deadlines</h2>
      </div>

      <SkeletonGate
        loading={isLoading}
        skeleton={
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }, (_, i) => (
              <DeadlineRowSkeleton key={i} />
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={CalendarClock}
              title="No upcoming deadlines"
              description="Filing and RFE response deadlines will appear here."
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((d) => {
              const days = deadlineDays(d.date);
              const tone = deadlineTone(days);
              const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`;
              // Simple urgency proxy: the closer to/over the deadline, the fuller the bar.
              // Clamped to [0,100]; not exact, just a glanceable visual — see T8.2 brief.
              const fill = Math.max(0, Math.min(100, 100 - days));
              return (
                <Link
                  key={`${d.case_id}-${d.kind}-${d.source_id ?? "filing"}`}
                  to={`/cases/${d.case_id}`}
                  className="block px-4 py-3 transition-colors duration-hover hover:bg-surface-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text">{d.beneficiary_name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-text-faint">
                        {d.kind === "rfe_response" ? "RFE response" : "Filing"}
                      </p>
                    </div>
                    <span className={["shrink-0 font-mono text-xs", TEXT_TONE[tone]].join(" ")}>{label}</span>
                  </div>
                  <div className="mt-2 h-1 rounded-pill bg-surface-2">
                    <div
                      className={["h-1 rounded-pill transition-all", BAR_TONE[tone]].join(" ")}
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SkeletonGate>
    </section>
  );
}
