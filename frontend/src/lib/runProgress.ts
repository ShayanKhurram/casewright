import type { RunProgress } from "../types";

/** Fills in safe defaults for a possibly-partial `agent_runs.progress` value. Real production
 * data can legitimately be `{}` — any run that predates T5.3, or one whose graph.astream()
 * threw before ever yielding a single node event, never had `_write_progress` called — so every
 * consumer must go through this rather than assume the full shape and risk a crash on a field
 * access like `progress.completed_nodes.includes(...)`. */
export function normalizeProgress(raw: Partial<RunProgress> | null | undefined): RunProgress {
  return {
    current_node: raw?.current_node ?? null,
    completed_nodes: raw?.completed_nodes ?? [],
    node_timestamps: raw?.node_timestamps ?? {},
    fan_out: raw?.fan_out ?? {},
    narration_log: raw?.narration_log ?? [],
  };
}
