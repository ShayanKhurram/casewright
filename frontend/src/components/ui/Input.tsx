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
        "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-border-strong",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
});

export default Input;