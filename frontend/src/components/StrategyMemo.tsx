import { useState } from "react";

import { StrategyMemo } from "../types";

function ChipList({ items, borderClass }: { items: string[]; borderClass: string }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className={`rounded border ${borderClass} px-1.5 py-0.5 font-mono text-xs text-slate`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function WarningList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc pl-5 text-sm text-verdict-partial">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function StrategyMemoView({
  memo,
  onGateDecision,
}: {
  memo: StrategyMemo;
  onGateDecision?: (decision: "approve" | "revise", notes: string | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function decide(decision: "approve" | "revise") {
    setSubmitting(true);
    try {
      await onGateDecision!(decision, notes || null);
    } finally {
      setSubmitting(false);
    }
  }

  const showGate = !!onGateDecision && memo.attorney_decision === null;

  return (
    <div className="rounded border border-hairline bg-paper p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          {memo.recommended_category && (
            <p className="font-display text-lg text-ink">{memo.recommended_category}</p>
          )}
          {memo.viability && <p className="text-sm text-slate">{memo.viability}</p>}
        </div>
        {memo.attorney_decision && (
          <span
            className={`rounded border px-2 py-1 font-mono text-xs uppercase ${
              memo.attorney_decision === "approve"
                ? "text-verdict-met border-verdict-met"
                : "text-verdict-partial border-verdict-partial"
            }`}
          >
            Decision: {memo.attorney_decision === "approve" ? "approved" : "revision requested"}
          </span>
        )}
      </div>

      {memo.narrative && (
        <p className="mb-3 whitespace-pre-wrap text-sm text-ink">{memo.narrative}</p>
      )}

      {memo.criteria_to_argue.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-mono text-xs uppercase text-slate">Argue</p>
          <ChipList items={memo.criteria_to_argue} borderClass="border-verdict-met" />
        </div>
      )}
      {memo.criteria_to_abandon.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-mono text-xs uppercase text-slate">Abandon</p>
          <ChipList items={memo.criteria_to_abandon} borderClass="border-hairline" />
        </div>
      )}

      {memo.evidence_gaps.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-mono text-xs uppercase text-slate">Evidence gaps</p>
          <WarningList items={memo.evidence_gaps} />
        </div>
      )}
      {memo.rfe_risks.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 font-mono text-xs uppercase text-slate">RFE risks</p>
          <WarningList items={memo.rfe_risks} />
        </div>
      )}

      {memo.attorney_notes && (
        <p className="mt-2 text-sm text-slate">
          <span className="font-mono text-xs uppercase">Notes:</span> {memo.attorney_notes}
        </p>
      )}

      {showGate && (
        <div className="mt-3 border-t border-hairline pt-3">
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
      )}
    </div>
  );
}