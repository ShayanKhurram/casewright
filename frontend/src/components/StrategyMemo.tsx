import { useState } from "react";

import { StrategyMemo } from "../types";
import Button from "./ui/Button";
import Pill from "./ui/Pill";
import Textarea from "./ui/Textarea";

function RailedList({ items, tone }: { items: string[]; tone: "met" | "dim" }) {
  if (items.length === 0) return null;
  const railClass = tone === "met" ? "border-l-met" : "border-l-border-strong";
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className={["mb-1 border-l-[3px] py-0.5 pl-2 text-sm text-text", railClass].join(" ")}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function RiskCard({ risk }: { risk: string }) {
  return (
    <div className="mb-2 rounded-card border-l-[3px] border-l-partial border-y border-r border-border bg-surface-2 p-2.5 text-sm text-text">
      {risk}
    </div>
  );
}

/** Strategy memo as a document surface (redesign plan §8): generous padding, serif section
 * heads, argue/abandon as railed lists, RFE-risk cards, and — when a decision is still pending
 * — sticky gate controls at the bottom. */
export default function StrategyMemoView({
  memo,
  onGateDecision,
}: {
  memo: StrategyMemo;
  onGateDecision?: (decision: "approve" | "revise", notes: string | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<"approve" | "revise" | null>(null);

  async function decide(decision: "approve" | "revise") {
    setSubmitting(decision);
    try {
      await onGateDecision!(decision, notes || null);
    } finally {
      setSubmitting(null);
    }
  }

  const showGate = !!onGateDecision && memo.attorney_decision === null;

  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          {memo.recommended_category && (
            <p className="font-display text-xl text-text">{memo.recommended_category}</p>
          )}
          {memo.viability && <p className="mt-1 text-sm text-text-dim">{memo.viability}</p>}
        </div>
        {memo.attorney_decision && (
          <Pill
            tone={memo.attorney_decision === "approve" ? "met" : "partial"}
            label={memo.attorney_decision === "approve" ? "Decision: approved" : "Decision: revision requested"}
          />
        )}
      </div>

      {memo.narrative && <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-text">{memo.narrative}</p>}

      {memo.criteria_to_argue.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 font-display text-sm text-text">Argue</h3>
          <RailedList items={memo.criteria_to_argue} tone="met" />
        </div>
      )}
      {memo.criteria_to_abandon.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 font-display text-sm text-text">Abandon</h3>
          <RailedList items={memo.criteria_to_abandon} tone="dim" />
        </div>
      )}

      {memo.evidence_gaps.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 font-display text-sm text-text">Evidence gaps</h3>
          {memo.evidence_gaps.map((gap, i) => (
            <RiskCard key={i} risk={gap} />
          ))}
        </div>
      )}
      {memo.rfe_risks.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 font-display text-sm text-text">RFE risks</h3>
          {memo.rfe_risks.map((risk, i) => (
            <RiskCard key={i} risk={risk} />
          ))}
        </div>
      )}

      {memo.attorney_notes && (
        <p className="mt-2 text-sm text-text-dim">
          <span className="font-mono text-xs uppercase text-text-faint">Notes:</span> {memo.attorney_notes}
        </p>
      )}

      {showGate && (
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t border-border bg-surface p-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="mb-2"
          />
          <div className="flex flex-wrap gap-2">
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
      )}
    </div>
  );
}
