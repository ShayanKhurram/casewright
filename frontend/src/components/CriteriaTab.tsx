import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch } from "../lib/api";
import { AgentRun, CriterionAssessment } from "../types";
import CriterionMatrix from "./CriterionMatrix";

export default function CriteriaTab({ caseId }: { caseId: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: assessments } = useQuery({
    queryKey: ["criteria", caseId],
    queryFn: () => apiFetch<CriterionAssessment[]>(`/cases/${caseId}/criteria`),
  });
  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    refetchInterval: (query) =>
      query.state.data?.some((r) => r.status === "running") ? 2000 : false,
  });

  const petitionRunActive = runs?.some(
    (r) => r.graph === "petition" && (r.status === "running" || r.status === "waiting_review")
  );

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
      {!petitionRunActive && (
        <button
          disabled={starting}
          onClick={startPetitionRun}
          className="mb-4 rounded bg-oxblood px-3 py-1 text-sm text-paper hover:opacity-90 disabled:opacity-50"
        >
          Start petition analysis
        </button>
      )}
      {error && <p className="mb-2 text-sm text-verdict-gap">{error}</p>}
      {petitionRunActive && (
        <p className="mb-4 text-sm text-slate">Analysis in progress — this tab refreshes automatically.</p>
      )}
      <CriterionMatrix assessments={assessments ?? []} />
    </div>
  );
}
