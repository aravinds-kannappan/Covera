import type { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { PatientProfile } from "@/lib/types";
import { loadPlans } from "@/lib/data/plans";
import { optimize } from "@/lib/sim/optimize";
import { usd } from "@/lib/utils";
import { MODELS, anthropicKeyPresent, getAnthropic } from "@/lib/anthropic/client";

export const runtime = "nodejs";

const SIM_TOOL = {
  name: "simulate_scenario",
  description:
    "Re-run the insurance optimizer with changes to the patient's situation, to answer 'what if' questions with real numbers. Only pass the fields that change.",
  input_schema: {
    type: "object",
    properties: {
      conditions: {
        type: "array",
        items: { type: "string" },
        description: "Full replacement list of condition keys for the scenario.",
      },
      plannedEvents: {
        type: "array",
        items: { type: "string" },
        description: "Full replacement list of planned-event keys (e.g. pregnancy).",
      },
      annualIncome: { type: "number" },
      riskTolerance: { type: "string", enum: ["low", "medium", "high"] },
      requireHsa: { type: "boolean" },
      age: { type: "number" },
      label: { type: "string", description: "Short human label for this scenario." },
    },
    additionalProperties: false,
  },
} as const;

function systemPrompt(profile: PatientProfile, plansSummary: string): string {
  return [
    "You are Covera's coverage assistant. You help one patient understand their health-insurance options.",
    "Every plan figure you cite comes from real CMS Public Use File data and a Monte-Carlo simulation already run for this patient. Be specific and quantitative; never invent numbers — cite the ones provided or call simulate_scenario to get fresh ones.",
    "Be concise and warm. Lead with the answer. Explain tradeoffs in plain language (deductible, coinsurance, out-of-pocket max). When the patient asks a 'what if', call simulate_scenario, then explain how the ranking changed.",
    "You are decision support, not insurance advice; remind the patient to confirm specifics with the issuer when relevant.",
    "",
    `Patient: age ${profile.age}, ${profile.sex}, ${profile.state}, household ${profile.householdSize}, income ${usd(profile.annualIncome)}.`,
    `Conditions: ${profile.conditions.join(", ") || "none"}. Planned events: ${profile.plannedEvents.join(", ") || "none"}.`,
    "",
    "Current ranked plans for this patient (expected = typical all-in annual cost):",
    plansSummary,
  ].join("\n");
}

function runScenario(base: PatientProfile, input: Record<string, unknown>, plans: Awaited<ReturnType<typeof loadPlans>>) {
  const patch: Partial<PatientProfile> = {};
  if (Array.isArray(input.conditions)) patch.conditions = input.conditions as PatientProfile["conditions"];
  if (Array.isArray(input.plannedEvents)) patch.plannedEvents = input.plannedEvents as PatientProfile["plannedEvents"];
  if (typeof input.annualIncome === "number") patch.annualIncome = input.annualIncome;
  if (typeof input.riskTolerance === "string") patch.riskTolerance = input.riskTolerance as PatientProfile["riskTolerance"];
  if (typeof input.requireHsa === "boolean") patch.requireHsa = input.requireHsa;
  if (typeof input.age === "number") patch.age = input.age;
  const res = optimize({ ...base, ...patch }, plans, { nFine: 2500 });
  return {
    label: typeof input.label === "string" ? input.label : "scenario",
    subsidyMonthly: Math.round(res.subsidy.aptcMonthly),
    topPlans: res.ranked.slice(0, 3).map((r) => ({
      name: r.plan.marketingName,
      metal: r.plan.metal,
      expectedTotal: r.sim.expectedTotal,
      p90: r.sim.p90,
      annualPremium: r.sim.annualPremium,
      probHitOOPMax: Math.round(r.sim.probHitOOPMax * 100),
    })),
  };
}

export async function POST(req: NextRequest) {
  if (!anthropicKeyPresent()) {
    return Response.json(
      { error: "The assistant needs an ANTHROPIC_API_KEY to be configured." },
      { status: 503 },
    );
  }
  const body = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    profile: PatientProfile;
    plansSummary: string;
  };
  const plans = await loadPlans(body.profile.state);
  const anthropic = getAnthropic();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      try {
        for (let i = 0; i < 4; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const params: any = {
            model: MODELS.reason,
            max_tokens: 2000,
            thinking: { type: "adaptive" },
            system: systemPrompt(body.profile, body.plansSummary),
            tools: [SIM_TOOL],
            messages,
          };
          const turn = anthropic.messages.stream(params);
          turn.on("text", (delta: string) => send({ type: "text", value: delta }));
          const msg = await turn.finalMessage();
          messages.push({ role: "assistant", content: msg.content });

          if (msg.stop_reason !== "tool_use") break;

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of msg.content) {
            if (block.type !== "tool_use") continue;
            send({ type: "tool", input: block.input });
            const result = runScenario(
              body.profile,
              block.input as Record<string, unknown>,
              plans,
            );
            send({ type: "tool_result", result });
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
          messages.push({ role: "user", content: results });
        }
      } catch (e) {
        send({
          type: "error",
          value:
            e instanceof Error && "status" in e && (e as { status: number }).status === 401
              ? "The assistant key is invalid."
              : "Something went wrong answering that.",
        });
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
