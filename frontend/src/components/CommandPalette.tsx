import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { Case } from "../types";

/** Global keyboard-triggered command palette (⌘K / Ctrl+K). Lets a user jump to any case, or
 * — when already inside a case workspace — to one of its 6 tabs, via the URL (deep-linkable).
 *
 * The case list query shares TanStack Query's `["cases"]` cache with Dashboard.tsx, so opening
 * the palette adds no extra network cost once Dashboard has already loaded it.
 *
 * Esc-to-close is cmdk's built-in Command.Dialog behavior (backed by Radix Dialog) — no custom
 * Esc handler is layered on top.
 *
 * Group headings are styled via the embedded `<style>` block targeting cmdk's internal
 * `[cmdk-group-heading]` attribute selector — cmdk renders the `heading` prop on a bare-
 * attribute element (no `data-` prefix), which Tailwind's arbitrary variants can't reach, so
 * plain CSS is the cleanest path that stays within this one file (no edits to index.css). */
const TAB_NAMES = ["Overview", "Evidence", "Criteria", "Strategy", "Drafts", "RFE"] as const;

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // ⌘K / Ctrl+K toggles the palette. preventDefault so the browser's own "search history"/
  // "focus address bar" bindings on that combo don't also fire.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });

  const caseMatch = location.pathname.startsWith("/cases/")
    ? location.pathname.slice("/cases/".length).split("/")[0]
    : null;

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command palette">
      <div className="fixed inset-0 z-50 bg-bg/60" />
      <div className="fixed left-1/2 top-[15%] z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface shadow-elevated">
        <Command.Input
          placeholder="Search cases, navigate…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-text-faint"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-text-dim">
            No results.
          </Command.Empty>

          <Command.Group heading="Cases" className="text-text">
            {(cases ?? []).map((c) => (
              <Command.Item
                key={c.id}
                value={c.beneficiary_name}
                onSelect={() => {
                  navigate(`/cases/${c.id}`);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between rounded-control px-3 py-2 text-sm text-text aria-selected:bg-surface-2"
              >
                <span>{c.beneficiary_name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-text-faint">
                  {c.visa_category}
                </span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Navigation" className="text-text">
            <Command.Item
              value="Dashboard"
              onSelect={() => {
                navigate("/");
                setOpen(false);
              }}
              className="flex cursor-pointer items-center rounded-control px-3 py-2 text-sm text-text aria-selected:bg-surface-2"
            >
              Dashboard
            </Command.Item>
          </Command.Group>

          {caseMatch && (
            <Command.Group heading="Tabs" className="text-text">
              {TAB_NAMES.map((tab) => (
                <Command.Item
                  key={tab}
                  value={tab}
                  onSelect={() => {
                    navigate(`/cases/${caseMatch}?tab=${tab}`);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center rounded-control px-3 py-2 text-sm text-text aria-selected:bg-surface-2"
                >
                  {tab}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>

      <style>{`
        [cmdk-group-heading] {
          font-family: "IBM Plex Mono", monospace;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-faint);
          padding: 0.75rem 0.75rem 0.25rem;
        }
      `}</style>
    </Command.Dialog>
  );
}