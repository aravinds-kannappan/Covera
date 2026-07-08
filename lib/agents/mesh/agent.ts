import type { Plan, PatientProfile } from "@/lib/types";
import { runAgentTurn, type Provider } from "@/lib/llm/router";
import type { AgentMessage, ToolResult, ToolSpec } from "@/lib/llm/types";
import { loadPlans } from "@/lib/data/plans";
import { lookupProcedure, PROCEDURE_CHOICES } from "@/lib/agents/hospital";
import { compareEmployerOffer } from "@/lib/agents/marketplace";
import { consultConcierge, type ConciergeConsult } from "@/lib/agents/mesh/consult";

// The mesh: the hospital desk and the employer benefits desk each get their own agent, and both
// can CONSULT the patient's concierge. A physician talks to the hospital agent; it calls the
// concierge (through the member's Coverage Card) to confirm coverage and quote a real cost. An HR
// contact talks to the employer agent; it asks the concierge what a representative employee would
// pay on the marketplace net of subsidy. The other agents' numbers are the same deterministic
// simulation the patient sees, so nobody quotes a guess. Runs on the shared model router (cheap
// Baseten by default, Claude fallback).

export type MeshRole = "hospital" | "employer";

export interface MeshHistoryItem {
  role: "user" | "agent";
  text: string;
}
export interface MeshMeta {
  kind: string;
  data: unknown;
}
export interface MeshTurnResult {
  text: string;
  meta?: MeshMeta;
  /** Every cross-agent consult that happened this turn, so the UI can show the exchange. */
  consults: ConciergeConsult[];
}

const procedureIds = PROCEDURE_CHOICES.map((p) => p.id);

const HOSPITAL_TOOLS: ToolSpec[] = [
  {
    name: "consult_concierge",
    description:
      "Ask the patient's Covera concierge to confirm their coverage from the Coverage Card they shared, and (optionally) their real out-of-pocket cost for a procedure. The concierge answers only from the card, with no access to records.",
    input_schema: {
      type: "object",
      properties: { procedureId: { type: "string", enum: procedureIds, description: "Procedure to price on the member's own plan." } },
      additionalProperties: false,
    },
  },
  {
    name: "procedure_range",
    description: "Typical patient cost for a procedure across all plans in the state (a range, not this member).",
    input_schema: {
      type: "object",
      properties: { procedureId: { type: "string", enum: procedureIds } },
      required: ["procedureId"],
      additionalProperties: false,
    },
  },
];

const EMPLOYER_TOOLS: ToolSpec[] = [
  {
    name: "consult_marketplace",
    description:
      "Ask the concierge what a representative employee would pay on the on-exchange marketplace, net of the subsidy they'd qualify for, and how that compares to an employer contribution.",
    input_schema: {
      type: "object",
      properties: {
        income: { type: "number", description: "The employee's annual income." },
        age: { type: "number" },
        employerMonthly: { type: "number", description: "What the employer plan costs the employee per month, if known." },
      },
      required: ["income", "age"],
      additionalProperties: false,
    },
  },
];

function toolsFor(role: MeshRole): ToolSpec[] {
  return role === "hospital" ? HOSPITAL_TOOLS : EMPLOYER_TOOLS;
}

function systemPrompt(role: MeshRole, state: string, hasCard: boolean): string {
  const common =
    "Write plain text only: no markdown, no bullets, no em dashes (use a period, colon, or parentheses). Be concise and factual. Never invent a number: every figure must come from a tool result. You are decision support, not advice.";
  if (role === "hospital") {
    return [
      "You are Covera's hospital cost desk agent. A clinician or billing staffer is speaking with you about a patient who shared their Covera Coverage Card.",
      hasCard
        ? "The member's Coverage Card is available. Use consult_concierge to confirm their coverage and quote their real out-of-pocket cost for a procedure; use procedure_range for a typical cross-plan range."
        : "No Coverage Card has been shared yet. Ask the staffer to paste the patient's card link, then consult the concierge. You can still give a typical cross-plan range with procedure_range.",
      "Explain the before vs after deductible cost simply, and remind them the concierge answered only from the card, with no records accessed.",
      common,
    ].join("\n");
  }
  return [
    `You are Covera's employer benefits desk agent, talking with an HR or benefits contact (state ${state}).`,
    "Use consult_marketplace to show what a representative employee would pay on the marketplace net of subsidy, and how an ICHRA or group contribution compares. Frame it as asking the concierge on the employee's behalf.",
    common,
  ].join("\n");
}

