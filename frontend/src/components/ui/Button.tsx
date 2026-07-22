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
  destructive: "bg-gap text-white hover:-translate-y-px",
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {loading ? (
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