import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { apiFetch } from "../../lib/api";
import { groupOf } from "../../lib/caseGroups";
import { humanizeAuditAction } from "../../lib/statusTone";
import { ActiveRun, AuditLogEntry, Case } from "../../types";

/** Notification feed (Phase 8, T8.5) — assembles a feed client-side from already-fetched query
 * caches, no new endpoint beyond `GET /audit-log`. Items: needs-review cases ("X is waiting on
 * your review"), active runs ("Y's {graph} run is in progress"), and the 5 most recent audit-log
 * entries humanized via `humanizeAuditAction`. Badge dot on the bell exactly when the combined
 * feed is non-empty. The "No new notifications." copy is kept as the genuine empty state (carried
 * verbatim from T8.1's placeholder — the brief says don't replace the empty-state string). */

interface FeedItem {
  key: string;
  text: string;
  to: string | null;
}

export default function NotificationBell() {
  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });
  const { data: activeRuns } = useQuery({
    queryKey: ["runs", "active"],
    queryFn: () => apiFetch<ActiveRun[]>("/runs/active"),
    refetchInterval: (query) => (query.state.data && query.state.data.length > 0 ? 5000 : false),
  });
  const { data: auditLog } = useQuery({
    queryKey: ["audit-log", 5],
    queryFn: () => apiFetch<AuditLogEntry[]>("/audit-log?limit=5"),
  });

  const items = useMemo<FeedItem[]>(() => {
    const review: FeedItem[] = (cases ?? [])
      .filter((c) => groupOf(c.status) === "review")
      .map((c) => ({
        key: `review-${c.id}`,
        text: `${c.beneficiary_name} is waiting on your review`,
        to: `/cases/${c.id}`,
      }));

    const runs: FeedItem[] = (activeRuns ?? []).map((r) => ({
      key: `run-${r.id}`,
      text: `${r.beneficiary_name}'s ${r.graph} run is in progress`,
      to: `/cases/${r.case_id}`,
    }));

    const audit: FeedItem[] = (auditLog ?? []).map((e) => ({
      key: `audit-${e.id}`,
      text: humanizeAuditAction(e.action, e.detail),
      to: e.case_id ? `/cases/${e.case_id}` : null,
    }));

    return [...review, ...runs, ...audit];
  }, [cases, activeRuns, auditLog]);

  const hasFeed = items.length > 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-control text-text-dim hover:bg-surface-2 hover:text-text"
        >
          <Bell size={16} />
          {hasFeed && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-partial" aria-hidden />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-card border border-border bg-surface-2 p-3 shadow-elevated"
        >
          {hasFeed ? (
            <ul className="space-y-1">
              {items.map((item) =>
                item.to ? (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className="block rounded-control px-2 py-1.5 text-sm text-text hover:bg-surface"
                    >
                      {item.text}
                    </Link>
                  </li>
                ) : (
                  <li key={item.key} className="px-2 py-1.5 text-sm text-text-dim">
                    {item.text}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="text-sm text-text-dim">No new notifications.</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}