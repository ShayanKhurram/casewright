import { forwardRef, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Text input primitive. `bg-surface`, hairline border, faint placeholder, accent focus ring.
 * Forwards its ref and all native <input> attributes. */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[
        "w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text",
        "placeholder:text-text-faint",
        "transition-colors duration-hover",
        // ring-accent-text/70, not ring-accent/40 — see Button.tsx's comment (T5.8 WCAG audit):
        // --accent can't reach the 3:1 focus-indicator minimum at a translucent alpha.
        "focus:outline-none focus:ring-2 focus:ring-accent-text/70 focus:border-border-strong",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
});

export default Input;