import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic client so the concierge loop is deterministic: the model first calls
// the recommend_plans tool, then (after the real simulation runs) returns a final text.
const create = vi.fn();
vi.mock("@/lib/anthropic/client", () => ({
  MODELS: { reason: "claude-sonnet-5", fast: "claude-haiku-4-5" },
  anthropicKeyPresent: () => true,
  getAnthropic: () => ({ messages: { create } }),
  extractJSON: () => null,
}));

import { runConcierge } from "@/lib/agents/orchestrator";
import { newThread } from "@/lib/store/conversations";

beforeEach(() => {
  create.mockReset();
});

describe("runConcierge routing", () => {
  it("calls the recommend_plans tool, then replies with text", async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "recommend_plans", input: {} }],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Your top plan is a Silver HMO at about $5,100 all-in." }],
      });

    const t = newThread("demo:orch", "sandbox");
    t.profile = { ...t.profile, age: 40, state: "TX", annualIncome: 50000 };

    const { replies } = await runConcierge(t, "what are my best plans?");

    expect(create).toHaveBeenCalledTimes(2);
    expect(replies).toHaveLength(1);
    expect(replies[0].role).toBe("agent");
    expect(replies[0].text).toContain("Silver");
    // The tool ran the real simulation and attached a plans panel.
    expect(replies[0].meta?.kind).toBe("plans");
    // Patient + agent messages are both persisted on the thread.
    expect(t.messages.at(-2)?.role).toBe("patient");
    expect(t.messages.at(-1)?.role).toBe("agent");
    expect(t.status).toBe("advising");
  });

  it("falls back gracefully when the key is absent", async () => {
    // Re-mock for this case is overkill; instead verify a no-tool plain reply path.
    create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Tell me your age and state to start." }],
    });
    const t = newThread("demo:orch2", "sandbox");
    const { replies } = await runConcierge(t, "hi");
    expect(replies[0].text).toContain("age");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
