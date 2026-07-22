import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, X } from "lucide-react";
import { FormEvent, useState } from "react";

import { apiFetch, uploadDocument } from "../lib/api";
import { DOCUMENT_KINDS, Document } from "../types";
import Button from "./ui/Button";
import Select from "./ui/Select";
import { SkeletonGate, SkeletonRow } from "./ui/Skeleton";

const KIND_OPTIONS = DOCUMENT_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }));

function ConfidenceBar({ confidence }: { confidence: number | null }) {
  if (confidence == null) return <span className="text-text-faint">—</span>;
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-12 overflow-hidden rounded-pill bg-surface-2">
        <div className="h-1 rounded-pill bg-run" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-text-faint">{pct}%</span>
    </div>
  );
}

/** Right slide-over showing a document's metadata + a link to the presigned original (redesign
 * plan §8's "row click → presigned preview in a right slide-over panel"). Fetches the presigned
 * URL only once a document is selected (`enabled: !!document`), not for every row up front. */
function SourcePanel({ caseId, document, onClose }: { caseId: string; document: Document | null; onClose: () => void }) {
  const { data: urlData } = useQuery({
    queryKey: ["document-url", caseId, document?.id],
    queryFn: () => apiFetch<{ url: string }>(`/cases/${caseId}/documents/${document!.id}/url`),
    enabled: !!document,
  });

  return (
    <DialogPrimitive.Root open={!!document} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-bg/60 transition-opacity duration-panel data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <DialogPrimitive.Content
          className={[
            "fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-border bg-surface p-6",
            "transition-transform duration-panel ease-casewright",
            "data-[state=closed]:translate-x-full data-[state=open]:translate-x-0",
          ].join(" ")}
        >
          {document && (
            <>
              <div className="mb-4 flex items-start justify-between">
                <DialogPrimitive.Title className="font-mono text-sm uppercase text-text">
                  {document.exhibit_label ?? "Unlabeled"}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <button
                    aria-label="Close"
                    className="rounded-control p-1 text-text-faint hover:bg-surface-2 hover:text-text"
                  >
                    <X size={16} />
                  </button>
                </DialogPrimitive.Close>
              </div>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-mono text-xs uppercase text-text-faint">Kind</dt>
                  <dd className="text-text">{document.kind.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase text-text-faint">Pages</dt>
                  <dd className="text-text">{document.page_count ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase text-text-faint">Classification confidence</dt>
                  <dd className="text-text">
                    <ConfidenceBar confidence={document.classification_confidence} />
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-xs uppercase text-text-faint">Uploaded</dt>
                  <dd className="text-text">{new Date(document.created_at).toLocaleString()}</dd>
                </div>
              </dl>
              {urlData && (
                <a
                  href={urlData.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover"
                >
                  Open original <ExternalLink size={14} />
                </a>
              )}
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default function EvidenceTab({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>(DOCUMENT_KINDS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Document | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents", caseId],
    queryFn: () => apiFetch<Document[]>(`/cases/${caseId}/documents`),
  });

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(caseId, kind, file);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["documents", caseId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleUpload} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-48">
          <label className="mb-1.5 block text-xs uppercase tracking-wide text-text-dim">Kind</label>
          <Select value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
        </div>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-text-dim file:mr-3 file:rounded-control file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-text hover:file:bg-surface"
        />
        <Button type="submit" size="sm" loading={uploading} disabled={!file}>
          Upload
        </Button>
      </form>
      {error && <p className="mb-2 text-sm text-gap">{error}</p>}

      <SkeletonGate
        loading={isLoading}
        skeleton={
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        }
      >
        {documents && documents.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-xs uppercase text-text-faint">
                <th className="py-1.5">Exhibit</th>
                <th>Kind</th>
                <th>Pages</th>
                <th>Confidence</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className="cursor-pointer border-b border-border transition-colors duration-hover hover:bg-surface"
                >
                  <td className="py-1.5">
                    <span className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-dim">
                      {d.exhibit_label ?? "—"}
                    </span>
                  </td>
                  <td className="text-text-dim">{d.kind.replace(/_/g, " ")}</td>
                  <td className="text-text-dim">{d.page_count ?? "—"}</td>
                  <td>
                    <ConfidenceBar confidence={d.classification_confidence} />
                  </td>
                  <td className="font-mono text-xs text-text-faint">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-text-dim">No documents yet — upload the beneficiary's CV, awards, and letters to begin.</p>
        )}
      </SkeletonGate>

      <SourcePanel caseId={caseId} document={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
