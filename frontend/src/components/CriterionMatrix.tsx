import { CriterionAssessment } from "../types";

const VERDICT_RAIL: Record<CriterionAssessment["verdict"], string> = {
  met: "border-verdict-met",
  partial: "border-verdict-partial",
  weak: "border-verdict-gap",
  absent: "border-verdict-gap",
};

const VERDICT_BADGE: Record<CriterionAssessment["verdict"], string> = {
  met: "text-verdict-met border-verdict-met",
  partial: "text-verdict-partial border-verdict-partial",
  weak: "text-verdict-gap border-verdict-gap",
  absent: "text-verdict-gap border-verdict-gap",
};

function VerdictBadge({ verdict }: { verdict: CriterionAssessment["verdict"] }) {
  return (
    <span className={`rounded border px-2 py-1 font-mono text-xs uppercase ${VERDICT_BADGE[verdict]}`}>
      {verdict}
    </span>
  );
}

function CriterionCard({ assessment }: { assessment: CriterionAssessment }) {
  const confidencePct = `${Math.round(assessment.confidence * 100)}%`;
  return (
    <div
      className={`mb-3 rounded border-l-4 ${VERDICT_RAIL[assessment.verdict]} border-t border-r border-b border-hairline bg-paper p-3`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs uppercase text-slate">{assessment.criterion_key}</span>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={assessment.verdict} />
          <span className="font-mono text-xs text-slate">{confidencePct}</span>
        </div>
      </div>
      {assessment.reasoning.standard && (
        <p className="text-sm text-ink">
          <span className="font-mono text-xs uppercase text-slate">Standard:</span>{" "}
          {assessment.reasoning.standard}
        </p>
      )}
      {assessment.reasoning.analysis && (
        <p className="text-sm text-ink">{assessment.reasoning.analysis}</p>
      )}
      {assessment.reasoning.gaps && (
        <p className="text-sm text-verdict-partial">{assessment.reasoning.gaps}</p>
      )}
      {assessment.evidence_refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {assessment.evidence_refs.map((ref, i) => (
            <span
              key={`${ref}-${i}`}
              className="rounded border border-hairline px-1.5 py-0.5 font-mono text-xs text-slate"
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
  if (assessments.length === 0) {
    return <p className="text-sm text-slate">No criteria assessed yet.</p>;
  }

  const sorted = assessments.slice().sort((a, b) => a.criterion_key.localeCompare(b.criterion_key));

  return (
    <div>
      {sorted.map((a) => (
        <CriterionCard key={a.id} assessment={a} />
      ))}
    </div>
  );
}