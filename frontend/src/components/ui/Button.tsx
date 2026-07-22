import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover hover:-translate-y-px",
  secondary:
    "bg-surface-2 border border-border text-text hover:bg-surface hover:border-border-strong",
  ghost: "text-text-dim hover:bg-surface-2 hover:text-text",
  // bg-gap-fill, not bg-gap: white text on plain --gap only reaches 3.82:1 (T5.8 audit) —
  // gap-fill is a darker shade specifically tuned for solid fills with white text (>=4.5:1).
  destructive: "bg-gap-fill text-white hover:-translate-y-px",
};

const SIZE: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

/** Casewright button primitive. Token-only styling (no hex / arbitrary values). The loading
 * state renders a 14px spinner to the LEFT of the children and disables the button — children
 * stay mounted so the button width doesn't collapse. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, children, className, ...props },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "inline-flex select-none items-center justify-center gap-2 rounded-control font-medium",
        "transition-all duration-hover ease-casewright",
        // ring-accent-text/70, not ring-accent/40: even at full opacity, --accent only reaches
        // 3.75:1 against --bg (T5.8 audit) — a 40%-alpha ring composited down to ~1.5:1, well
        // below the 3:1 WCAG 1.4.11/2.4.11 minimum for focus indicators. accent-text at 70%
        // clears 3:1 while staying visibly translucent (not a solid ring).
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text/70",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {loading ? (
        // Deliberately NOT motion-reduce:animate-none (T5.8 audit): this spin communicates an
        // in-progress operation, not decorative motion — WCAG 2.3.3 treats state-communicating
        // animation as functional, and it's bounded by the operation's own duration rather than
        // indefinite. Every other animate-* in this app is decorative/ambient and does get the
        // reduced-motion treatment.
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
});

export default Button;