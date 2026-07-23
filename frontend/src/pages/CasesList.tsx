import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Plus, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import CaseRow from "../components/CaseRow";
import DashboardSkeleton from "../components/DashboardSkeleton";
import Button from "../components/ui/Button";
import Dialog from "../components/ui/Dialog";
import EmptyState from "../components/ui/EmptyState";
import Input from "../components/ui/Input";
import Label from "../components/ui/Label";
import Select from "../components/ui/Select";
import { SkeletonGate } from "../components/ui/Skeleton";
import { apiFetch } from "../lib/api";
import { groupOf } from "../lib/caseGroups";
import { humanizeStatus } from "../lib/statusTone";
import { ActiveRun, Case, CASE_STATUSES } from "../types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...CASE_STATUSES.map((s) => ({ value: s, label: humanizeStatus(s) })),
];

const CATEGORIES = ["All", "O-1A", "EB-1A"] as const;

/** List panel of CaseRows (Phase 8, T8.3) — the list analogue of the former CaseCard grid:
 * a `divide-y divide-border rounded-card border border-border bg-surface` panel of `CaseRow`s,
 * matching the Overview's Active Cases panel treatment. */
function RowList({ cases, activeRunsByCase }: { cases: Case[]; activeRunsByCase: Map<string, ActiveRun> }) {
  return (
    <div className="divide-y divide-border rounded-card border border-border bg-surface">
      {cases.map((c) => (
        <CaseRow key={c.id} case_={c} activeRun={activeRunsByCase.get(c.id)} />
      ))}
    </div>
  );
}

function NewCaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [visaCategory, setVisaCategory] = useState<"O-1A" | "EB-1A">("EB-1A");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!beneficiaryName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await apiFetch<Case>("/cases", {
        method: "POST",
        body: JSON.stringify({ beneficiary_name: beneficiaryName, visa_category: visaCategory }),
      });
      setBeneficiaryName("");
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the case.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New case" description="Start a new beneficiary case.">
      <form onSubmit={handleCreate}>
        <div className="mb-4">
          <Label htmlFor="new-case-name" className="mb-1.5 block">
            Beneficiary name
          </Label>
          <Input
            id="new-case-name"
            value={beneficiaryName}
            onChange={(e) => setBeneficiaryName(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="mb-2">
          <Label className="mb-1.5 block">Visa category</Label>
          <Select
            value={visaCategory}
            onValueChange={(v) => setVisaCategory(v as "O-1A" | "EB-1A")}
            options={[
              { value: "EB-1A", label: "EB-1A" },
              { value: "O-1A", label: "O-1A" },
            ]}
          />
        </div>
        {error && <p className="mt-2 text-xs text-gap">{error}</p>}
        <Button type="submit" loading={creating} disabled={!beneficiaryName.trim()} className="mt-4 w-full justify-center">
          Create case
        </Button>
      </form>
    </Dialog>
  );
}

export default function CasesList() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [showClosed, setShowClosed] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (q && !c.beneficiary_name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (category !== "All" && c.visa_category !== category) return false;
      return true;
    });
  }, [data, search, statusFilter, category]);

  const review = filtered.filter((c) => groupOf(c.status) === "review");
  const active = filtered.filter((c) => groupOf(c.status) === "active");
  const closed = filtered.filter((c) => groupOf(c.status) === "closed");

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl text-text">Cases</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="-ml-0.5" />
          New case
        </Button>
      </div>
      <NewCaseDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label className="mb-1.5 block">Search</Label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Beneficiary name…"
              className="pl-8"
            />
          </div>
        </div>
        <div className="min-w-0">
          <Label className="mb-1.5 block">Status</Label>
          {/* Glass segmented-pill filter bar (inspired_ui reskin), replacing the dropdown —
              scrolls horizontally rather than wrapping/overflowing with 11 statuses + All. */}
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-control border border-border bg-surface p-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={[
                  "shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                  statusFilter === opt.value ? "bg-surface-2 text-text" : "text-text-dim hover:text-text",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">Category</Label>
          <div className="flex rounded-control border border-border bg-surface p-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={[
                  "rounded-control px-3 py-1.5 text-xs font-medium transition-colors duration-hover",
                  category === cat ? "bg-surface-2 text-text" : "text-text-dim hover:text-text",
                ].join(" ")}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-gap">Failed to load cases.</p>}

      <SkeletonGate loading={isLoading} skeleton={<DashboardSkeleton />}>
        {data && data.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No cases yet"
            description="Create your first case to start building a petition or RFE response."
            action={{ label: "New case", onClick: () => setDialogOpen(true) }}
          />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-dim">No cases match your filters.</p>
        ) : (
          <div className="space-y-8">
            {review.length > 0 && (
              <section>
                <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-partial">
                  Needs your review · {review.length}
                </h2>
                <RowList cases={review} activeRunsByCase={activeRunsByCase} />
              </section>
            )}
            {active.length > 0 && (
              <section>
                <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-text-dim">
                  Active · {active.length}
                </h2>
                <RowList cases={active} activeRunsByCase={activeRunsByCase} />
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <button
                  onClick={() => setShowClosed((s) => !s)}
                  className="mb-3 font-mono text-xs uppercase tracking-wide text-text-faint hover:text-text-dim"
                >
                  {showClosed ? "▾" : "▸"} Filed / Closed · {closed.length}
                </button>
                {showClosed && <RowList cases={closed} activeRunsByCase={activeRunsByCase} />}
              </section>
            )}
          </div>
        )}
        </SkeletonGate>
      </div>
    </div>
  );
}
