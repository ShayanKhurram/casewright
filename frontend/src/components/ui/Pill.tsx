export type PillTone = "run" | "partial" | "met" | "gap" | "dim";

export interface PillProps {
  /** Which token tone to render in. Callers map run/case statuses to a tone — this component
   * deliberately does NOT hardcode the plan's status vocabulary (intake/analyzing/drafting/…);
   * that mapping belongs to the screens (T5.5/T5.6/T5.7). */
  tone: PillTone;
  label: string;
  className?: string;
}

/** Per-tone class literals. `text` is the full-strength token color for the dot + label; `fill`
 * is the same color at 10% alpha for the pill background (`bg-<tone>/10`); `dot` is the solid
 * color for the non-pulsing dot. These are written as COMPLETE literals (not interpolated) so
 * Tailwind's JIT scanner detects each `bg-<tone>/10` class and emits it. This relies on the
 * T5.1 token colors being defined as `rgb(var(--x-rgb) / <alpha-value>)` in tailwind.config.js
 * — a bare `var(--x)` color would make the `/10` modifier emit no CSS at all. */
// `run`'s text uses `text-run-text`, not `text-run` (T5.8 WCAG audit): the label sits on its
// own `bg-run/10` tint, which lightens the effective background just enough that plain --run
// (4.97:1 on bare surface-2) drops to 4.31:1 against the tinted fill — run-text clears both.
// `dot` stays plain --run (a non-text UI dot only needs 3:1, comfortably met either way).
const TONE: Record<PillTone, { text: string; fill: string; dot: string }> = {
  run: { text: "text-run-text", fill: "bg-run/10", dot: "bg-run" },
  partial: { text: "text-partial", fill: "bg-partial/10", dot: "bg-partial" },
  met: { text: "text-met", fill: "bg-met/10", dot: "bg-met" },
  gap: { text: "text-gap", fill: "bg-gap/10", dot: "bg-gap" },
  dim: { text: "text-text-dim", fill: "bg-text-dim/10", dot: "bg-text-dim" },
};

/** Status pill — dot + label, `rounded-pill`, 10%-alpha tone background, full-tone text/dot.
 * For `tone="run"` the dot pulses using the exact two-span `animate-ping` + solid-dot layering
 * from `components/shell/RunIndicator.tsx`. */
export default function Pill({ tone, label, className }: PillProps) {
  const t = TONE[tone];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-pill py-0.5 px-2",
        "font-mono text-[11px] uppercase tracking-wide",
        t.fill,
        t.text,
        className ?? "",
      ].join(" ")}
    >
      {tone === "run" ? (
        <span className="relative flex h-2 w-2">
          {/* motion-reduce:animate-none — T5.8 reduced-motion audit. */}
          <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-pill bg-run opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-pill bg-run" />
        </span>
      ) : (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-pill ${t.dot}`} />
      )}
      {label}
    </span>
  );
}