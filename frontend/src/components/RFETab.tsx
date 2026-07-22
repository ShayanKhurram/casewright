import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiFetch } from "../lib/api";
import { useStaggeredReveal } from "../lib/useStaggeredReveal";
import { AgentRun, Document, RFENotice, RFEObjection } from "../types";
import StatusPill from "./StatusPill";
import DeadlineRing from "./DeadlineRing";
import Button from "./ui/Button";
import Pill from "./ui/Pill";

function ObjectionCard({ objection, staggerIndex }: { objection: RFEObjection; staggerIndex?: number }) {
  const [expanded, setExpanded] = useState(false);
  const planEntries = Object.entries(objection.rebuttal_plan ?? {});

  return (
    <div
      className={[
        "mb-3 rounded-card border-l-[3px] border-l-border-strong border-y border-r border-border bg-surface p-3",
        staggerIndex !== undefined ? "animate-reveal-up" : "",
      ].join(" ")}
      style={staggerIndex !== undefined ? { animationDelay: `${staggerIndex * 60}ms` } : undefined}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase text-text-dim">{objection.criterion_key ?? "uncategorized"}</span>
        {objection.deficiency_type && <Pill tone="gap" label={objection.deficiency_type} />}
      </div>
      <p className="text-sm italic text-text">&ldquo;{objection.officer_claim}&rdquo;</p>
      {planEntries.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 font-mono text-[10px] uppercase tracking-wide text-text-faint hover:text-text-dim"
          >
            {expanded ? "▾ Hide rebuttal plan" : "▸ Show rebuttal plan"}
          </button>
          {expanded && (
            <dl className="mt-1.5 space-y-1">
              {planEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="font-mono text-[10px] uppercase text-text-faint">{key.replace(/_/g, " ")}</dt>
                  <dd className="text-sm text-text-dim">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

function NoticeCard({ notice }: { notice: RFENotice }) {
  const staggerMap = useStaggeredReveal(notice.objections.map((o) => o.id));
  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="font-mono text-xs text-text-dim">
          {notice.issued_date && <p>Issued {notice.issued_date}</p>}
          {notice.response_deadline && <p>Due {notice.response_deadline}</p>}
        </div>
        <DeadlineRing deadline={notice.response_deadline} />
      </div>
      {notice.summary && <p className="mt-2 text-sm text-text">{notice.summary}</p>}
      <div className="mt-3">
        {notice.objections.map((o) => (
          <ObjectionCard key={o.id} objection={o} staggerIndex={staggerMap.get(o.id)} />
        ))}
      </div>
    </div>
  );
}

export default function RFETab({ caseId }: { caseId: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: documents } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: () => apiFetch<Document[]>(`/cases/${caseId}/documents`),
  });
  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ["runs", caseId],
    queryFn: () => apiFetch<AgentRun[]>(`/cases/${caseId}/runs`),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "running") ? 2000 : false),
  });
  const rfeRunning = runs?.some((r) => r.graph === "rfe" && r.status === "running");
  const { data: notices } = useQuery({
    queryKey: ["rfe", caseId],
    queryFn: () => apiFetch<RFENotice[]>(`/cases/${caseId}/rfe`),
    // Poll while an RFE run is actively parsing/drafting so objection cards land live
    // (progressive reveal, redesign plan §6) instead of only on tab re-visit.
    refetchInterval: rfeRunning ? 2500 : false,
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

  return (
    <div>
      {activeRun?.status === "running" && <p className="mb-4 text-sm text-text-dim">Run in progress ({activeRun.graph})…</p>}
      {error && <p className="mb-2 text-sm text-gap">{error}</p>}

      {noticeDocuments.length > 0 && !activeRun && (
        <div className="mb-4 flex flex-wrap gap-2">
          {noticeDocuments.map((doc) => (
            <Button key={doc.id} size="sm" loading={starting} onClick={() => startRun(doc.id)}>
              Start RFE response for {doc.exhibit_label}
            </Button>
          ))}
        </div>
      )}

      {notices?.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} />
      ))}

      {runs && runs.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-xs uppercase text-text-faint">
              <th className="py-1.5">Run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="py-1.5 font-mono text-xs text-text-dim">{r.id.slice(0, 8)}</td>
                <td>
                  <StatusPill status={r.status} />
                  {r.error && <span className="ml-2 text-xs text-gap">{r.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
