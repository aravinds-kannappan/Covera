import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TurnResult } from "@/lib/llm/types";

// Mock the model call so the loop is exercised without a key or network. Each test scripts the
// sequence of model turns; the loop's job is to run tools between them and emit the right events.
vi.mock("@/lib/llm/router", () => ({ runAgentTurn: vi.fn() }));

import { runAgentTurn } from "@/lib/llm/router";
import { runAgentLoop, lastMeta, type AgentEvent } from "@/lib/agents/runtime";

const mockTurn = runAgentTurn as unknown as ReturnType<typeof vi.fn>;

function turn(partial: Partial<TurnResult>): TurnResult {
  return { text: "", toolCalls: [], stopReason: "end", provider: "anthropic", model: "test", ...partial };
}

describe("runAgentLoop", () => {
  beforeEach(() => mockTurn.mockReset());

  it("emits a full ordered event trace across a tool round trip", async () => {
    mockTurn
      .mockResolvedValueOnce(
        turn({ text: "", toolCalls: [{ id: "t1", name: "consult_concierge", input: { procedureId: "mri" } }], stopReason: "tool_use" }),
      )
      .mockResolvedValueOnce(turn({ text: "Your MRI is $400 before the deductible.", stopReason: "end" }));

    const events: AgentEvent[] = [];
    const res = await runAgentLoop({
      system: () => "sys",
      tools: [],
      messages: [{ role: "user", text: "what does an MRI cost?" }],
      maxTurns: 4,
      dispatch: async () => ({ result: { ok: true }, meta: { kind: "estimate" }, consult: { ok: true, note: "from the card" } }),
      emit: (e) => void events.push(e),
    });

    expect(res.finalText).toBe("Your MRI is $400 before the deductible.");
    expect(events.map((e) => e.kind)).toEqual([
      "turn_start",
      "tool_call",
      "tool_result",
      "turn_start",
      "assistant",
      "final",
    ]);
    const call = events.find((e) => e.kind === "tool_call");
    expect(call).toMatchObject({ name: "consult_concierge" });
    const result = events.find((e) => e.kind === "tool_result");
    expect(result).toMatchObject({ consult: { ok: true } });
    expect(lastMeta(res.events)).toEqual({ kind: "estimate" });
  });

  it("stops at maxTurns without looping forever", async () => {
    // Always ask for a tool: the loop must still terminate at maxTurns.
    mockTurn.mockResolvedValue(
      turn({ text: "", toolCalls: [{ id: "x", name: "noop", input: {} }], stopReason: "tool_use" }),
    );
    const res = await runAgentLoop({
      system: () => "sys",
      tools: [],
      messages: [{ role: "user", text: "hi" }],
      maxTurns: 3,
      dispatch: async () => ({ result: {} }),
    });
    expect(mockTurn).toHaveBeenCalledTimes(3);
    expect(res.events.filter((e) => e.kind === "turn_start")).toHaveLength(3);
    // Falls back to a friendly message when no final text was produced.
    expect(res.finalText).toMatch(/say a bit more/);
  });

  it("passes the per-turn role and system through to the model", async () => {
    mockTurn.mockResolvedValueOnce(turn({ text: "ok", stopReason: "end" }));
    await runAgentLoop({
      system: (i) => `system-${i}`,
      role: () => "fast",
      tools: [],
      messages: [{ role: "user", text: "hi" }],
      maxTurns: 2,
      dispatch: async () => ({ result: {} }),
    });
    expect(mockTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: "fast", system: "system-0" }),
      undefined,
    );
  });
});
