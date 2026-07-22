import { Fragment, useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import {
  PETITION_TOPOLOGY,
  RFE_TOPOLOGY,
  type PipelineNode,
} from "./graphTopology";

/** Progress payload shape, mirroring the `agent_runs.progress` JSON column written by
 * backend/app/agents/runner.py's `_stream_with_progress`. `node_timestamps` values are ISO
 * timestamp strings (from langgraph debug-stream chunk timestamps). */
export interface RunProgress {
  current_node: string | null;
  completed_nodes: string[];
  node_timestamps: Record<string, { started_at?: string; finished_at?: string }>;
  fan_out: Record<string, { done: number; total: number }>;
}

export interface PipelineTrackerProps {
  graph: "petition" | "rfe";
  status: "running" | "waiting_review" | "completed" | "failed";
  progress: RunProgress;
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
export default function PipelineTracker({ graph, status, progress }: PipelineTrackerProps) {
  const topology = graph === "petition" ? PETITION_TOPOLOGY : RFE_TOPOLOGY;

  // Single shared 1s tick so the active node's elapsed label updates live without one timer
  // per node.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const now = Date.now();

  return (
    <ol className="flex items-start">
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
                <span className="text-[10px] font-mono text-text-faint">{formatElapsed(elapsedMs)}</span>
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
              <span className="relative flex h-5 w-5 items-center justify-center">
                <span className="absolute inline-flex h-3.5 w-3.5 animate-ping rounded-pill bg-run opacity-75 [animation-duration:1.8s]" />
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
              <span className={["text-[11px] uppercase tracking-wide", labelColor].join(" ")}>
                {node.label}
              </span>
              {activeExtra}
            </li>
            {i < topology.length - 1 ? (
              <div aria-hidden className="mt-[10px] h-px flex-1 bg-border" />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}