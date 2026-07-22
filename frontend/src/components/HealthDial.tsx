import { useState } from "react";

import type { CaseHealth } from "../types";

/** Color tone by score band — reuses the existing semantic tokens (met/partial/gap) so the
 * dial always reads consistently with the rest of the case's status coloring. */
function toneClass(score: number): string {
  if (score >= 70) return "text-met";
  if (score >= 40) return "text-partial";
  return "text-gap";
}

/** Small radial dial (stroke-dasharray SVG ring, same technique as PipelineTracker's FanRing
 * but sized up to ~40px) with the numeric score centered over it. Click toggles a breakdown
 * panel listing the three component scores + criteria met/total — never a black-box number.
 *
 * Used inside Dashboard's CaseCard, which wraps the whole card in a <Link>, so the click
 * handler stops propagation to avoid navigating away when the dial is toggled. */
export default function HealthDial({ health }: { health: CaseHealth }) {
  const [expanded, setExpanded] = useState(false);
  const size = 40;
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const frac = Math.min(health.score, 100) / 100;
  const tone = toneClass(health.score);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExpanded((s) => !s);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Case health score ${health.score}`}
        aria-expanded={expanded}
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={tone} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth="4"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - frac)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span
          className={["absolute inset-0 flex items-center justify-center text-xs font-mono font-medium", tone].join(" ")}
        >
          {health.score}
        </span>
      </button>
      {expanded && (
        <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-card border border-border bg-surface-2 p-3 text-xs text-text-dim shadow-elevated">
          <p className="mb-1.5 text-text">Criteria: {health.criteria_met}/{health.criteria_total} met</p>
          <p>Criteria {health.criteria_score}</p>
          <p>Evidence {health.evidence_score}</p>
          <p>Verification {health.verification_score}</p>
        </div>
      )}
    </div>
  );
}