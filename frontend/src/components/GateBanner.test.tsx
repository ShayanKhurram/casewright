import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../lib/api";
import { AgentRun } from "../types";
import GateBanner from "./GateBanner";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    case_id: "case-1",
    graph: "rfe",
    status: "waiting_review",
    current_gate: "draft_review",
    gate_payload: {
      sections: [
        { id: "sec-1", heading: "Criterion: Awards", status: "generated", confidence: 0.9 },
        { id: "sec-2", heading: "Criterion: Judging", status: "needs_attention", confidence: 0.4 },
      ],
    },
    error: null,
    progress: { current_node: null, completed_nodes: [], node_timestamps: {}, fan_out: {} },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GateBanner", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("posts an approve decision with null notes when the notes field is empty", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const onDecided = vi.fn();
    const user = userEvent.setup();

    render(<GateBanner run={makeRun()} onDecided={onDecided} />);
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(apiFetch).toHaveBeenCalledWith("/runs/run-1/gate", {
      method: "POST",
      body: JSON.stringify({ decision: "approve", notes: null }),
    });
    expect(onDecided).toHaveBeenCalledOnce();
  });

  it("posts a revise decision with the entered notes", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    const onDecided = vi.fn();
    const user = userEvent.setup();

    render(<GateBanner run={makeRun()} onDecided={onDecided} />);
    await user.type(screen.getByPlaceholderText("Notes (optional)"), "Tighten the argument.");
    await user.click(screen.getByRole("button", { name: "Request revision" }));

    expect(apiFetch).toHaveBeenCalledWith("/runs/run-1/gate", {
      method: "POST",
      body: JSON.stringify({ decision: "revise", notes: "Tighten the argument." }),
    });
    expect(onDecided).toHaveBeenCalledOnce();
  });

  it("shows an error and does not call onDecided if the gate request fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Run is not awaiting review"));
    const onDecided = vi.fn();
    const user = userEvent.setup();

    render(<GateBanner run={makeRun()} onDecided={onDecided} />);
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Run is not awaiting review")).toBeInTheDocument();
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("surfaces the count of sections needing attention", () => {
    render(<GateBanner run={makeRun()} onDecided={vi.fn()} />);
    expect(screen.getByText("1 section(s) need attention.")).toBeInTheDocument();
  });
});
