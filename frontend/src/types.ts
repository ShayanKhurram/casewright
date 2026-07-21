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
