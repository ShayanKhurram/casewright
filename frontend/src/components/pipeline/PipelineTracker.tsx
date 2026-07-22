import { Fragment, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { normalizeProgress } from "../../lib/runProgress";
import type { RunProgress } from "../../types";
import {
  PETITION_TOPOLOGY,
  RFE_TOPOLOGY,
  type PipelineNode,
} from "./graphTopology";

export interface PipelineTrackerProps {
  graph: "petition" | "rfe";
  status: "running" | "waiting_review" | "completed" | "failed";
  // Partial, not RunProgress: real runs can have progress = {} (predates T5.3, or crashed
  // before ever streaming a node event) — normalized to a safe full shape below.
  progress: Partial<RunProgress>;
}

/** Per-node visual state, derived in the exact precedence the plan specifies. */
type NodeState = "failed" | "done" | "gate-waiting" | "active" | "pending";

function deriveState(node: PipelineNode, status: PipelineTrackerProps["status"], progress: RunProgress): NodeState {
  if (status === "failed" && node.key === progress.current_node) return "failed";
  if (progress.completed_nodes.includes(node.key)) return "done";
  if (node.isGate && node.key === progress.current_node && status === "waiting_review") {
    return "gate-waiting";
  }
  if (node.key === progress.current_node) return "active";
  return "pending";
}

const LABEL_COLOR: Record<NodeState, string> = {
  failed: "text-gap",
  done: "text-met",
  "gate-waiting": "text-partial",
  active: "text-run",
  pending: "text-text-faint",
};

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

/** Small SVG fraction ring (done/total) for an active fan-out node. A faint full track plus an
 * accent arc whose length is set by `stroke-dashoffset`; kept deliberately simple. */
function FanRing({ done, total }: { done: number; total: number }) {
  const r = 5;
  const circumference = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="text-run" aria-hidden>
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - frac)}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
}

/** Three-dot "thinking" ellipsis — each dot pulses in sequence via a staggered animation-delay
 * on the built-in `animate-pulse` keyframe (no new keyframe needed). Purely decorative — freezes
 * to static dots under prefers-reduced-motion, same as every other ambient animation here. */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-pill bg-run animate-pulse motion-reduce:animate-none"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}

/** Done marker with a one-time 200ms scale pop-in on mount (CSS transition, no framer-motion). */
function DoneMarker() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
  }, []);
  return (
    <span className="flex h-5 w-5 items-center justify-center">
      <span
        className={[
          "flex h-5 w-5 items-center justify-center rounded-pill bg-met/10 text-met",
          "transition-transform duration-reveal ease-casewright",
          shown ? "scale-100" : "scale-0",
        ].join(" ")}
      >
        <Check size={12} strokeWidth={3} />
      </span>
    </span>
  );
}

/** Horizontal stepper rendering the graph's fixed node order with per-node state markers,
 * live elapsed-time on the active node, and a fan-out counter + fraction ring on the active
 * fan-out node. A single shared 1s interval drives the live elapsed label for the whole
 * tracker (cleared on unmount). */
export default function PipelineTracker({ graph, status, progress: rawProgress }: PipelineTrackerProps) {
  const progress = normalizeProgress(rawProgress);
  const topology = graph === "petition" ? PETITION_TOPOLOGY : RFE_TOPOLOGY;

  // Single shared 1s tick so the active node's elapsed label updates live without one timer
  // per node.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const now = Date.now();

  // w-max (not the flex row's default shrink-to-fit): callers that place this in a narrower
  // column (OverviewTab's two-up grid) already wrap it in overflow-x-auto expecting to scroll a
  // wide tracker, not squeeze one — without w-max, the flex-1 connector lines below get shrunk
  // toward 0 to fit the container, and adjacent node labels visually run together with no gap.
  return (
    <ol className="flex w-max items-start">
      {topology.map((node, i) => {
        const state = deriveState(node, status, progress);
        const labelColor = LABEL_COLOR[state];

        // Active node: live elapsed time from its started_at timestamp (if present), plus the
        // fan-out counter/ring when the node is a fan-out with a fan_out entry in progress.
        let activeExtra: JSX.Element | null = null;
        if (state === "active") {
          const startedAt = progress.node_timestamps[node.key]?.started_at;
          const elapsedMs = startedAt ? now - Date.parse(startedAt) : null;
          const fan = node.isFanOut ? progress.fan_out[node.key] : undefined;
          activeExtra = (
            <div className="flex flex-col items-center gap-0.5">
              {elapsedMs != null ? (
                <span className="flex items-center gap-1 text-[10px] font-mono text-text-faint">
                  <Loader2 size={9} className="animate-spin text-run motion-reduce:animate-none" />
                  {formatElapsed(elapsedMs)}
                </span>
              ) : null}
              {fan ? (
                <span className="flex items-center gap-1 text-[10px] font-mono text-run">
                  <FanRing done={fan.done} total={fan.total} />
                  {fan.done}/{fan.total}
                </span>
              ) : null}
            </div>
          );
        }

        let marker: JSX.Element;
        switch (state) {
          case "done":
            marker = <DoneMarker />;
            break;
          case "failed":
            marker = (
              <span className="flex h-5 w-5 items-center justify-center rounded-pill bg-gap/10 text-gap">
                <X size={12} strokeWidth={3} />
              </span>
            );
            break;
          case "gate-waiting":
            // Diamond (square rotated 45deg) in the partial tone — reads as "paused on a human."
            marker = (
              <span className="flex h-5 w-5 items-center justify-center">
                <span className="h-3.5 w-3.5 rotate-45 rounded-control border border-partial bg-partial/10" />
              </span>
            );
            break;
          case "active":
            marker = (
              <span
                className="relative flex h-5 w-5 items-center justify-center"
                // Soft static glow halo (the "thinking" upgrade) — not animated, so no
                // reduced-motion carve-out needed, unlike the ping below.
                style={{ boxShadow: "0 0 14px 3px rgb(var(--run-rgb) / 0.35)" }}
              >
                {/* motion-reduce:animate-none (T5.8 audit): the ping here has an arbitrary
                    1.8s duration override, not a --duration token, so it needs the explicit
                    variant to freeze under prefers-reduced-motion. */}
                <span className="absolute inline-flex h-3.5 w-3.5 animate-ping motion-reduce:animate-none rounded-pill bg-run opacity-75 [animation-duration:1.8s]" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-pill bg-run" />
              </span>
            );
            break;
          case "pending":
          default:
            marker = (
              <span className="flex h-5 w-5 items-center justify-center">
                <span className="h-3.5 w-3.5 rounded-full border border-text-faint" />
              </span>
            );
            break;
        }

        return (
          <Fragment key={node.key}>
            <li className="flex shrink-0 flex-col items-center gap-1.5">
              {marker}
              <span className={["flex items-center gap-1 text-[11px] uppercase tracking-wide", labelColor].join(" ")}>
                {node.label}
                {state === "active" ? <ThinkingDots /> : null}
              </span>
              {activeExtra}
            </li>
            {i < topology.length - 1 ? (
              // Fixed width, not flex-1: inside a w-max <ol>, a flex-1/flex-basis-0 connector
              // still gets crushed toward 0 by the shrink-0 node columns on either side of it —
              // a plain fixed width is what actually keeps a visible gap between every label.
              <div aria-hidden className="mt-[10px] h-px w-6 shrink-0 bg-border" />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}