function toAgentMessages(history: MeshHistoryItem[]): AgentMessage[] {
  const mapped: AgentMessage[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    text: m.text,
  }));
  let start = 0;
  while (start < mapped.length && mapped[start].role !== "user") start++;
  return mapped.slice(start);
}

interface MeshCtx {
  state: string;
  plans: Plan[];
  cardToken?: string;
}

function dispatchMesh(
  role: MeshRole,
  name: string,
  input: Record<string, unknown>,
  ctx: MeshCtx,
): { result: unknown; meta?: MeshMeta; consult?: ConciergeConsult } {
  if (name === "consult_concierge") {
    const consult = consultConcierge({ cardToken: ctx.cardToken, procedureId: typeof input.procedureId === "string" ? input.procedureId : undefined });
    return { result: consult, meta: { kind: "consult", data: consult }, consult };
  }
  if (name === "procedure_range") {
    const meta = lookupProcedure(ctx.state, String(input.procedureId), ctx.plans);
    return { result: meta, meta: { kind: "hospital", data: meta } };
  }
  if (name === "consult_marketplace") {
    const profile: PatientProfile = {
      age: typeof input.age === "number" ? input.age : 40,
      sex: "female",
      state: ctx.state,
      householdSize: 1,
      annualIncome: typeof input.income === "number" ? input.income : 45000,
      tobacco: false,
      conditions: [],
      prescriptions: [],
      plannedEvents: [],
      providers: [],
      riskTolerance: "medium",
    };
    const employerMonthly = typeof input.employerMonthly === "number" ? input.employerMonthly : undefined;
    const meta = compareEmployerOffer(profile, ctx.plans, employerMonthly);
    const consult: ConciergeConsult = {
      ok: true,
      note: `Concierge (on the employee's behalf): the best marketplace plan is about $${meta.bestMarketplaceMonthly}/mo net of subsidy.`,
    };
    return { result: meta, meta: { kind: "marketplace", data: meta }, consult };
  }
  return { result: { error: `Unknown tool ${name}` } };
}

export async function runMeshTurn(params: {
  role: MeshRole;
  history: MeshHistoryItem[];
  text: string;
  state?: string;
  cardToken?: string;
  provider?: Provider;
}): Promise<MeshTurnResult> {
  const state = params.state || "TX";
  const plans = await loadPlans(state);
  const ctx: MeshCtx = { state, plans, cardToken: params.cardToken };

  const messages = toAgentMessages(params.history);
  messages.push({ role: "user", text: params.text });

  let finalText = "";
  let meta: MeshMeta | undefined;
  const consults: ConciergeConsult[] = [];

  for (let i = 0; i < 4; i++) {
    const turn = await runAgentTurn(
      {
        role: "reason",
        system: systemPrompt(params.role, state, !!params.cardToken),
        tools: toolsFor(params.role),
        messages,
        maxTokens: 700,
      },
      params.provider,
    );
    finalText = turn.text;
    messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls });

    if (turn.stopReason !== "tool_use" || turn.toolCalls.length === 0) break;

    const results: ToolResult[] = [];
    for (const call of turn.toolCalls) {
      const out = dispatchMesh(params.role, call.name, call.input, ctx);
      if (out.meta) meta = out.meta;
      if (out.consult) consults.push(out.consult);
      results.push({ id: call.id, content: JSON.stringify(out.result) });
    }
    messages.push({ role: "user", toolResults: results });
  }

  if (!finalText) finalText = "Let me look into that: can you say a bit more?";
  return { text: finalText, meta, consults };
}
