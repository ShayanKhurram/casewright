import { useState } from "react";

import { useStaggeredReveal } from "../lib/useStaggeredReveal";
import { CriterionAssessment } from "../types";
import Pill from "./ui/Pill";

const VERDICT_RAIL: Record<CriterionAssessment["verdict"], string> = {
  met: "border-l-met",
  partial: "border-l-partial",
  weak: "border-l-gap",
  absent: "border-l-gap",
};

const VERDICT_TONE: Record<CriterionAssessment["verdict"], "met" | "partial" | "gap"> = {
  met: "met",
  partial: "partial",
  weak: "gap",
  absent: "gap",
};

const METER_COLOR: Record<CriterionAssessment["verdict"], string> = {
  met: "bg-met",
  partial: "bg-partial",
  weak: "bg-gap",
  absent: "bg-gap",
};

function ConfidenceMeter({ confidence, verdict }: { confidence: number; verdict: CriterionAssessment["verdict"] }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-pill bg-surface-2">
        <div className={["h-1 rounded-pill", METER_COLOR[verdict]].join(" ")} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-text-faint">{pct}%</span>
    </div>
  );
}

function CriterionCard({ assessment, staggerIndex }: { assessment: CriterionAssessment; staggerIndex?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = !!(assessment.reasoning.standard || assessment.reasoning.analysis || assessment.reasoning.gaps);

  return (
    <div
      className={[
        "mb-3 rounded-card border-l-[3px] border-y border-r border-border bg-surface p-3",
        VERDICT_RAIL[assessment.verdict],
        staggerIndex !== undefined ? "animate-reveal-up" : "",
      ].join(" ")}
      style={staggerIndex !== undefined ? { animationDelay: `${staggerIndex * 60}ms` } : undefined}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase text-text-dim">{assessment.criterion_key}</span>
        <div className="flex items-center gap-3">
          <ConfidenceMeter confidence={assessment.confidence} verdict={assessment.verdict} />
          <Pill tone={VERDICT_TONE[assessment.verdict]} label={assessment.verdict} />
        </div>
      </div>

      {hasReasoning && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mb-1 font-mono text-[10px] uppercase tracking-wide text-text-faint hover:text-text-dim"
        >
          {expanded ? "▾ Hide reasoning" : "▸ Show reasoning"}
        </button>
      )}
      {expanded && (
        <div className="mb-1">
          {assessment.reasoning.standard && (
            <p className="text-sm text-text">
              <span className="font-mono text-xs uppercase text-text-dim">Standard:</span>{" "}
              {assessment.reasoning.standard}
            </p>
          )}
          {assessment.reasoning.analysis && <p className="mt-1 text-sm text-text">{assessment.reasoning.analysis}</p>}
          {assessment.reasoning.gaps && <p className="mt-1 text-sm text-partial">{assessment.reasoning.gaps}</p>}
        </div>
      )}

      {assessment.evidence_refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {assessment.evidence_refs.map((ref, i) => (
            <span
              key={`${ref}-${i}`}
              className="rounded-control border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-text-dim"
            >
              {ref}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CriterionMatrix({ assessments }: { assessments: CriterionAssessment[] }) {
  const sorted = assessments.slice().sort((a, b) => a.criterion_key.localeCompare(b.criterion_key));
  const staggerMap = useStaggeredReveal(sorted.map((a) => a.id));

  if (assessments.length === 0) {
    return <p className="text-sm text-text-dim">No criteria assessed yet.</p>;
  }

  return (
    <div>
      {sorted.map((a) => (
        <CriterionCard key={a.id} assessment={a} staggerIndex={staggerMap.get(a.id)} />
      ))}
    </div>
  );
}
