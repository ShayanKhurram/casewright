import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../lib/api";
import { humanizeAuditAction, timeAgo } from "../lib/statusTone";
import { AuditLogEntry } from "../types";

/** Overview recent-activity strip (Phase 8, T8.5). Reads the same `GET /audit-log` feed the
 * notification bell uses, rendered as a simple newest-first list. Per the source doc this section
 * is "optional, adds depth", so when the log is empty we omit the section entirely (no empty-state
 * block) — the parent `Overview` still renders even with zero audit rows. */

interface RecentActivityStripProps {
  /** Cap on rendered rows; defaults to 5 per the brief. */
  limit?: number;
}

export default function RecentActivityStrip({ limit = 5 }: RecentActivityStripProps) {
  const { data } = useQuery({
    queryKey: ["audit-log", limit],
    queryFn: () => apiFetch<AuditLogEntry[]>(`/audit-log?limit=${limit}`),
  });

  const entries = data ?? [];
  if (entries.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-text-dim">Recent activity</h2>
      <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-baseline justify-between gap-3 p-3">
            <span className="text-sm text-text">{humanizeAuditAction(entry.action, entry.detail)}</span>
            <span className="shrink-0 font-mono text-xs text-text-faint">{timeAgo(entry.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}