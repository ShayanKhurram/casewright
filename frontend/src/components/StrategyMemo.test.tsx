import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StrategyMemo } from "../types";
import StrategyMemoView from "./StrategyMemo";

function makeMemo(overrides: Partial<StrategyMemo> = {}): StrategyMemo {
  return {
    id: "memo-1",
    case_id: "case-1",
    recommended_category: "EB-1A",
    viability: "strong",
    criteria_to_argue: ["eb1a.awards"],
    criteria_to_abandon: ["eb1a.judging"],
    evidence_gaps: [],
    rfe_risks: [],
    narrative: "A strong case.",
    attorney_decision: null,
    attorney_notes: null,
    ...overrides,
  };
}

describe("StrategyMemoView", () => {
  it("shows the gate controls when onGateDecision is provided and no decision has been made", () => {
    render(<StrategyMemoView memo={makeMemo()} onGateDecision={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request revision" })).toBeInTheDocument();
  });

  it("hides the gate controls when no onGateDecision is provided", () => {
    render(<StrategyMemoView memo={makeMemo()} />);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("hides the gate controls and shows the decision once attorney_decision is set", () => {
    render(<StrategyMemoView memo={makeMemo({ attorney_decision: "approve" })} onGateDecision={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/Decision: approved/)).toBeInTheDocument();
  });

  it("shows a revision-requested decision distinctly from an approved one", () => {
    render(<StrategyMemoView memo={makeMemo({ attorney_decision: "revise" })} onGateDecision={vi.fn()} />);
    const badge = screen.getByText(/Decision: revision requested/);
    expect(badge.className).toContain("verdict-partial");
    expect(badge.className).not.toContain("verdict-met");
  });

  it("calls onGateDecision with the entered notes on approve", async () => {
    const onGateDecision = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StrategyMemoView memo={makeMemo()} onGateDecision={onGateDecision} />);
    await user.type(screen.getByPlaceholderText("Notes (optional)"), "Looks solid.");
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(onGateDecision).toHaveBeenCalledWith("approve", "Looks solid.");
  });
});
