import type { LabelHTMLAttributes } from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

/** Field label — 12px, uppercase, dim, wide tracking. Compose freely with <Input>/<FieldError>;
 * this is a standalone primitive, not a combined FormField. */
export default function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={[
        "text-xs uppercase tracking-wide text-text-dim font-medium",
        className ?? "",
      ].join(" ")}
      {...props}
    />
  );
}