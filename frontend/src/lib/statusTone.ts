import type { PillTone } from "../components/ui/Pill";

/** Maps every status string used across Case/AgentRun/DraftSection to a Pill tone, per the
 * redesign plan §5's StatusPill mapping (extended to cover run + section statuses on top of
 * the plan's case-status table, since one StatusPill component serves all three domains).
 * Unknown statuses fall back to "dim" rather than throwing — new statuses shouldn't crash a
 * pill, just render neutrally until this map is extended. */
const TONE_MAP: Record<string, PillTone> = {
  // Case statuses (backend/app/models/case.py CASE_STATUSES)
  intake: "run",
  analyzing: "run",
  strategy_review: "partial",
  drafting: "run",
  draft_review: "partial",
  ready_to_file: "met",
  filed: "dim",
  rfe_received: "gap",
  rfe_review: "partial",
  approved: "met",
  denied: "gap",
  // AgentRun statuses (backend/app/models/ops.py AGENT_RUN_STATUSES)
  running: "run",
  waiting_review: "partial",
  completed: "met",
  failed: "gap",
  // DraftSection statuses (backend/app/models/draft.py SECTION_STATUSES)
  generated: "dim",
  needs_attention: "gap",
  revision_requested: "partial",
};

export function statusTone(status: string): PillTone {
  return TONE_MAP[status] ?? "dim";
}

export function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ");
}
