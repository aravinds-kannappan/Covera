import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODELS } from "@/lib/anthropic/client";
import type { AgentMessage, ToolCall, TurnRequest, TurnResult } from "./types";

// The Anthropic backend for the agent loop (Claude Sonnet 5 for reasoning, Haiku for fast
// intake). It is the logic that used to live inline in the orchestrator, lifted behind the
// normalized turn interface so Baseten can be dropped in beside it. It calls the exact same
// getAnthropic().messages.create the code always has, so the existing tool-loop tests still
// exercise this path unchanged.

/* eslint-disable @typescript-eslint/no-explicit-any */

function toAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    if (m.role === "assistant") {
      const content: any[] = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: "assistant", content: content.length ? content : (m.text ?? "") };
    }
    if (m.toolResults?.length) {
      return {
        role: "user",
        content: m.toolResults.map((tr) => ({
          type: "tool_result",
          tool_use_id: tr.id,
          content: tr.content,
        })) as any,
      };
    }
    return { role: "user", content: m.text ?? "" };
  });
}

export async function anthropicTurn(req: TurnRequest): Promise<TurnResult> {
  const model = req.role === "fast" ? MODELS.fast : MODELS.reason;
  const params: any = {
    model,
    max_tokens: req.maxTokens ?? 1024,
    system: req.system,
    tools: req.tools,
    messages: toAnthropicMessages(req.messages),
  };
  const msg = await getAnthropic().messages.create(params);
  const blocks: any[] = Array.isArray(msg.content) ? msg.content : [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  const toolCalls: ToolCall[] = blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
  return {
    text,
    toolCalls,
    stopReason: msg.stop_reason === "tool_use" ? "tool_use" : "end",
    provider: "anthropic",
    model,
  };
}
