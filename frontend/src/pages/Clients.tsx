import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";

import CaseRow from "../components/CaseRow";
import StatusPill from "../components/StatusPill";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonGate, SkeletonLine } from "../components/ui/Skeleton";
import { apiFetch } from "../lib/api";
import { ActiveRun, Case, Client } from "../types";

function ClientRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <SkeletonLine width="30%" />
      <SkeletonLine width="15%" />
      <SkeletonLine width="20%" />
    </div>
  );
}

/** Firm-wide client roll-up (Phase 8, T8.4). Not a real entity — see docs/internal/PLAN.md's Phase 8 header,
 * deviation #1: `GET /clients` groups `cases` by `beneficiary_name` in Python, no `clients`
 * table. Clicking a row expands it inline to show that beneficiary's cases as `CaseRow`s — no
 * dedicated detail route, since there's no real client entity to route to. */
export default function Clients() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: clients, isLoading, error } = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiFetch<Client[]>("/clients"),
  });
  // Shares the ["cases"] cache with Overview/CasesList/CommandPalette/Sidebar.
  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });
  const { data: activeRuns } = useQuery({
    queryKey: ["runs", "active"],
    queryFn: () => apiFetch<ActiveRun[]>("/runs/active"),
  });
  const activeRunsByCase = new Map((activeRuns ?? []).map((r) => [r.case_id, r]));

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="font-display text-2xl text-text">Clients</h1>
      <p className="mt-2 text-text-dim">Every beneficiary with at least one case at the firm.</p>

      {error && <p className="mt-4 text-sm text-gap">Failed to load clients.</p>}

      <div className="mt-6 overflow-hidden rounded-card border border-border bg-surface">
        <SkeletonGate
          loading={isLoading}
          skeleton={
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }, (_, i) => (
                <ClientRowSkeleton key={i} />
              ))}
            </div>
          }
        >
          {clients && clients.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Users} title="No clients yet" description="Clients appear here once a case exists." />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(clients ?? []).map((c) => {
                const isOpen = expanded === c.beneficiary_name;
                const clientCases = (cases ?? []).filter((cs) => c.case_ids.includes(cs.id));
                return (
                  <div key={c.beneficiary_name}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : c.beneficiary_name)}
                      className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-hover hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-display text-base text-text">
                        {c.beneficiary_name}
                      </span>
                      <span className="font-mono text-xs text-text-dim">
                        {c.case_count} case{c.case_count === 1 ? "" : "s"}
                      </span>
                      <StatusPill status={c.most_urgent_status} />
                      <span className="font-mono text-[10px] uppercase tracking-wide text-text-faint">
                        {c.visa_categories.join(", ")}
                      </span>
                    </button>
                    {isOpen && clientCases.length > 0 && (
                      <div className="divide-y divide-border border-t border-border bg-bg/40">
                        {clientCases.map((cs) => (
                          <CaseRow key={cs.id} case_={cs} activeRun={activeRunsByCase.get(cs.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SkeletonGate>
      </div>
    </div>
  );
}
