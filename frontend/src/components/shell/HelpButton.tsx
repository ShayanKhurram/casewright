import * as Popover from "@radix-ui/react-popover";
import { HelpCircle } from "lucide-react";

/** Persistent "?" help affordance (Phase 8, T8.1), matching
 * `docs/internal/casewright-dashboard-shell-plan.md` §1's "persistent help affordance" — bottom-right, fixed,
 * on every authenticated screen. Lists real shortcuts only; extend this list if new ones ship. */
export default function HelpButton() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Help and keyboard shortcuts"
          className="fixed bottom-4 right-4 z-40 flex h-9 w-9 items-center justify-center rounded-pill border border-border bg-surface text-text-dim shadow-elevated hover:border-border-strong hover:text-text"
        >
          <HelpCircle size={18} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="top"
          sideOffset={8}
          className="z-50 w-64 rounded-card border border-border bg-surface-2 p-3 shadow-elevated"
        >
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-text-faint">
            Keyboard shortcuts
          </p>
          <div className="flex items-center justify-between text-sm text-text-dim">
            <span>Command palette</span>
            <kbd className="rounded-control border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text">
              ⌘K
            </kbd>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
