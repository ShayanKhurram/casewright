import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { Draft, DraftSection } from "../types";
import StatusPill from "./StatusPill";

function Section({ section, caseId }: { section: DraftSection; caseId: string }) {
  const queryClient = useQueryClient();

  async function review(decision: "approve" | "revision_requested") {
    await apiFetch(`/sections/${section.id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, comment: null }),
    });
    await queryClient.invalidateQueries({ queryKey: ["drafts", caseId] });
  }

  const blockers = section.verification_notes.blockers ?? [];

  return (
    <div
      className={`mb-3 rounded border-l-4 p-3 ${
        section.status === "needs_attention" ? "border-verdict-gap" : "border-verdict-met"
      } border-t border-r border-b border-hairline`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h4 className="font-display text-base text-ink">{section.heading}</h4>
        <StatusPill status={section.status} />
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink">{section.body}</p>
      {blockers.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-verdict-gap">
          {blockers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {section.citations.map((c) => (
          <span key={c.id} className="rounded border border-hairline px-1.5 py-0.5 font-mono text-xs text-slate">
            {c.marker} {c.verified ? "✓" : "?"}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => review("approve")}
          className="rounded border border-hairline px-2 py-1 text-xs text-ink hover:bg-hairline"
        >
          Approve
        </button>
        <button
          onClick={() => review("revision_requested")}
          className="rounded border border-hairline px-2 py-1 text-xs text-ink hover:bg-hairline"
        >
          Request revision
        </button>
      </div>
    </div>
  );
}

export default function DraftsTab({ caseId }: { caseId: string }) {
  const { data: drafts } = useQuery({
    queryKey: ["drafts", caseId],
    queryFn: () => apiFetch<Draft[]>(`/cases/${caseId}/drafts`),
  });

  if (!drafts || drafts.length === 0) {
    return <p className="text-sm text-slate">No drafts yet.</p>;
  }

  return (
    <div>
      {drafts.map((draft) => (
        <div key={draft.id} className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase text-slate">
            {draft.kind} · v{draft.version}
          </p>
          {draft.sections
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((section) => (
              <Section key={section.id} section={section} caseId={caseId} />
            ))}
        </div>
      ))}
    </div>
  );
}
