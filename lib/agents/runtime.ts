import type { Provider } from "@/lib/llm/router";
import { runAgentTurn } from "@/lib/llm/router";
import type { AgentMessage, ModelRole, ToolCall, ToolResult, ToolSpec } from "@/lib/llm/types";
import type { ConciergeConsult } from "@/lib/agents/mesh/consult";

// The one agentic tool loop, shared by every agent. The Concierge orchestrator and the
// hospital/employer mesh desks were each carrying their own near-identical copy of "call the
// model, run any tools it asked for, feed the results back, repeat." This is that loop, once,
// and it EMITS an event for every step (a turn starting, the model's text, a tool being called,
// a tool's result, the final answer). That event stream is what makes agent communication
// observable: the SSE endpoint replays it to the browser live, and the landing-page network
// animation replays a captured one. Callers that don't care just read the returned finalText.

export type AgentEvent =
  | { kind: "turn_start"; index: number }
  | { kind: "assistant"; text: string }
  | { kind: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { kind: "tool_result"; id: string; name: string; result: unknown; meta?: unknown; consult?: ConciergeConsult }
  | { kind: "final"; text: string };

/** What a dispatched tool hands back: the model-readable result plus optional rich payloads. */
export interface ToolDispatchResult {
  result: unknown;
  /** Rich UI payload (MessageMeta or MeshMeta), passed through opaquely on the event. */
  meta?: unknown;
  /** A cross-agent consult (mesh only), surfaced so the UI can show the handshake. */
  consult?: ConciergeConsult;
}

export interface AgentLoopConfig {
  /** Built per turn, so a prompt that depends on mutating thread state stays current. */
  system: (turnIndex: number) => string;
  /** Model tier per turn (e.g. intake uses the fast model). Defaults to "reason". */
  role?: (turnIndex: number) => ModelRole;
  tools: readonly ToolSpec[];
  /** Conversation history; appended to in place as the loop runs (matches prior behavior). */
  messages: AgentMessage[];
  maxTurns: number;
  maxTokens?: number;
  provider?: Provider;
  /** Runs one tool the model asked for and returns its result (+ optional rich payloads). */
  dispatch: (call: ToolCall) => Promise<ToolDispatchResult>;
  /** Optional live sink for each event (the SSE endpoint streams these). */
  emit?: (event: AgentEvent) => void | Promise<void>;
}

export interface AgentLoopResult {
  finalText: string;
  /** Every event in order: a replayable trace of the whole exchange. */
  events: AgentEvent[];
}

/**
 * Drive the model/tool loop to a final answer, emitting an event per step. Provider-agnostic
 * (runs on the cheap Baseten model or Claude with no change) and side-effect-free itself: any
 * state mutation happens inside the caller's `dispatch` / `system` closures, exactly as before.
 */
export async function runAgentLoop(cfg: AgentLoopConfig): Promise<AgentLoopResult> {
  const events: AgentEvent[] = [];
  const emit = async (event: AgentEvent) => {
    events.push(event);
    if (cfg.emit) await cfg.emit(event);
  };

  let finalText = "";

  for (let i = 0; i < cfg.maxTurns; i++) {
    await emit({ kind: "turn_start", index: i });

    const turn = await runAgentTurn(
      {
        role: cfg.role ? cfg.role(i) : "reason",
        system: cfg.system(i),
        tools: cfg.tools,
        messages: cfg.messages,
        maxTokens: cfg.maxTokens,
      },
      cfg.provider,
    );

    finalText = turn.text;
    if (turn.text) await emit({ kind: "assistant", text: turn.text });
    cfg.messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });

    if (turn.stopReason !== "tool_use" || turn.toolCalls.length === 0) break;

    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      await emit({ kind: "tool_call", id: call.id, name: call.name, input: call.input });
      const out = await cfg.dispatch(call);
      await emit({ kind: "tool_result", id: call.id, name: call.name, result: out.result, meta: out.meta, consult: out.consult });
      results.push({ id: call.id, content: JSON.stringify(out.result) });
    }
    cfg.messages.push({ role: "user", toolResults: results });
  }

  if (!finalText) finalText = "Let me look into that: can you say a bit more?";
  await emit({ kind: "final", text: finalText });
  return { finalText, events };
}

/** The last rich meta payload emitted this run, for callers that render one panel per reply. */
export function lastMeta(events: AgentEvent[]): unknown {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "tool_result" && e.meta) return e.meta;
  }
  return undefined;
}
