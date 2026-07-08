import type { PatientProfile, Plan } from "@/lib/types";
import { runAgentTurn, type Provider } from "@/lib/llm/router";
import type { AgentMessage, ToolResult } from "@/lib/llm/types";
import { loadPlans } from "@/lib/data/plans";
import { newThread } from "@/lib/store/conversations";
import { CONCIERGE_TOOLS, dispatchTool } from "@/lib/agents/registry";
import { conciergeSystemPrompt } from "@/lib/agents/prompts";
import { recommendPlans, plansSummaryText } from "@/lib/agents/advisor";
import { extractJSON } from "@/lib/anthropic/client";

// Agents as Judge, run live. One agent answers a patient's question using Covera's real tools (the
// same simulation the product runs). A second agent then judges that answer against the real tool
// outputs. Both run through the shared model router. This is invoked on demand from /benchmark, so
// the scores are produced fresh against real data instead of being read from a committed file.

interface Question {
  text: string;
  expectTool?: string;
}

const SUITE: Question[] = [
  { text: "I'm 30, in Texas, make about $40k, no health issues. What plans should I look at?", expectTool: "recommend_plans" },
  { text: "My job's plan costs me $350 a month. Should I use it or the marketplace?", expectTool: "compare_employer_offer" },
  { text: "How much would an MRI cost me out of pocket?", expectTool: "lookup_procedure_cost" },
  { text: "What if I get pregnant next year: does my best plan change?", expectTool: "recommend_plans" },
  { text: "Why isn't the cheapest plan always the best choice for me?" },
];

export const SUITE_SIZE = SUITE.length;
export const SUITE_META = SUITE.map((q) => ({ text: q.text, expectTool: q.expectTool ?? null }));

export interface JudgeScores {
  faithfulness: number; // 0..100
  toolUse: number;
  helpfulness: number;
  overall: number;
  rationale: string;
}

export interface LiveEvalResult {
  index: number;
  total: number;
  question: string;
  expectTool: string | null;
  provider: string;
  model: string;
  judgeModel: string;
  toolsCalled: string[];
  toolHit: boolean | null;
  answer: string;
  citedFigures: number; // dollar amounts the answer stated
  supportedFigures: number; // how many matched a real number a tool produced
  judge: JudgeScores;
  ms: number;
}

function baseProfile(): PatientProfile {
  return {
    age: 30,
    sex: "female",
    state: "TX",
    householdSize: 1,
    annualIncome: 40000,
    tobacco: false,
    conditions: [],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };
}

// Dollar amounts (>= $50, to skip ages and counts) stated in free text.
function dollarsIn(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?([0-9][0-9,]{1,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 50) out.push(n);
  }
  return out;
}

// Every numeric value that appears anywhere in a tool result: the set of real figures.
function numbersIn(value: unknown, acc: Set<number> = new Set()): Set<number> {
  if (typeof value === "number") acc.add(Math.round(value));
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, acc));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, acc));
  return acc;
}

function isSupported(amount: number, real: Set<number>): boolean {
  for (const r of real) {
    if (r === 0) continue;
    if (Math.abs(amount - r) / r <= 0.02) return true; // within 2%
  }
  return false;
}

async function answerQuestion(provider: Provider | undefined, plans: Plan[], q: Question) {
  const thread = newThread("bench-live", "sandbox");
  thread.profile = baseProfile();
  const { result } = recommendPlans(thread.profile as PatientProfile, plans);
  const system = conciergeSystemPrompt(thread.profile, plansSummaryText(result), thread.status, thread.notes);

  const messages: AgentMessage[] = [{ role: "user", text: q.text }];
  const toolsCalled: string[] = [];
  const real = new Set<number>();
  let answer = "";
  let model = "";
  let usedProvider = "";

  for (let i = 0; i < 5; i++) {
    const turn = await runAgentTurn({ role: "reason", system, tools: CONCIERGE_TOOLS, messages, maxTokens: 800 }, provider);
    model = turn.model;
    usedProvider = turn.provider;
    answer = turn.text;
    messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });
    if (turn.stopReason !== "tool_use" || turn.toolCalls.length === 0) break;
    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      toolsCalled.push(call.name);
      const out = await dispatchTool(call.name, call.input, thread, plans);
      numbersIn(out.result, real);
      results.push({ id: call.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: "user", toolResults: results });
  }

  return { answer, toolsCalled, real, model, usedProvider };
}

async function judgeAnswer(provider: Provider | undefined, question: string, answer: string) {
  const system = [
    "You are a strict evaluation agent. Score a health-insurance assistant's reply to a patient.",
    "Return ONLY a JSON object: { \"faithfulness\": 0-100, \"toolUse\": 0-100, \"helpfulness\": 0-100, \"overall\": 0-100, \"rationale\": string }.",
    "faithfulness: does it avoid inventing numbers and stay grounded in real quotes.",
    "toolUse: does it clearly rely on a real calculation rather than guessing.",
    "helpfulness: is it warm, clear, specific, and appropriately concise for a text message.",
    "overall: your holistic score. rationale: one short sentence.",
  ].join("\n");
  const turn = await runAgentTurn(
    { role: "reason", system, tools: [], messages: [{ role: "user", text: `Patient: ${question}\nAssistant: ${answer}` }], maxTokens: 300 },
    provider,
  );
  const parsed = extractJSON<Partial<JudgeScores>>(turn.text) ?? {};
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const scores: JudgeScores = {
    faithfulness: clamp(parsed.faithfulness),
    toolUse: clamp(parsed.toolUse),
    helpfulness: clamp(parsed.helpfulness),
    overall: clamp(parsed.overall),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 240) : "",
  };
  return { scores, model: turn.model };
}

export async function evaluateQuestion(index: number, provider?: Provider): Promise<LiveEvalResult> {
  const q = SUITE[index];
  const plans = await loadPlans("TX");
  const t0 = Date.now();

  const a = await answerQuestion(provider, plans, q);
  const cited = dollarsIn(a.answer);
  const supported = cited.filter((c) => isSupported(c, a.real)).length;
  const j = await judgeAnswer(provider, q.text, a.answer);

  return {
    index,
    total: SUITE.length,
    question: q.text,
    expectTool: q.expectTool ?? null,
    provider: a.usedProvider,
    model: a.model,
    judgeModel: j.model,
    toolsCalled: a.toolsCalled,
    toolHit: q.expectTool ? a.toolsCalled.includes(q.expectTool) : null,
    answer: a.answer,
    citedFigures: cited.length,
    supportedFigures: supported,
    judge: j.scores,
    ms: Date.now() - t0,
  };
}
