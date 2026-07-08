// Provider-agnostic types for the agentic tool loop. The concierge (and, in PR4, the model
// benchmark) speak these shapes; each backend (Anthropic, Baseten via Orthogonal) converts to
// and from its own wire format. This is the seam that lets the voice concierge run on a cheap
// Baseten model while the text path stays on Claude, with no caller changes.

export type Provider = "anthropic" | "baseten";

/** Which model tier a turn wants. Each backend maps this to a concrete model id. */
export type ModelRole = "reason" | "fast";

/** A tool the model may call. Structurally compatible with the existing CONCIERGE_TOOLS. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  content: string;
}

/**
 * One message in the loop. An assistant message may carry `toolCalls`; a user message may carry
 * `toolResults` (the outputs handed back after the tools ran). Plain turns just use `text`.
 */
export interface AgentMessage {
  role: "user" | "assistant";
  text?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface TurnRequest {
  role: ModelRole;
  system: string;
  tools: readonly ToolSpec[];
  messages: AgentMessage[];
  maxTokens?: number;
}

export interface TurnResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "tool_use" | "end";
  provider: Provider;
  model: string;
}
