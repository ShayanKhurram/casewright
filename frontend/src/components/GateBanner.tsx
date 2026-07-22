import { useState } from "react";

import { apiFetch } from "../lib/api";
import { AgentRun } from "../types";
import Button from "./ui/Button";
import Textarea from "./ui/Textarea";

/** Full-width banner atop the workspace when a run waits at a gate (redesign plan §5): a
 * `--partial` left rail, the gate title, the affected sections, and approve/revise controls. */
export default function GateBanner({ run, onDecided }: { run: AgentRun; onDecided: () => void }) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "revise") {
    setSubmitting(decision);
    setError(null);
    try {
      await apiFetch(`/runs/${run.id}/gate`, {
        method: "POST",
        body: JSON.stringify({ decision, notes: notes || null }),
      });
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit the decision");
    } finally {
      setSubmitting(null);
    }
  }

  const sections = run.gate_payload.sections ?? [];
  const needingAttention = sections.filter((s) => s.status === "needs_attention").length;

  return (
    <div className="mb-6 rounded-card border border-border border-l-[3px] border-l-partial bg-surface p-4">
      <p className="font-display text-lg text-text">Awaiting review: {run.current_gate}</p>
      {sections.length > 0 && (
        <ul className="my-2 space-y-1">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-text">{s.heading}</span>
              <span className={s.status === "needs_attention" ? "text-gap" : "text-text-dim"}>
                {s.status} · confidence {s.confidence.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {needingAttention > 0 && <p className="mb-2 text-sm text-gap">{needingAttention} section(s) need attention.</p>}
      {error && <p className="mb-2 text-sm text-gap">{error}</p>}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="mb-2"
      />
      <div className="flex gap-2">
        <Button size="sm" loading={submitting === "approve"} disabled={!!submitting} onClick={() => decide("approve")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={submitting === "revise"}
          disabled={!!submitting}
          onClick={() => decide("revise")}
        >
          Request revision
        </Button>
      </div>
    </div>
  );
}
