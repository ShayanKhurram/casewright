import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/** Thin wrapper around @radix-ui/react-dialog with the ui-kit's standard modal chrome: dim
 * backdrop, `surface` elevated card, serif title, close button. Open/close transitions use
 * Radix's `data-state` attribute with plain Tailwind `data-[state=...]` variants (native to
 * Tailwind v3, no `tailwindcss-animate` plugin — that plugin isn't installed, and classes like
 * `animate-in`/`fade-in` would silently emit no CSS without it). Takes `children` as the body
 * rather than a compound-component API — this app only needs simple single-purpose dialogs so
 * far (redesign plan §8's "New case" dialog). */
export default function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={[
            "fixed inset-0 z-50 bg-bg/70",
            "transition-opacity duration-panel ease-casewright",
            "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
          ].join(" ")}
        />
        <DialogPrimitive.Content
          className={[
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-card border border-border bg-surface p-6 shadow-elevated",
            "transition-all duration-panel ease-casewright",
            "data-[state=closed]:scale-95 data-[state=closed]:opacity-0",
            "data-[state=open]:scale-100 data-[state=open]:opacity-100",
          ].join(" ")}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <DialogPrimitive.Title className="font-display text-lg text-text">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-text-dim">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <button
                aria-label="Close"
                className="rounded-control p-1 text-text-faint hover:bg-surface-2 hover:text-text"
              >
                <X size={16} />
              </button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
