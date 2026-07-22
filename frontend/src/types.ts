export interface CurrentUser {
  id: string;
  firm_id: string;
  firm_name: string;
  email: string;
  role: string;
  full_name: string | null;
  is_active: boolean;
}

/** Mirrors backend/app/models/case.py CASE_STATUSES — no endpoint exposes this list, so it's
 * hardcoded here the same way DOCUMENT_KINDS already is below. */
export const CASE_STATUSES = [
  "intake",
  "analyzing",
  "strategy_review",
  "drafting",
  "draft_review",
  "ready_to_file",
  "filed",
  "rfe_received",
  "rfe_review",
  "approved",
  "denied",
] as const;

export interface CaseHealth {
  score: number;
  criteria_score: number;
  evidence_score: number;
  verification_score: number;
  criteria_met: number;
  criteria_total: number;
}

export interface Case {
  id: string;
  firm_id: string;
  beneficiary_name: string;
  field_of_endeavor: string | null;
  visa_category: "O-1A" | "EB-1A";
  status: string;
  profile: Record<string, unknown>;
  filing_deadline: string | null;
  created_at: string;
  updated_at: string;
  health: CaseHealth;
}

export const DOCUMENT_KINDS = [
  "cv",
  "recommendation_letter",
  "publication",
  "award",
  "press",
  "employment",
  "prior_filing",
  "rfe_notice",
  "other",
] as const;

export interface Document {
  id: string;
  case_id: string;
  kind: string;
  exhibit_label: string | null;
  content_type: string;
  page_count: number | null;
  classification_confidence: number | null;
  created_at: string;
}

/** Mirrors the `agent_runs.progress` JSONB shape written by
 * backend/app/agents/runner.py's `_stream_with_progress` (T5.3). */
export interface RunProgress {
  current_node: string | null;
  completed_nodes: string[];
  node_timestamps: Record<string, { started_at?: string; finished_at?: string }>;
  fan_out: Record<string, { done: number; total: number }>;
  narration_log: { node: string; phase: "start" | "finish"; text: string; at: string }[];
}

export interface AgentRun {
  id: string;
  case_id: string;
  graph: string;
  status: "running" | "waiting_review" | "completed" | "failed";
  current_gate: string | null;
  gate_payload: {
    gate?: string;
    draft_id?: string;
    sections?: { id: string; heading: string; status: string; confidence: number }[];
  };
  error: string | null;
  // Partial<RunProgress>, NOT RunProgress: the DB column defaults to `{}` and every run that
  // predates T5.3 (or that failed before _stream_with_progress ever wrote to it) genuinely has
  // an empty/partial object here — this type is deliberately honest about that so consumers are
  // forced to handle it (via lib/runProgress.ts's normalizeProgress), rather than assuming a
  // full shape and crashing on real production data. See that incident in PROJECT_LOG.md.
  progress: Partial<RunProgress>;
  created_at: string;
  updated_at: string;
}

export interface ActiveRun extends AgentRun {
  beneficiary_name: string;
}

export interface RFEObjection {
  id: string;
  notice_id: string;
  position: number;
  criterion_key: string | null;
  officer_claim: string;
  deficiency_type: string | null;
  rebuttal_plan: Record<string, unknown>;
}

export interface RFENotice {
  id: string;
  case_id: string;
  document_id: string;
  issued_date: string | null;
  response_deadline: string | null;
  summary: string | null;
  created_at: string;
  objections: RFEObjection[];
}

export interface Citation {
  id: string;
  section_id: string;
  source_type: "exhibit" | "authority";
  document_id: string | null;
  authority_ref: string | null;
  marker: string;
  verified: boolean;
}

export interface DraftSection {
  id: string;
  draft_id: string;
  position: number;
  heading: string;
  body: string;
  criterion_key: string | null;
  status: string;
  confidence: number | null;
  verification_notes: { blockers?: string[]; warnings?: string[] };
  reviewer_comment: string | null;
  citations: Citation[];
}

export interface Draft {
  id: string;
  case_id: string;
  kind: string;
  version: number;
  sections: DraftSection[];
}

export interface CriterionAssessment {
  id: string;
  case_id: string;
  criterion_key: string; // e.g. "eb1a.awards", "o1a.critical_employment"
  verdict: "met" | "partial" | "weak" | "absent";
  confidence: number; // 0.0-1.0
  reasoning: { standard?: string; analysis?: string; gaps?: string };
  evidence_refs: string[]; // exhibit labels like "EX-3"
}

export interface StrategyMemo {
  id: string;
  case_id: string;
  recommended_category: string | null;
  viability: string | null;
  criteria_to_argue: string[]; // criterion_key values
  criteria_to_abandon: string[];
  evidence_gaps: string[];
  rfe_risks: string[];
  narrative: string | null;
  attorney_decision: "approve" | "revise" | null;
  attorney_notes: string | null;
}
