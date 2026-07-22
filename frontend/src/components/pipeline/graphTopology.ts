// Static, hand-written pipeline topology constants for the PipelineTracker (redesign §6).
// These deliberately mirror the backend's fixed graph structure rather than being derived
// from any API call — the node order here is authoritative for the tracker's visual layout.
// See backend/app/agents/petition_graph.py and backend/app/agents/rfe_graph.py for the source
// graph definitions; do not edit those, only consume their fixed shape here.

export interface PipelineNode {
  key: string;
  label: string;
  /** A human-review gate (interrupt node) — rendered as a diamond when waiting. */
  isGate?: boolean;
  /** A Send-fan-out node (assess_criterion) that runs N parallel branches before completing. */
  isFanOut?: boolean;
}

/** Petition graph node order:
 * intake -> profile -> assess_criterion (fan-out) -> strategy -> strategy_gate (gate) ->
 * drafting -> verification -> review_gate (gate) -> finalize. */
export const PETITION_TOPOLOGY: PipelineNode[] = [
  { key: "intake", label: "Intake" },
  { key: "profile", label: "Profile" },
  { key: "assess_criterion", label: "Eligibility", isFanOut: true },
  { key: "strategy", label: "Strategy" },
  { key: "strategy_gate", label: "Gate", isGate: true },
  { key: "drafting", label: "Drafting" },
  { key: "verification", label: "Verify" },
  { key: "review_gate", label: "Gate", isGate: true },
  { key: "finalize", label: "Finalize" },
];

/** RFE graph node order:
 * parse_rfe -> plan_rebuttals -> draft_rfe -> verification -> review_gate (gate) -> finalize. */
export const RFE_TOPOLOGY: PipelineNode[] = [
  { key: "parse_rfe", label: "Parse" },
  { key: "plan_rebuttals", label: "Plan" },
  { key: "draft_rfe", label: "Draft" },
  { key: "verification", label: "Verify" },
  { key: "review_gate", label: "Gate", isGate: true },
  { key: "finalize", label: "Finalize" },
];