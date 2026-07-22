import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CriterionAssessment } from "../types";
import CriterionMatrix from "./CriterionMatrix";

function makeAssessment(overrides: Partial<CriterionAssessment>): CriterionAssessment {
  return {
    id: "a1",
    case_id: "case-1",
    criterion_key: "eb1a.awards",
    verdict: "met",
    confidence: 0.8,
    reasoning: { standard: "The standard.", analysis: "The analysis.", gaps: "" },
    evidence_refs: ["EX-1"],
    ...overrides,
  };
}

describe("CriterionMatrix", () => {
  it("shows a quiet empty state instead of an empty grid", () => {
    render(<CriterionMatrix assessments={[]} />);
    expect(screen.getByText("No criteria assessed yet.")).toBeInTheDocument();
  });

  it("applies the verdict-met rail color for a met verdict", () => {
    render(<CriterionMatrix assessments={[makeAssessment({ id: "a1", verdict: "met" })]} />);
    const card = screen.getByText("eb1a.awards").closest("div.mb-3");
    expect(card?.className).toContain("border-verdict-met");
  });

  it("applies the verdict-gap rail color for absent and weak verdicts", () => {
    render(
      <CriterionMatrix
        assessments={[
          makeAssessment({ id: "a1", criterion_key: "eb1a.judging", verdict: "absent" }),
          makeAssessment({ id: "a2", criterion_key: "eb1a.membership", verdict: "weak" }),
        ]}
      />
    );
    expect(screen.getByText("eb1a.judging").closest("div.mb-3")?.className).toContain("border-verdict-gap");
    expect(screen.getByText("eb1a.membership").closest("div.mb-3")?.className).toContain("border-verdict-gap");
  });

  it("sorts cards alphabetically by criterion_key regardless of input order", () => {
    render(
      <CriterionMatrix
        assessments={[
          makeAssessment({ id: "a1", criterion_key: "o1a.membership" }),
          makeAssessment({ id: "a2", criterion_key: "eb1a.awards" }),
        ]}
      />
    );
    const keys = screen.getAllByText(/^(eb1a|o1a)\./).map((el) => el.textContent);
    expect(keys).toEqual(["eb1a.awards", "o1a.membership"]);
  });

  it("renders evidence refs as chips", () => {
    render(<CriterionMatrix assessments={[makeAssessment({ evidence_refs: ["EX-1", "EX-2"] })]} />);
    expect(screen.getByText("EX-1")).toBeInTheDocument();
    expect(screen.getByText("EX-2")).toBeInTheDocument();
  });
});
