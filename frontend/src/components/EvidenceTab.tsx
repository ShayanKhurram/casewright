import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";

import { apiFetch, uploadDocument } from "../lib/api";
import { DOCUMENT_KINDS, Document } from "../types";

export default function EvidenceTab({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<string>(DOCUMENT_KINDS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: documents } = useQuery({
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
        <div>
          <label className="mb-1 block text-xs text-slate">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded border border-hairline px-2 py-1 text-sm"
          >
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded bg-oxblood px-3 py-1 text-sm text-paper hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p className="mb-2 text-sm text-verdict-gap">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs uppercase text-slate">
            <th className="py-1">Exhibit</th>
            <th>Kind</th>
            <th>Pages</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {documents?.map((d) => (
            <tr key={d.id} className="border-b border-hairline">
              <td className="py-1 font-mono">{d.exhibit_label}</td>
              <td>{d.kind}</td>
              <td>{d.page_count ?? "—"}</td>
              <td>{d.classification_confidence != null ? d.classification_confidence.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
