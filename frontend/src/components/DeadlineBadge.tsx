/** Shared day-countdown math for filing/RFE deadlines. Extracted (Phase 8, T8.2) so the
 * Overview's Deadlines rail and stat cards reuse the exact same thresholds + ceiling convention
 * as the existing per-case badge, rather than re-deriving a slightly different formula. */
export function deadlineDays(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

/** Same color thresholds the badge uses: overdue → gap (red), <=14d → partial (amber), >14d →
 * met (green). Returned as bare tone names so callers can compose either `text-<tone>` (badge,
 * stat-card number) or `bg-<tone>` (DeadlinesRail progress fill) from them. */
export function deadlineTone(days: number): "gap" | "partial" | "met" {
  return days < 0 ? "gap" : days <= 14 ? "partial" : "met";
}

export default function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;

  const days = deadlineDays(deadline);
  // Full literals (not interpolated `text-${tone}`) so Tailwind's JIT scanner emits each
  // class — mirrors the pattern in ui/Pill.tsx's TONE table.
  const color = days < 0 ? "text-gap" : days <= 14 ? "text-partial" : "text-met";
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`;

  return (
    <div className="flex items-baseline gap-2 font-mono text-sm">
      <span className="text-text-dim">Response due {deadline}</span>
      <span className={color}>({label})</span>
    </div>
  );
}