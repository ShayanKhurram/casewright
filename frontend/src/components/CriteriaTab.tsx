import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch } from "../lib/api";
import { AgentRun, CriterionAssessment } from "../types";
import CriteriaSkeleton from "./CriteriaSkeleton";
import CriterionMatrix from "./CriterionMatrix";
import Button from "./ui/Button";
import { SkeletonGate } from "./ui/Skeleton";

const REQUIRED_MET = 3;

export default function CriteriaTab({ caseId }: { caseId: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });
  const petitionRunActive = runs?.some(
    (r) => r.graph === "petition" && (r.status === "running" || r.status === "waiting_review")
  );

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["criteria", caseId],
    queryFn: () => apiFetch<CriterionAssessment[]>(`/cases/${caseId}/criteria`),
    // Poll while the petition run is actively assessing criteria, so the matrix fills in live
    // (redesign plan §6's progressive reveal) instead of only updating on tab re-visit.
    refetchInterval: petitionRunActive ? 2500 : false,
  });

  const metCount = (assessments ?? []).filter((a) => a.verdict === "met").length;
  const satisfied = metCount >= REQUIRED_MET;

  async function startPetitionRun() {
    setStarting(true);
    setError(null);
    try {
      await apiFetch(`/cases/${caseId}/runs/petition`, { method: "POST" });
      await refetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start petition analysis");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className={["font-mono text-xs uppercase tracking-wide", satisfied ? "text-met" : "text-text-dim"].join(" ")}>
          {metCount} of {REQUIRED_MET} required criteria met
        </span>
        {!petitionRunActive && (
          <Button size="sm" loading={starting} onClick={startPetitionRun}>
            Start petition analysis
          </Button>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-gap">{error}</p>}
      {petitionRunActive && (
        <p className="mb-4 text-sm text-text-dim">Analysis in progress — this tab refreshes automatically.</p>
      )}
      <SkeletonGate loading={isLoading} skeleton={<CriteriaSkeleton />}>
        <CriterionMatrix assessments={assessments ?? []} />
      </SkeletonGate>
    </div>
  );
}
