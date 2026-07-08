import { orthReady, orthRun } from "@/lib/orthogonal/client";
import type { AgentMessage, ToolCall, ToolSpec, TurnRequest, TurnResult } from "./types";

// The Baseten backend for the agent loop, reached through the same Orthogonal gateway as every
// other paid capability. Baseten's Model APIs are OpenAI-compatible, so this converts the
// normalized turn into an OpenAI chat-completions request (system + messages + function tools),
// posts it via orthRun, and converts the response back. Reasoning models (DeepSeek-V3.1 /
// GLM-4.6 / Kimi-K2 / GPT-OSS-120B) are ~$0.0025 per 4k tokens, far cheaper than Claude, which
// is why the voice concierge defaults here.
//
// The exact gateway slug ("baseten") and the request/response envelope are inferred from the
// Orthogonal Run API and centralized in this one file, so if the live gateway differs it is a
// single adapter to adjust (same defensive pattern as lib/documents/scrapegraph.ts).

const REASON_MODEL = process.env.BASETEN_MODEL || "deepseek-ai/DeepSeek-V3.1";
const FAST_MODEL = process.env.BASETEN_FAST_MODEL || REASON_MODEL;

/** True when a Baseten model can be reached (i.e. Orthogonal is configured). */
export function basetenReady(): boolean {
  return orthReady();
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function toOpenAiMessages(system: string, messages: AgentMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const toolCalls = (m.toolCalls ?? []).map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
      }));
      out.push({
        role: "assistant",
        content: m.text ?? "",
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else if (m.toolResults?.length) {
      // OpenAI wants one "tool" message per tool result, keyed by the call id.
      for (const tr of m.toolResults) {
        out.push({ role: "tool", tool_call_id: tr.id, content: tr.content });
      }
    } else {
      out.push({ role: "user", content: m.text ?? "" });
    }
  }
  return out;
}

function toOpenAiTools(tools: readonly ToolSpec[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

interface OpenAiResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
}

function safeParseArgs(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function basetenTurn(req: TurnRequest): Promise<TurnResult> {
  const model = req.role === "fast" ? FAST_MODEL : REASON_MODEL;
  const { data } = await orthRun<OpenAiResponse>("baseten", "/v1/chat/completions", {
    model,
    messages: toOpenAiMessages(req.system, req.messages),
    tools: toOpenAiTools(req.tools),
    tool_choice: "auto",
    temperature: 0.4,
    max_tokens: req.maxTokens ?? 1024,
  });

  const choice = data.choices?.[0];
  const message = choice?.message ?? {};
  const text = (message.content ?? "").trim();
  const toolCalls: ToolCall[] = (message.tool_calls ?? [])
    .filter((c) => c.function?.name)
    .map((c, i) => ({
      id: c.id || `call_${i}`,
      name: c.function!.name as string,
      input: safeParseArgs(c.function!.arguments),
    }));
  const stopReason =
    toolCalls.length > 0 || choice?.finish_reason === "tool_calls" ? "tool_use" : "end";
  return { text, toolCalls, stopReason, provider: "baseten", model };
}
