import { forwardRef, type TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multiline text input primitive. Same surface/border/focus treatment as <Input>. */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
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

export default Textarea;