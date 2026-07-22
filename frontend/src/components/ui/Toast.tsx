import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useContext } from "react";

import Button from "./Button";

export type ToastVariant = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  variant: ToastVariant;
  title: string;
  description?: string;
  action?: ToastAction;
}

export interface ToastRecord extends ToastInput {
  id: number;
}

export interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Call inside a component rendered beneath <ToastProvider>. Returns a `toast()` function that
 * enqueues a toast. Must be used within a <ToastProvider> tree. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

/** 3px left accent per variant — `met` (success) / `gap` (error) / `run` (info). */
const ACCENT_BORDER: Record<ToastVariant, string> = {
  success: "border-l-met",
  error: "border-l-gap",
  info: "border-l-run",
};

export interface ToastProps {
  record: ToastRecord;
  onDismiss: (id: number) => void;
}

/** A single toast. `bg-surface-2`, hairline border, elevated shadow, 3px left accent. Auto-
 * dismisses after 5s (Radix `duration`) and on swipe (Radix default). The optional `action` is
 * rendered as a small secondary Button (the plan's "retry" affordance) and dismisses the toast
 * after firing. */
function Toast({ record, onDismiss }: ToastProps) {
  const { variant, title, description, action, id } = record;
  return (
    <ToastPrimitive.Root
      duration={5000}
      open
      onOpenChange={(open) => {
        if (!open) onDismiss(id);
      }}
      className={[
        "pointer-events-auto flex items-start gap-3 rounded-card border border-border border-l-[3px]",
        ACCENT_BORDER[variant],
        "bg-surface-2 p-3 shadow-elevated",
      ].join(" ")}
    >
      <div className="flex-1">
        <ToastPrimitive.Title className="text-sm font-medium text-text">
          {title}
        </ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="mt-0.5 text-xs text-text-dim">
            {description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      {action ? (
        <ToastPrimitive.Action asChild altText={action.label}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              action.onClick();
              onDismiss(id);
            }}
          >
            {action.label}
          </Button>
        </ToastPrimitive.Action>
      ) : null}
    </ToastPrimitive.Root>
  );
}

export default Toast;