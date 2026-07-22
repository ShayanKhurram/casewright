import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import CriteriaTab from "../components/CriteriaTab";
import DraftsTab from "../components/DraftsTab";
import EvidenceTab from "../components/EvidenceTab";
import GateBanner from "../components/GateBanner";
import OverviewTab from "../components/OverviewTab";
import RFETab from "../components/RFETab";
import StatusPill from "../components/StatusPill";
import StrategyTab from "../components/StrategyTab";
import { apiFetch } from "../lib/api";
import { AgentRun, Case, CriterionAssessment, Document, Draft } from "../types";

const TABS = ["Overview", "Evidence", "Criteria", "Strategy", "Drafts", "RFE"] as const;

/** Case Workspace shell (redesign plan §8): serif title + StatusPill + category, a lifted
 * GateBanner slot for any draft-review-shaped gate (petition's review_gate or RFE's
 * review_gate — both carry a `sections` gate_payload), and Radix Tabs with count badges.
 * `strategy_gate` is deliberately NOT surfaced here — StrategyTab already has a dedicated
 * gate UI built into StrategyMemoView, and showing a second generic banner for the same gate
 * would just be two competing approve/revise controls for one decision. */
export default function CaseWorkspace() {
  const { caseId } = useParams<{ caseId: string }>();
  const queryClient = useQueryClient();

  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiFetch<Case>(`/cases/${caseId}`),
    enabled: !!caseId,
  });
  const { data: runs } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    enabled: !!caseId,
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "running") ? 2500 : false),
  });
  // Count-badge queries only — the tab components below issue the same queries (same query
  // key) when actually rendered, so TanStack Query dedupes/shares this cache rather than
  // double-fetching.
  const { data: documents } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: () => apiFetch<Document[]>(`/cases/${caseId}/documents`),
    enabled: !!caseId,
  });
  const { data: criteria } = useQuery({
    queryKey: ["criteria", caseId],
    queryFn: () => apiFetch<CriterionAssessment[]>(`/cases/${caseId}/criteria`),
    enabled: !!caseId,
  });
  const { data: drafts } = useQuery({
    queryKey: ["drafts", caseId],
    queryFn: () => apiFetch<Draft[]>(`/cases/${caseId}/drafts`),
    enabled: !!caseId,
  });

  const gateRun = runs?.find((r) => r.status === "waiting_review" && r.current_gate !== "strategy_review");

  async function refreshAfterGate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["runs", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["drafts", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
    ]);
  }

  if (!caseId) return null;

  const draftSectionCount = drafts?.reduce((sum, d) => sum + d.sections.length, 0) ?? 0;

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto max-w-5xl p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-text">{caseData?.beneficiary_name}</h1>
            <p className="font-mono text-xs text-text-faint">{caseData?.visa_category}</p>
          </div>
          {caseData && <StatusPill status={caseData.status} />}
        </div>

        {gateRun && <GateBanner run={gateRun} onDecided={refreshAfterGate} />}

        <TabsPrimitive.Root defaultValue="Overview">
          {/* overflow-x-auto (T5.8 tablet check): 6 tabs with labels + count badges can get
              tight below ~1024px inside this max-w-5xl container — scrolls instead of wrapping
              or visually breaking if it doesn't fit. shrink-0 on each trigger keeps tab widths
              stable rather than letting flex squeeze them illegibly. */}
          <TabsPrimitive.List className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((t) => (
              <TabsPrimitive.Trigger
                key={t}
                value={t}
                className={[
                  "flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm text-text-dim",
                  "transition-colors duration-hover hover:text-text",
                  "data-[state=active]:border-accent data-[state=active]:text-text",
                ].join(" ")}
              >
                {t}
                {t === "Evidence" && documents ? (
                  <span className="font-mono text-[10px] text-text-faint">{documents.length}</span>
                ) : null}
                {t === "Criteria" && criteria ? (
                  <span className="font-mono text-[10px] text-text-faint">{criteria.length}</span>
                ) : null}
                {t === "Drafts" && drafts && draftSectionCount > 0 ? (
                  <span className="font-mono text-[10px] text-text-faint">{draftSectionCount}</span>
                ) : null}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>

          <TabsPrimitive.Content value="Overview">
            {caseData && <OverviewTab caseId={caseId} caseData={caseData} />}
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="Evidence">
            <EvidenceTab caseId={caseId} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="Criteria">
            <CriteriaTab caseId={caseId} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="Strategy">
            <StrategyTab caseId={caseId} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="Drafts">
            <DraftsTab caseId={caseId} />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="RFE">
            <RFETab caseId={caseId} />
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>
      </div>
    </div>
  );
}
