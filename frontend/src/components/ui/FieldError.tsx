import { useEffect, useState, type ReactNode } from "react";

export interface FieldErrorProps {
  children?: ReactNode;
  className?: string;
}

/** Inline validation error — 12px in the `gap` tone, fading in over `duration-hover` on mount
 * via a CSS opacity transition (no framer-motion). Renders nothing when `children` is absent
 * so callers can pass `error ?? undefined` and let React unmount it. */
export default function FieldError({ children, className }: FieldErrorProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
  }, []);

  if (!children) return null;

  return (
    <p
      className={[
        "text-xs text-gap transition-opacity duration-hover",
        shown ? "opacity-100" : "opacity-0",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </p>
  );
}