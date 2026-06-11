import Anthropic from "@anthropic-ai/sdk";

// Server-only. Reads ANTHROPIC_API_KEY from the environment.
export const MODELS = {
  reason: "claude-opus-4-8", // tradeoff explanations + the agentic loop
  fast: "claude-haiku-4-5", // quick natural-language → profile extraction
} as const;

export function anthropicKeyPresent(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** Pull the first JSON object out of a model response, tolerating code fences. */
export function extractJSON<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
