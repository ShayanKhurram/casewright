import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { Deadline } from "../types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Full literals (not `bg-${tone}`) so Tailwind's JIT scanner emits each class.
const DOT_TONE: Record<"gap" | "partial" | "met", string> = {
  gap: "bg-gap",
  partial: "bg-partial",
  met: "bg-met",
};

function tone(date: Date): "gap" | "partial" | "met" {
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  return days < 0 ? "gap" : days <= 14 ? "partial" : "met";
}

/** Local-date key (not `toISOString`, which shifts by timezone offset) so a deadline lands on
 * the calendar day it's actually due, not the UTC day. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Firm-wide deadline calendar (Phase 8, T8.4). Hand-rolled month grid over `GET /deadlines`
 * (no date-fns dependency — this app has none, plain Date math matches its existing
 * convention). Click a day's chip to jump to that case. */
export default function Calendar() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { data, isLoading } = useQuery({
    queryKey: ["deadlines"],
    queryFn: () => apiFetch<Deadline[]>("/deadlines"),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of data ?? []) {
      // `d.date` is a plain YYYY-MM-DD date string from the API — parse as local, not UTC.
      const [y, m, day] = d.date.split("-").map(Number);
      const key = dateKey(new Date(y, m - 1, day));
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-text">Calendar</h1>
          <p className="mt-2 text-text-dim">Filing and RFE response deadlines across every case.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-control p-1.5 text-text-dim hover:bg-surface-2 hover:text-text"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="w-36 text-center font-mono text-sm text-text">
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-control p-1.5 text-text-dim hover:bg-surface-2 hover:text-text"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-6 text-sm text-text-dim">Loading…</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="p-2 text-center font-mono text-[11px] uppercase tracking-wide text-text-faint">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              const deadlines = date ? (byDay.get(dateKey(date)) ?? []) : [];
              const isToday = date != null && dateKey(date) === dateKey(new Date());
              return (
                <div
                  key={i}
                  className={[
                    "min-h-24 border-b border-r border-border p-2",
                    i % 7 === 6 ? "border-r-0" : "",
                  ].join(" ")}
                >
                  {date && (
                    <>
                      <p className={["font-mono text-xs", isToday ? "text-accent-text" : "text-text-faint"].join(" ")}>
                        {date.getDate()}
                      </p>
                      <div className="mt-1 flex flex-col gap-1">
                        {deadlines.map((d) => (
                          <button
                            key={`${d.case_id}-${d.kind}-${d.source_id ?? "filing"}`}
                            onClick={() => navigate(`/cases/${d.case_id}`)}
                            className="flex items-center gap-1.5 truncate rounded-control px-1.5 py-0.5 text-left text-[11px] text-text-dim hover:bg-surface-2 hover:text-text"
                            title={`${d.beneficiary_name} — ${d.kind === "rfe_response" ? "RFE response" : "Filing"} due`}
                          >
                            <span className={["h-1.5 w-1.5 shrink-0 rounded-pill", DOT_TONE[tone(date)]].join(" ")} />
                            <span className="truncate">{d.beneficiary_name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
