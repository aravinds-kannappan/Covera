import type { PatientProfile } from "@/lib/types";
import type { OptimizeResult } from "@/lib/sim/optimize";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function postOptimize(profile: PatientProfile): Promise<OptimizeResult> {
  return postJSON<OptimizeResult>("/api/optimize", profile);
}

export async function postExtract(
  text: string,
): Promise<{ patch: Partial<PatientProfile>; error?: string }> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { patch: {}, error: data.error ?? "Extraction failed" };
  return { patch: data.patch ?? {} };
}

export interface AgentScenarioResult {
  label: string;
  subsidyMonthly: number;
  topPlans: {
    name: string;
    metal: string;
    expectedTotal: number;
    p90: number;
    annualPremium: number;
    probHitOOPMax: number;
  }[];
}

export interface AgentHandlers {
  onText: (delta: string) => void;
  onTool?: (input: unknown) => void;
  onToolResult?: (result: AgentScenarioResult) => void;
  onError?: (msg: string) => void;
  onDone?: () => void;
}

export async function streamAgent(
  payload: {
    messages: { role: "user" | "assistant"; content: string }[];
    profile: PatientProfile;
    plansSummary: string;
  },
  handlers: AgentHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    handlers.onError?.(data.error ?? "The assistant is unavailable.");
    handlers.onDone?.();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      let evt: { type: string; value?: string; input?: unknown; result?: AgentScenarioResult };
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "text" && evt.value) handlers.onText(evt.value);
      else if (evt.type === "tool") handlers.onTool?.(evt.input);
      else if (evt.type === "tool_result" && evt.result) handlers.onToolResult?.(evt.result);
      else if (evt.type === "error" && evt.value) handlers.onError?.(evt.value);
      else if (evt.type === "done") handlers.onDone?.();
    }
  }
}
