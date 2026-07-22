import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import EmptyState from "../components/ui/EmptyState";
import Label from "../components/ui/Label";
import Select from "../components/ui/Select";
import { SkeletonGate, SkeletonLine } from "../components/ui/Skeleton";
import { apiFetch } from "../lib/api";
import { Case, DOCUMENT_KINDS, DocumentWithCase } from "../types";

const KIND_OPTIONS = [{ value: "all", label: "All kinds" }, ...DOCUMENT_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }))];

function RowSkeleton() {
  return (
    <tr>
      <td className="p-3">
        <SkeletonLine width="90%" />
      </td>
      <td className="p-3">
        <SkeletonLine width="70%" />
      </td>
      <td className="p-3">
        <SkeletonLine width="60%" />
      </td>
      <td className="p-3">
        <SkeletonLine width="40%" />
      </td>
    </tr>
  );
}

/** Firm-wide document library (Phase 8, T8.4). Reads `GET /documents` (extends the existing
 * per-case endpoint), filterable by case and kind. */
export default function Documents() {
  const [caseId, setCaseId] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");

  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });

  const params = new URLSearchParams();
  if (caseId !== "all") params.set("case_id", caseId);
  if (kind !== "all") params.set("kind", kind);
  const query = params.toString();

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ["documents", caseId, kind],
    queryFn: () => apiFetch<DocumentWithCase[]>(`/documents${query ? `?${query}` : ""}`),
  });

  const caseOptions = [
    { value: "all", label: "All cases" },
    ...(cases ?? []).map((c) => ({ value: c.id, label: c.beneficiary_name })),
  ];

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="font-display text-2xl text-text">Documents</h1>
      <p className="mt-2 text-text-dim">Every document uploaded across every case at the firm.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px]">
          <Label className="mb-1.5 block">Case</Label>
          <Select value={caseId} onValueChange={setCaseId} options={caseOptions} />
        </div>
        <div className="min-w-[200px]">
          <Label className="mb-1.5 block">Kind</Label>
          <Select value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-gap">Failed to load documents.</p>}

      <div className="mt-6 overflow-x-auto rounded-card border border-border bg-surface">
        <SkeletonGate
          loading={isLoading}
          skeleton={
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-border">
                {Array.from({ length: 5 }, (_, i) => (
                  <RowSkeleton key={i} />
                ))}
              </tbody>
            </table>
          }
        >
          {documents && documents.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title="No documents"
                description="Documents uploaded to a case will appear here."
              />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wide text-text-dim">
                  <th className="p-3 font-normal">Exhibit</th>
                  <th className="p-3 font-normal">Case</th>
                  <th className="p-3 font-normal">Kind</th>
                  <th className="p-3 font-normal">Confidence</th>
                  <th className="p-3 font-normal">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(documents ?? []).map((d) => (
                  <tr key={d.id} className="text-text">
                    <td className="p-3 font-mono text-xs text-text-dim">{d.exhibit_label ?? "—"}</td>
                    <td className="p-3">
                      <Link to={`/cases/${d.case_id}`} className="text-accent-text hover:underline">
                        {d.beneficiary_name}
                      </Link>
                    </td>
                    <td className="p-3 capitalize text-text-dim">{d.kind.replace(/_/g, " ")}</td>
                    <td className="p-3 text-text-dim">
                      {d.classification_confidence != null ? `${Math.round(d.classification_confidence * 100)}%` : "—"}
                    </td>
                    <td className="p-3 text-text-dim">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SkeletonGate>
      </div>
    </div>
  );
}
