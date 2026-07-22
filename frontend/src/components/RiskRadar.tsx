import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import type { RiskRadar as RiskRadarData } from "../types";

function meterColor(risk_score: number): string {
  if (risk_score < 35) return "bg-met";
  if (risk_score <= 65) return "bg-partial";
  return "bg-gap";
}

/** Per-criterion RFE-risk radar (plan §new-feature): a deterministic, no-LLM derivation over
 * the already-persisted criterion matrix, shown on the Strategy tab above the memo. */
export default function RiskRadar({ caseId }: { caseId: string }) {
  const { data, error } = useQuery({
    queryKey: ["risk-radar", caseId],
    queryFn: () => apiFetch<RiskRadarData>(`/cases/${caseId}/risk-radar`),
    retry: false,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (error || !data) return null;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4 mb-4">
      <p className="mb-3 text-xs text-text-faint">Modeled risk, not a guarantee.</p>
      <div className="space-y-2">
        {data.criteria.map((c) => (
          <div key={c.criterion_key}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(c.criterion_key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(c.criterion_key);
                }
              }}
              className="flex items-center gap-3 cursor-pointer"
            >
              <span className="text-sm text-text">{c.criterion_key}</span>
              <div className="bg-surface-2 rounded-pill h-1.5 w-32 overflow-hidden">
                <div
                  className={meterColor(c.risk_score)}
                  style={{ width: `${c.risk_score}%`, height: "100%" }}
                />
              </div>
              <span className="font-mono text-[10px] uppercase text-text-faint">{c.confidence_band}</span>
            </div>
            {expanded.has(c.criterion_key) && (
              <div className="rounded-control border border-border bg-surface-2 p-2 mt-1">
                <p className="text-xs text-text-dim">
                  <strong>Why:</strong> {c.why}
                </p>
                <p className="text-xs text-text-dim">
                  <strong>Fix:</strong> {c.fix}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      {data.general_risks.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 font-mono text-xs uppercase tracking-wide text-text-dim">Other flagged risks</p>
          <ul className="list-disc pl-5 text-xs text-text-dim">
            {data.general_risks.map((risk, i) => (
              <li key={`${risk.slice(0, 16)}-${i}`}>{risk}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}