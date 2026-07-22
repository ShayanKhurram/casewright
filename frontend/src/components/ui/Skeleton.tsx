import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/** Shared shimmer surface treatment — the `animate-shimmer` keyframe (1.6s 0.03→0.07→0.03
 * opacity sweep) is defined in tailwind.config.js from T5.1; we just apply it. */
const SHIMMER = "animate-shimmer bg-surface-2";

// ---------------------------------------------------------------------------
// Visual primitives
// ---------------------------------------------------------------------------

export interface SkeletonLineProps {
  /** CSS width value, e.g. "60%" or "120px". Defaults to "100%". */
  width?: string;
  className?: string;
}

/** A single skeleton line: `h-3.5` with the shimmer treatment and `rounded-control`. Width is
 * applied via inline style so callers can pass percentage or px values without touching the
 * class string (Tailwind can't safely interpolate arbitrary widths). */
export function SkeletonLine({ width = "100%", className }: SkeletonLineProps) {
  return (
    <div
      className={["h-3.5 rounded-control", SHIMMER, className ?? ""].join(" ")}
      style={{ width }}
    />
  );
}

export interface SkeletonBlockProps {
  /** CSS width value. Defaults to "100%". */
  width?: string;
  /** CSS height value. Defaults to "100%". */
  height?: string;
  className?: string;
}

/** A rectangular skeleton block. Width/height come from inline style so callers can use
 * percentage or px values freely. */
export function SkeletonBlock({ width = "100%", height = "100%", className }: SkeletonBlockProps) {
  const style: CSSProperties = { width, height };
  return (
    <div
      className={["rounded-control", SHIMMER, className ?? ""].join(" ")}
      style={style}
    />
  );
}

export interface SkeletonPillProps {
  className?: string;
}

/** A skeleton pill sized to match the ui-kit `Pill` (status pill) shape — `h-5 w-16
 * rounded-pill` with shimmer. */
export function SkeletonPill({ className }: SkeletonPillProps) {
  return (
    <div
      className={["h-5 w-16 rounded-pill", SHIMMER, className ?? ""].join(" ")}
    />
  );
}

export interface SkeletonRowProps {
  className?: string;
}

/** The generic "list row" skeleton: a small square block (avatar/icon-shaped, `h-8 w-8
 * rounded-control`) beside a stacked pair of lines at 70% then 40% width. */
export function SkeletonRow({ className }: SkeletonRowProps) {
  return (
    <div className={["flex items-center gap-3", className ?? ""].join(" ")}>
      <div
        className={["h-8 w-8 shrink-0 rounded-control", SHIMMER].join(" ")}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <SkeletonLine width="70%" />
        <SkeletonLine width="40%" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkeletonGate — anti-flash loading wrapper
// ---------------------------------------------------------------------------

export interface SkeletonGateProps {
  /** When true, the skeleton is (eventually) shown. */
  loading: boolean;
  /** Skeleton content rendered while `loading` is true (after the 150ms anti-flash delay). */
  skeleton: ReactNode;
  /** Real content rendered once `loading` is false. Kept mounted and faded to opacity-0 while
   * the skeleton is showing so the container keeps a stable height during the crossfade. */
  children: ReactNode;
  className?: string;
}

/** Wraps a loading region: shows `skeleton` once `loading` has been true for >= 150ms (so
 * sub-150ms queries never flash a skeleton), then crossfades to `children` over `duration-reveal`
 * (200ms) as `loading` flips back to false. The skeleton itself is absolutely overlaid so the
 * children always hold the layout — the fade is pure CSS opacity, no framer-motion. The 150ms
 * timer lives inside this component so every caller gets the anti-flash behavior for free. */
export function SkeletonGate({ loading, skeleton, children, className }: SkeletonGateProps) {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) {
      // Flip back immediately when loading clears — the crossfade to children is driven by
      // the `loading` flag itself, not by this state.
      setShowSkeleton(false);
      return;
    }
    let id: number | undefined;
    id = window.setTimeout(() => setShowSkeleton(true), 150);
    return () => {
      if (id !== undefined) window.clearTimeout(id);
    };
  }, [loading]);

  return (
    <div className={["relative", className ?? ""].join(" ")}>
      {/* Children always mounted (hold layout), faded out while the skeleton is showing. */}
      <div
        className={[
          "transition-opacity duration-reveal",
          loading ? "opacity-0" : "opacity-100",
        ].join(" ")}
      >
        {children}
      </div>
      {/* Skeleton overlaid absolutely once the 150ms anti-flash delay has elapsed. */}
      {showSkeleton ? (
        <div
          className={[
            "absolute inset-0 transition-opacity duration-reveal",
            loading ? "opacity-100" : "opacity-0",
          ].join(" ")}
        >
          {skeleton}
        </div>
      ) : null}
    </div>
  );
}