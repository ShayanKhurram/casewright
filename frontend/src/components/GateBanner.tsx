import { useState } from "react";

import { apiFetch } from "../lib/api";
import { AgentRun } from "../types";

export default function GateBanner({ run, onDecided }: { run: AgentRun; onDecided: () => void }) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function decide(decision: "approve" | "revise") {
    setSubmitting(true);
    try {
      await apiFetch(`/runs/${run.id}/gate`, {
        method: "POST",
        body: JSON.stringify({ decision, notes: notes || null }),
      });
      onDecided();
    } finally {
      setSubmitting(false);
    }
  }

  const sections = run.gate_payload.sections ?? [];
  const needingAttention = sections.filter((s) => s.status === "needs_attention").length;

  return (
    <div className="mb-4 rounded border-l-4 border-oxblood bg-paper p-4">
      <p className="font-display text-lg text-ink">Awaiting review: {run.current_gate}</p>
      <ul className="my-2 space-y-1">
        {sections.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm">
            <span className="text-ink">{s.heading}</span>
            <span className={s.status === "needs_attention" ? "text-verdict-gap" : "text-slate"}>
              {s.status} · confidence {s.confidence.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      {needingAttention > 0 && (
        <p className="mb-2 text-sm text-verdict-gap">{needingAttention} section(s) need attention.</p>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="mb-2 w-full rounded border border-hairline px-2 py-1 text-sm"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          disabled={submitting}
          onClick={() => decide("approve")}
          className="rounded bg-oxblood px-3 py-1 text-sm text-paper hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={submitting}
          onClick={() => decide("revise")}
          className="rounded border border-hairline px-3 py-1 text-sm text-ink hover:bg-hairline disabled:opacity-50"
        >
          Request revision
        </button>
      </div>
    </div>
  );
}
