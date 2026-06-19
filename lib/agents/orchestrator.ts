import type Anthropic from "@anthropic-ai/sdk";
import type { Plan, PatientProfile } from "@/lib/types";
import type { Thread, ConvoMessage, MessageMeta } from "@/lib/agents/types";
import { MODELS, anthropicKeyPresent, getAnthropic } from "@/lib/anthropic/client";
import { loadPlans } from "@/lib/data/plans";
import { recommendPlans, plansSummaryText } from "@/lib/agents/advisor";
import { conciergeSystemPrompt } from "@/lib/agents/prompts";
import { CONCIERGE_TOOLS, dispatchTool } from "@/lib/agents/registry";
import { appendMessage } from "@/lib/store/conversations";

// The Concierge orchestrator. Given a patient's inbound text and their thread, it runs an
// agentic tool loop (lead agent + specialist tools/sub-agents), mutates the thread
// (profile, status, selected plan) as a side effect, and returns the agent reply(ies) to
// deliver. It is channel-agnostic: callers send the returned text however they like.

const MAX_TURNS = 6;

/** Convert stored conversation history into Anthropic message params (must start user). */
function toMessageParams(messages: ConvoMessage[]): Anthropic.MessageParam[] {
  const mapped = messages.map((m) => ({
    role: (m.role === "patient" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));
  // Anthropic requires the first message to be from the user; drop any leading welcome.
  let start = 0;
  while (start < mapped.length && mapped[start].role !== "user") start++;
  return mapped.slice(start);
}

function plansSummaryFor(thread: Thread, plans: Plan[]): string {
  if (thread.status === "intake") {
    return "Not enough detail yet — gather a couple of facts, then call recommend_plans.";
  }
  const { result } = recommendPlans(thread.profile as PatientProfile, plans);
  return plansSummaryText(result);
}

export interface ConciergeResult {
  replies: ConvoMessage[];
}

/**
 * Process one inbound patient message. Appends it to the thread, runs the agent loop, and
 * returns the reply messages (already appended to the thread too). The caller is
 * responsible for persisting the thread and delivering replies over the channel.
 */
export async function runConcierge(thread: Thread, patientText: string): Promise<ConciergeResult> {
  appendMessage(thread, { role: "patient", text: patientText, ts: Date.now() });

  if (!anthropicKeyPresent()) {
    const reply: ConvoMessage = {
      role: "agent",
      text: "I need an assistant key to reply live. Add ANTHROPIC_API_KEY and text me again.",
      ts: Date.now(),
    };
    appendMessage(thread, reply);
    return { replies: [reply] };
  }

  const plans = await loadPlans(thread.profile.state ?? "TX");
  const anthropic = getAnthropic();
  const messages = toMessageParams(thread.messages);

  let finalText = "";
  let lastMeta: MessageMeta | undefined;

  for (let i = 0; i < MAX_TURNS; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: MODELS.reason,
      max_tokens: 1024,
      system: conciergeSystemPrompt(thread.profile, plansSummaryFor(thread, plans), thread.status),
      tools: CONCIERGE_TOOLS,
      messages,
    };
    const msg = await anthropic.messages.create(params);
    messages.push({ role: "assistant", content: msg.content });

    finalText = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    if (msg.stop_reason !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      const out = await dispatchTool(block.name, block.input as Record<string, unknown>, thread, plans);
      if (out.meta) lastMeta = out.meta;
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(out.result),
      });
    }
    messages.push({ role: "user", content: results });
  }

  if (!finalText) finalText = "Let me look into that — can you say a bit more?";
  const reply: ConvoMessage = { role: "agent", text: finalText, ts: Date.now(), meta: lastMeta };
  appendMessage(thread, reply);
  return { replies: [reply] };
}
