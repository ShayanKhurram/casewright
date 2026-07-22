import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../../lib/api";
import { ActiveRun } from "../../types";

/** Pulsing --run dot + "N run(s) active" when any graph is executing anywhere in the firm
 * (redesign §4) — click jumps to that case. Polls GET /runs/active; backs off to idle when
 * nothing is running so this doesn't hammer the API on every screen. */
export default function RunIndicator() {
  const navigate = useNavigate();
  const { data: runs } = useQuery({
    queryKey: ["runs", "active"],
    queryFn: () => apiFetch<ActiveRun[]>("/runs/active"),
    refetchInterval: (query) => (query.state.data && query.state.data.length > 0 ? 2500 : 15000),
  });

  const activeRuns = runs ?? [];
  if (activeRuns.length === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-2 rounded-pill border border-border bg-surface-2 px-3 py-1 text-xs text-text-dim hover:border-border-strong">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-run opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-pill bg-run" />
          </span>
          <span className="font-mono">
            {activeRuns.length} run{activeRuns.length === 1 ? "" : "s"} active
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-card border border-border bg-surface-2 p-2 shadow-elevated"
        >
          {activeRuns.map((run) => (
            <button
              key={run.id}
              onClick={() => navigate(`/cases/${run.case_id}`)}
              className="flex w-full flex-col items-start rounded-control px-2 py-2 text-left hover:bg-surface"
            >
              <span className="text-sm text-text">{run.beneficiary_name}</span>
              <span className="font-mono text-xs text-text-faint">
                {run.graph} · {run.status === "waiting_review" ? "awaiting review" : "running"}
                {run.current_gate ? ` · ${run.current_gate}` : ""}
              </span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
