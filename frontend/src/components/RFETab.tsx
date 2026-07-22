import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch } from "../lib/api";
import { AgentRun, Document, RFENotice } from "../types";
import DeadlineBadge from "./DeadlineBadge";
import GateBanner from "./GateBanner";
import StatusPill from "./StatusPill";

export default function RFETab({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: documents } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: () => apiFetch<Document[]>(`/cases/${caseId}/documents`),
  });
  const { data: notices } = useQuery({
    queryKey: ["rfe", caseId],
    queryFn: () => apiFetch<RFENotice[]>(`/cases/${caseId}/rfe`),
  });
  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });

  const noticeDocuments = documents?.filter((d) => d.kind === "rfe_notice") ?? [];
  const activeRun = runs?.find((r) => r.status === "waiting_review" || r.status === "running");

  async function startRun(documentId: string) {
    setStarting(true);
    setError(null);
    try {
      await apiFetch(`/cases/${caseId}/runs/rfe`, {
        method: "POST",
        body: JSON.stringify({ document_id: documentId }),
      });
      await refetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setStarting(false);
    }
  }

  async function refreshAfterGate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["runs", caseId] }),
      queryClient.invalidateQueries({ queryKey: ["drafts", caseId] }),
    ]);
  }

  return (
    <div>
      {activeRun?.status === "waiting_review" && <GateBanner run={activeRun} onDecided={refreshAfterGate} />}
      {activeRun?.status === "running" && (
        <p className="mb-4 text-sm text-slate">Run in progress ({activeRun.graph})…</p>
      )}
      {error && <p className="mb-2 text-sm text-verdict-gap">{error}</p>}

      {noticeDocuments.length > 0 && !activeRun && (
        <div className="mb-4 flex flex-wrap gap-2">
          {noticeDocuments.map((doc) => (
            <button
              key={doc.id}
              disabled={starting}
              onClick={() => startRun(doc.id)}
              className="rounded bg-oxblood px-3 py-1 text-sm text-paper hover:opacity-90 disabled:opacity-50"
            >
              Start RFE response for {doc.exhibit_label}
            </button>
          ))}
        </div>
      )}

      {notices?.map((notice) => (
        <div key={notice.id} className="mb-4 rounded border border-hairline p-4">
          <DeadlineBadge deadline={notice.response_deadline} />
          {notice.summary && <p className="mt-2 text-sm text-ink">{notice.summary}</p>}
          <ul className="mt-3 space-y-2">
            {notice.objections.map((o) => (
              <li key={o.id} className="border-l-2 border-hairline pl-3">
                <p className="text-xs font-mono uppercase text-slate">{o.criterion_key ?? "uncategorized"}</p>
                <p className="text-sm text-ink">{o.officer_claim}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {runs && runs.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase text-slate">
              <th className="py-1">Run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-hairline">
                <td className="py-1 font-mono text-xs">{r.id.slice(0, 8)}</td>
                <td>
                  <StatusPill status={r.status} />
                  {r.error && <span className="ml-2 text-xs text-verdict-gap">{r.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
