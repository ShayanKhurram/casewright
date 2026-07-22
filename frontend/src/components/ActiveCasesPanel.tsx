import { FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";

import CaseRow from "./CaseRow";
import EmptyState from "./ui/EmptyState";
import { SkeletonGate, SkeletonLine } from "./ui/Skeleton";
import { groupOf } from "../lib/caseGroups";
import { ActiveRun, Case } from "../types";

export interface ActiveCasesPanelProps {
  cases: Case[];
  activeRunsByCase: Map<string, ActiveRun>;
  loading: boolean;
}

/** One shimmer placeholder shaped like a CaseRow (avatar block + two stacked lines). Repeated
 * to form the panel's loading state — mirrors DashboardSkeleton's "skeletons mirror the real
 * layout" rule. */
function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-9 w-9 shrink-0 animate-shimmer motion-reduce:animate-none rounded-pill bg-surface-2" />
      <div className="flex flex-1 flex-col gap-1.5">
        <SkeletonLine width="55%" />
        <SkeletonLine width="30%" />
      </div>
    </div>
  );
}

/** Overview's left work-area panel (Phase 8, T8.2). Lists the top cases that still need work
 * (needs-review first, then active; closed cases are excluded — the panel is named "Active
 * Cases"), each as a CaseRow linking to the case. Receives the already-fetched `["cases"]` and
 * `["runs","active"]` data from Overview so the shared query cache isn't re-hit. */
export default function ActiveCasesPanel({ cases, activeRunsByCase, loading }: ActiveCasesPanelProps) {
  // Closed matters (filed/approved/denied) don't belong in an "Active Cases" panel; the rest are
  // sorted needs-review-first, then by most-recently-touched.
  const rows = cases
    .filter((c) => groupOf(c.status) !== "closed")
    .sort((a, b) => {
      const ar = groupOf(a.status) === "review" ? 0 : 1;
      const br = groupOf(b.status) === "review" ? 0 : 1;
      if (ar !== br) return ar - br;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .slice(0, 6);

  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display text-base text-text">Active Cases</h2>
        <Link to="/cases" className="text-sm font-medium text-accent-text hover:underline">
          View all →
        </Link>
      </div>

      <SkeletonGate
        loading={loading}
        skeleton={
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={FolderOpen} title="No active cases" description="Matters needing work will appear here." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((c) => (
              <CaseRow key={c.id} case_={c} activeRun={activeRunsByCase.get(c.id)} />
            ))}
          </div>
        )}
      </SkeletonGate>
    </section>
  );
}