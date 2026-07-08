/**
 * LLM model benchmark.
 *
 * Runs a fixed suite of patient questions through several candidate models, each driving
 * the real Covera tool loop (the same tools the concierge uses), and scores:
 *   - faithfulness: share of dollar figures in the answer that match a real simulated
 *     number from a tool result (vs. hallucinated)
 *   - toolAccuracy: share of questions where the model called the expected tool
 *   - quality: an LLM-as-judge rubric score
 *   - latency and cost (from real token usage × published per-model pricing)
 *
 *   npm run benchmark   →   writes data/llm-benchmark.json   (needs ANTHROPIC_API_KEY)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { PatientProfile, Plan } from "@/lib/types";
import { getAnthropic, anthropicKeyPresent } from "@/lib/anthropic/client";
import { loadPlans } from "@/lib/data/plans";
import { newThread } from "@/lib/store/conversations";
import { CONCIERGE_TOOLS, dispatchTool } from "@/lib/agents/registry";
import { conciergeSystemPrompt } from "@/lib/agents/prompts";
import { recommendPlans, plansSummaryText } from "@/lib/agents/advisor";
import type { LlmBenchmarkReport, ModelResult } from "@/lib/benchmark/types";

// Published pricing (USD per 1M tokens): source: Anthropic model docs. Opus and Fable are
// intentionally excluded (too expensive per the project's cost policy). PR4 extends this list
// with the Baseten models (DeepSeek / GLM / Kimi / GPT-OSS) via the shared lib/llm router.
const MODELS: { id: string; label: string; inPrice: number; outPrice: number }[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", inPrice: 3, outPrice: 15 },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", inPrice: 1, outPrice: 5 },
];
const JUDGE_MODEL = "claude-sonnet-5";

interface Question {
  text: string;
  expectTool?: string;
}

const SUITE: Question[] = [
  { text: "I'm 30, in Texas, make about $40k, no health issues. What plans should I look at?", expectTool: "recommend_plans" },
  { text: "What if I get pregnant next year: does my best plan change?", expectTool: "recommend_plans" },
  { text: "My job's plan costs me $350 a month. Should I use it or go to the marketplace?", expectTool: "compare_employer_offer" },
  { text: "How much would an MRI cost me out of pocket?", expectTool: "lookup_procedure_cost" },
  { text: "I have type 2 diabetes and take metformin daily: factor that in.", expectTool: "update_profile" },
  { text: "Honestly I'm terrified of getting a surprise hospital bill I can't pay." },
  { text: "Why isn't the cheapest plan always the best choice for me?" },
  { text: "How much does having a baby cost in Texas on these plans?", expectTool: "lookup_procedure_cost" },
];

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

// Pull integer dollar amounts (>= $50, to skip ages/counts) out of free text.
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

// Every numeric value appearing anywhere in a tool result: the set of "real" figures.
function numbersIn(value: unknown, acc: Set<number> = new Set()): Set<number> {
  if (typeof value === "number") acc.add(Math.round(value));
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, acc));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, acc));
  return acc;
}

function isSupported(amount: number, real: Set<number>): boolean {
  for (const r of real) {
    if (r === 0) continue;
    if (Math.abs(amount - r) / r <= 0.02) return true; // within 2% (rounding/phrasing)
  }
  return false;
}

async function runQuestion(
  anthropic: Anthropic,
  model: string,
  plans: Plan[],
  q: Question,
): Promise<{ answer: string; toolsCalled: string[]; realNumbers: Set<number>; inTok: number; outTok: number; ms: number }> {
  const thread = newThread("bench", "sandbox");
  thread.profile = baseProfile();
  const { result } = recommendPlans(thread.profile as PatientProfile, plans);
  const system = conciergeSystemPrompt(thread.profile, plansSummaryText(result), thread.status, thread.notes);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: q.text }];
  const toolsCalled: string[] = [];
  const realNumbers = new Set<number>();
  let inTok = 0;
  let outTok = 0;
  let answer = "";
  const t0 = Date.now();

  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = { model, max_tokens: 1024, system, tools: CONCIERGE_TOOLS, messages };
    const msg = await anthropic.messages.create(params);
    inTok += msg.usage.input_tokens;
    outTok += msg.usage.output_tokens;
    messages.push({ role: "assistant", content: msg.content });
    answer = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    if (msg.stop_reason !== "tool_use") break;
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      toolsCalled.push(block.name);
      const out = await dispatchTool(block.name, block.input as Record<string, unknown>, thread, plans);
      numbersIn(out.result, realNumbers);
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: "user", content: results });
  }
  return { answer, toolsCalled, realNumbers, inTok, outTok, ms: Date.now() - t0 };
}

async function judge(anthropic: Anthropic, q: string, answer: string): Promise<number> {
  const prompt = [
    "Score this health-insurance assistant reply from 0 to 100 on how helpful, accurate-sounding, warm, and appropriately concise it is for a patient texting in.",
    "Reply with ONLY the integer.",
    "",
    `Patient: ${q}`,
    `Assistant: ${answer}`,
  ].join("\n");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = { model: JUDGE_MODEL, max_tokens: 16, messages: [{ role: "user", content: prompt }] };
  const msg = await anthropic.messages.create(params);
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const n = Number((text.match(/\d{1,3}/) ?? ["0"])[0]);
  return Math.max(0, Math.min(100, n)) / 100;
}

async function benchmarkModel(anthropic: Anthropic, m: (typeof MODELS)[number], plans: Plan[]): Promise<ModelResult> {
  let faithNum = 0;
  let faithDen = 0;
  let toolHits = 0;
  let toolExpected = 0;
  let qualitySum = 0;
  const latencies: number[] = [];
  let cost = 0;

  for (const q of SUITE) {
    const r = await runQuestion(anthropic, m.id, plans, q);
    latencies.push(r.ms / 1000);
    cost += (r.inTok / 1e6) * m.inPrice + (r.outTok / 1e6) * m.outPrice;

    const claims = dollarsIn(r.answer);
    for (const c of claims) {
      faithDen++;
      if (isSupported(c, r.realNumbers)) faithNum++;
    }
    if (q.expectTool) {
      toolExpected++;
      if (r.toolsCalled.includes(q.expectTool)) toolHits++;
    }
    qualitySum += await judge(anthropic, q.text, r.answer);
    console.log(`  [${m.label}] "${q.text.slice(0, 38)}…" tools=${r.toolsCalled.join(",") || "none"} ${Math.round(r.ms)}ms`);
  }

  latencies.sort((a, b) => a - b);
  return {
    model: m.id,
    label: m.label,
    faithfulness: faithDen ? faithNum / faithDen : 1,
    toolAccuracy: toolExpected ? toolHits / toolExpected : 1,
    quality: qualitySum / SUITE.length,
    latencySec: Math.round(latencies[Math.floor(latencies.length / 2)] * 10) / 10,
    costPer100: Math.round((cost / SUITE.length) * 100 * 100) / 100,
    questionsRun: SUITE.length,
  };
}

async function main() {
  if (!anthropicKeyPresent()) {
    console.error("ANTHROPIC_API_KEY is required to run the LLM benchmark. Set it in .env.local and retry.");
    process.exit(1);
  }
  const anthropic = getAnthropic();
  const plans = await loadPlans("TX");
  const results: ModelResult[] = [];
  for (const m of MODELS) {
    console.log(`\nBenchmarking ${m.label} (${m.id})…`);
    results.push(await benchmarkModel(anthropic, m, plans));
  }

  const report: LlmBenchmarkReport = {
    generatedAt: new Date().toISOString(),
    suiteSize: SUITE.length,
    judgeModel: JUDGE_MODEL,
    results,
  };
  const outDir = path.resolve(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "llm-benchmark.json"), JSON.stringify(report, null, 2));

  console.log("\nModel        faith  tool  qual  lat(s)  $/100conv");
  for (const r of results) {
    console.log(
      `${r.label.padEnd(12)} ${(r.faithfulness * 100).toFixed(0).padStart(4)}% ${(r.toolAccuracy * 100).toFixed(0).padStart(4)}% ${(r.quality * 100).toFixed(0).padStart(4)}% ${String(r.latencySec).padStart(6)}  $${r.costPer100.toFixed(2)}`,
    );
  }
  console.log("\n→ data/llm-benchmark.json");
}

main();
