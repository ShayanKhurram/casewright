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
  created_at: string;
  updated_at: string;
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
