import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Orthogonal gateway so no real call fires; capture what we send and control what we get.
const orthRun = vi.fn();
vi.mock("@/lib/orthogonal/client", () => ({
  orthReady: () => true,
  orthRun: (...args: unknown[]) => orthRun(...args),
}));

import { basetenTurn, basetenReady } from "@/lib/llm/baseten";

beforeEach(() => orthRun.mockReset());

describe("basetenTurn", () => {
  it("converts an agent tool loop into OpenAI shape and parses tool_calls back", async () => {
    orthRun.mockResolvedValueOnce({
      data: {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "",
              tool_calls: [{ id: "c1", function: { name: "recommend_plans", arguments: '{"label":"x"}' } }],
            },
          },
        ],
      },
      price: 0.002,
    });

    const res = await basetenTurn({
      role: "reason",
      system: "SYS",
      tools: [{ name: "recommend_plans", description: "d", input_schema: { type: "object", properties: {} } }],
      messages: [
        { role: "user", text: "hi" },
        { role: "assistant", text: "", toolCalls: [{ id: "c0", name: "update_profile", input: { text: "34 TX" } }] },
        { role: "user", toolResults: [{ id: "c0", content: '{"ok":true}' }] },
      ],
    });

    expect(res.provider).toBe("baseten");
    expect(res.stopReason).toBe("tool_use");
    expect(res.toolCalls).toEqual([{ id: "c1", name: "recommend_plans", input: { label: "x" } }]);

    // Inspect the request we sent to the gateway.
    const [api, path, body] = orthRun.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("baseten");
    expect(path).toBe("/v1/chat/completions");
    const messages = body.messages as { role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }[];
    expect(messages[0]).toEqual({ role: "system", content: "SYS" });

    const asst = messages.find((m) => m.role === "assistant")!;
    const call = (asst.tool_calls as { function: { name: string; arguments: string } }[])[0];
    expect(call.function.name).toBe("update_profile");
    expect(JSON.parse(call.function.arguments)).toEqual({ text: "34 TX" });

    const toolMsg = messages.find((m) => m.role === "tool")!;
    expect(toolMsg.tool_call_id).toBe("c0");
    expect(toolMsg.content).toBe('{"ok":true}');

    const tools = body.tools as { type: string; function: { name: string; parameters: unknown } }[];
    expect(tools[0]).toEqual({
      type: "function",
      function: { name: "recommend_plans", description: "d", parameters: { type: "object", properties: {} } },
    });
  });

  it("returns stopReason 'end' for a plain text answer", async () => {
    orthRun.mockResolvedValueOnce({
      data: { choices: [{ finish_reason: "stop", message: { content: "Here you go" } }] },
      price: 0.001,
    });
    const res = await basetenTurn({ role: "fast", system: "S", tools: [], messages: [{ role: "user", text: "hi" }] });
    expect(res.text).toBe("Here you go");
    expect(res.toolCalls).toEqual([]);
    expect(res.stopReason).toBe("end");
  });

  it("tolerates malformed tool-call arguments (no throw, empty input)", async () => {
    orthRun.mockResolvedValueOnce({
      data: {
        choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ id: "c9", function: { name: "recheck_savings", arguments: "not json" } }] } }],
      },
      price: 0,
    });
    const res = await basetenTurn({ role: "reason", system: "S", tools: [], messages: [{ role: "user", text: "hi" }] });
    expect(res.toolCalls).toEqual([{ id: "c9", name: "recheck_savings", input: {} }]);
  });

  it("basetenReady reflects orthReady", () => {
    expect(basetenReady()).toBe(true);
  });
});
