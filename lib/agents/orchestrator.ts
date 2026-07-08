import type { Plan, PatientProfile } from "@/lib/types";
import type { Thread, ConvoMessage, MessageMeta } from "@/lib/agents/types";
import { conciergeReady, runAgentTurn, type Provider } from "@/lib/llm/router";
import type { AgentMessage, ToolResult } from "@/lib/llm/types";
import { loadPlans } from "@/lib/data/plans";
import { recommendPlans, plansSummaryText } from "@/lib/agents/advisor";
import { conciergeSystemPrompt } from "@/lib/agents/prompts";
import { CONCIERGE_TOOLS, dispatchTool } from "@/lib/agents/registry";
import { appendMessage } from "@/lib/store/conversations";

// The Concierge orchestrator. Given a patient's inbound text and their thread, it runs an
// agentic tool loop (lead agent + specialist tools/sub-agents), mutates the thread
// (profile, status, selected plan) as a side effect, and returns the agent reply(ies) to
// deliver. It is channel- AND provider-agnostic: it drives lib/llm, so the same loop runs on a
// cheap Baseten model (voice) or Claude Sonnet 5 (text) with no changes here.

const MAX_TURNS = 6;

/** Convert stored conversation history into normalized turn messages (must start with a user). */
function toAgentMessages(messages: ConvoMessage[]): AgentMessage[] {
  const mapped: AgentMessage[] = messages.map((m) => ({
    role: m.role === "patient" ? "user" : "assistant",
    text: m.text,
  }));
  // The loop requires the first message to be from the user; drop any leading welcome.
  let start = 0;
  while (start < mapped.length && mapped[start].role !== "user") start++;
  return mapped.slice(start);
}

function plansSummaryFor(thread: Thread, plans: Plan[]): string {
  if (thread.status === "intake") {
    return "Not enough detail yet: gather a couple of facts, then call recommend_plans.";
  }
  const { result } = recommendPlans(thread.profile as PatientProfile, plans);
  return plansSummaryText(result);
}

export interface ConciergeResult {
  replies: ConvoMessage[];
}

export interface ConciergeOptions {
  /** Which brain to prefer: "baseten" for the voice concierge, default (Claude) for text. */
  provider?: Provider;
}

/**
 * Process one inbound patient message. Appends it to the thread, runs the agent loop, and
 * returns the reply messages (already appended to the thread too). The caller is
 * responsible for persisting the thread and delivering replies over the channel.
 */
export async function runConcierge(
  thread: Thread,
  patientText: string,
  opts: ConciergeOptions = {},
): Promise<ConciergeResult> {
  appendMessage(thread, { role: "patient", text: patientText, ts: Date.now() });

  if (!conciergeReady()) {
    const reply: ConvoMessage = {
      role: "agent",
      text: "I need an assistant key to reply live. Add ANTHROPIC_API_KEY (or an Orthogonal/Baseten key) and message me again.",
      ts: Date.now(),
    };
    appendMessage(thread, reply);
    return { replies: [reply] };
  }

  const plans = await loadPlans(thread.profile.state ?? "TX");
  const messages = toAgentMessages(thread.messages);

  let finalText = "";
  let lastMeta: MessageMeta | undefined;

  for (let i = 0; i < MAX_TURNS; i++) {
    // Model routing: intake is mostly profile capture and acknowledgements, which the
    // fast model handles well and cheaply. The reasoning-heavy work (ranking tradeoffs,
    // what-ifs, outreach) runs on the strong model. Status can flip to "advising"
    // mid-loop right after recommend_plans, so the explanation turn upgrades automatically.
    const role = thread.status === "intake" ? "fast" : "reason";
    const turn = await runAgentTurn(
      {
        role,
        system: conciergeSystemPrompt(
          thread.profile,
          plansSummaryFor(thread, plans),
          thread.status,
          thread.notes,
        ),
        tools: CONCIERGE_TOOLS,
        messages,
        maxTokens: 1024,
      },
      opts.provider,
    );

    finalText = turn.text;
    messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });

    if (turn.stopReason !== "tool_use" || turn.toolCalls.length === 0) break;

    const toolResults: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      const out = await dispatchTool(call.name, call.input, thread, plans);
      if (out.meta) lastMeta = out.meta;
      toolResults.push({ id: call.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: "user", toolResults });
  }

  if (!finalText) finalText = "Let me look into that: can you say a bit more?";
  const reply: ConvoMessage = { role: "agent", text: finalText, ts: Date.now(), meta: lastMeta };
  appendMessage(thread, reply);
  return { replies: [reply] };
}
