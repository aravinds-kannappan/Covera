import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted handles so the mock factories (which run before imports) can read mutable state.
const h = vi.hoisted(() => ({
  orthReadyVal: true,
  anthropicPresent: true,
  create: vi.fn(),
  orthRun: vi.fn(),
}));

vi.mock("@/lib/orthogonal/client", () => ({
  orthReady: () => h.orthReadyVal,
  orthRun: (...a: unknown[]) => h.orthRun(...a),
}));
vi.mock("@/lib/anthropic/client", () => ({
  MODELS: { reason: "claude-sonnet-5", fast: "claude-haiku-4-5" },
  anthropicKeyPresent: () => h.anthropicPresent,
  getAnthropic: () => ({ messages: { create: h.create } }),
  extractJSON: () => null,
}));

import { resolveProvider, conciergeReady, runAgentTurn } from "@/lib/llm/router";

beforeEach(() => {
  h.create.mockReset();
  h.orthRun.mockReset();
  h.orthReadyVal = true;
  h.anthropicPresent = true;
});

describe("provider selection", () => {
  it("honors preference and configuration", () => {
    expect(resolveProvider("baseten")).toBe("baseten");
    h.orthReadyVal = false;
    expect(resolveProvider("baseten")).toBe("anthropic"); // preferred but not configured
    expect(resolveProvider(undefined)).toBe("anthropic");
  });

  it("conciergeReady is true when either brain is available", () => {
    h.anthropicPresent = false;
    h.orthReadyVal = true;
    expect(conciergeReady()).toBe(true); // baseten only
    h.orthReadyVal = false;
    expect(conciergeReady()).toBe(false); // neither
    h.anthropicPresent = true;
    expect(conciergeReady()).toBe(true); // anthropic only
  });
});

describe("runAgentTurn", () => {
  const req = { role: "reason" as const, system: "s", tools: [], messages: [{ role: "user" as const, text: "hi" }] };

  it("uses Baseten when preferred and configured", async () => {
    h.orthRun.mockResolvedValueOnce({ data: { choices: [{ finish_reason: "stop", message: { content: "from baseten" } }] }, price: 0 });
    const res = await runAgentTurn(req, "baseten");
    expect(res.provider).toBe("baseten");
    expect(res.text).toBe("from baseten");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("falls back to Claude when Baseten errors", async () => {
    h.orthRun.mockRejectedValueOnce(new Error("gateway down"));
    h.create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "from claude" }] });
    const res = await runAgentTurn(req, "baseten");
    expect(res.provider).toBe("anthropic");
    expect(res.text).toBe("from claude");
  });

  it("defaults to Claude with no preference", async () => {
    h.create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "claude default" }] });
    const res = await runAgentTurn(req);
    expect(res.provider).toBe("anthropic");
    expect(h.orthRun).not.toHaveBeenCalled();
  });
});
