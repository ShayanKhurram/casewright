import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import DeadlineBadge from "./DeadlineBadge";
import StatusPill from "./StatusPill";
import { normalizeProgress } from "../lib/runProgress";
import { ActiveRun, Case } from "../types";
import { PETITION_TOPOLOGY, RFE_TOPOLOGY } from "./pipeline/graphTopology";

/** Initials for the glass monogram avatar — exported so the Cases list reskin (T8.3) and any
 * other caller can reuse the exact same helper rather than duplicating it. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Glass monogram avatar — same translucent-circle treatment as CasesList's former CaseCard
 * (36px `h-9 w-9`), kept here so the row stays visually consistent with the old card grid.
 * Exported for the same reuse reason as `initials`. */
export function Monogram({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-border bg-surface-2 font-mono text-xs font-medium text-text-dim">
      {initials(name)}
    </div>
  );
}

export interface CaseRowProps {
  case_: Case;
  /** Active run for this case, if any. Overview's Active Cases panel passes it through from the
   * `["runs","active"]` query; the Cases list reskin (T8.3) passes it so the per-case progress
   * bar still renders in the row layout. */
  activeRun?: ActiveRun;
}

/** Row-format case summary (Phase 8, T8.2) — the list analogue of CasesList's former CaseCard.
 * Same `{ case_, activeRun }` props shape, but a single-line row: monogram + name/category on
 * the left, status + deadline + chevron on the right, and a thin active-run progress bar beneath
 * when a run is in flight. The whole row is a `<Link>` per the redesign's "everything is a
 * shortcut" principle. */
export default function CaseRow({ case_: c, activeRun }: CaseRowProps) {
  const topology = activeRun ? (activeRun.graph === "petition" ? PETITION_TOPOLOGY : RFE_TOPOLOGY) : null;
  // normalizeProgress: activeRun.progress can legitimately be {} for runs that predate T5.3
  // or crashed before ever streaming a node event — see lib/runProgress.ts.
  const progressPct =
    activeRun && topology && topology.length > 0
      ? Math.round((normalizeProgress(activeRun.progress).completed_nodes.length / topology.length) * 100)
      : null;

  return (
    <Link
      to={`/cases/${c.id}`}
      className="block px-4 py-3 transition-colors duration-hover hover:bg-surface-2"
    >
      <div className="flex items-center gap-3">
        <Monogram name={c.beneficiary_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base text-text">{c.beneficiary_name}</p>
          <p className="mt-0.5 font-mono text-xs text-text-dim">{c.visa_category}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={c.status} />
          {c.filing_deadline && <DeadlineBadge deadline={c.filing_deadline} />}
          <ChevronRight size={16} className="text-text-faint" />
        </div>
      </div>
      {progressPct != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-2">
          <div
            className="h-1 rounded-pill bg-run transition-all duration-panel ease-casewright"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </Link>
  );
}