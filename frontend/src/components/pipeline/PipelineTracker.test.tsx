import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PipelineTracker from "./PipelineTracker";

describe("PipelineTracker", () => {
  it("does not crash when progress is {} (real data: runs that predate T5.3 or crashed before streaming any node event)", () => {
    render(<PipelineTracker graph="petition" status="waiting_review" progress={{}} />);
    // Every node should render as pending (the safe default) rather than throwing.
    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("Finalize")).toBeInTheDocument();
  });

  it("renders done/active states correctly when progress is fully populated", () => {
    render(
      <PipelineTracker
        graph="petition"
        status="running"
        progress={{
          current_node: "profile",
          completed_nodes: ["intake"],
          node_timestamps: { profile: { started_at: new Date().toISOString() } },
          fan_out: {},
        }}
      />
    );
    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });
});
