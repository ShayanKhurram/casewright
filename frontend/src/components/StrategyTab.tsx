import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { AgentRun, StrategyMemo as StrategyMemoType } from "../types";
import StrategyMemoView from "./StrategyMemo";

export default function StrategyTab({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();

  const { data: memo, error } = useQuery({
    queryKey: ["strategy", caseId],
    queryFn: () => apiFetch<StrategyMemoType>(`/cases/${caseId}/strategy`),
    retry: false,
  });
  const { data: runs } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
  });

  const gateRun = runs?.find(
    (r) => r.graph === "petition" && r.status === "waiting_review" && r.current_gate === "strategy_review"
  );

  async function handleGateDecision(decision: "approve" | "revise", notes: string | null) {
    if (!gateRun) return;
    await apiFetch(`/runs/${gateRun.id}/gate`, {
      method: "POST",
      body: JSON.stringify({ decision, notes }),
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["strategy", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["runs", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["criteria", caseId] }),
    ]);
  }

  if (error) {
    return <p className="text-sm text-slate">No strategy memo yet — run petition analysis first.</p>;
  }
  if (!memo) {
    return <p className="text-sm text-slate">Loading…</p>;
  }

  return <StrategyMemoView memo={memo} onGateDecision={gateRun ? handleGateDecision : undefined} />;
}
