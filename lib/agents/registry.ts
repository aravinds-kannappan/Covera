import type { Plan, PatientProfile, ServiceKey } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import type { Thread, MessageMeta } from "@/lib/agents/types";
import { extractProfilePatch, describeProfile } from "@/lib/agents/intake";
import { recommendPlans, type WhatIfPatch } from "@/lib/agents/advisor";
import { compareEmployerOffer } from "@/lib/agents/marketplace";
import { lookupProcedure, estimateOnPlan, PROCEDURE_CHOICES } from "@/lib/agents/hospital";
import { draftOutreach } from "@/lib/agents/outreach";
import { draftAppeal } from "@/lib/agents/appeals";
import { auditBill, type BillLine } from "@/lib/sim/billaudit";
import { recheck } from "@/lib/sim/recheck";

// The tools the Concierge can call, and a dispatcher that runs them. Some tools are
// deterministic (the simulation advisor, marketplace, hospital); intake and outreach are
// LLM sub-agents. Every tool returns a model-readable result plus, optionally, rich
// `meta` that the web UI renders as a panel beside the text bubble.

const procedureIds = PROCEDURE_CHOICES.map((p) => p.id);

export const CONCIERGE_TOOLS = [
  {
    name: "update_profile",
    description:
      "Read free-text the patient just shared (health conditions, meds, age, state, income, household, risk preference) into their structured profile. Pass their words verbatim.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string", description: "The patient's own words to interpret." } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "remember_context",
    description:
      "Save a qualitative detail about the patient's life, fears, constraints, or preferences that doesn't fit the structured profile (e.g. 'worried about a surprise ER bill', 'self-employed with variable income', 'wants to keep her oncologist', 'travels abroad often'). Use this whenever they reveal something human that should shape your advice and tone.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "One concise sentence capturing the detail, in the third person." },
      },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    name: "recommend_plans",
    description:
      "Run the real Monte-Carlo optimizer over real CMS plans for this patient and return the top-ranked plans. Use for the first recommendation, a re-rank, or any 'what if' (pass only the changed fields in whatif).",
    input_schema: {
      type: "object",
      properties: {
        whatif: {
          type: "object",
          properties: {
            conditions: { type: "array", items: { type: "string" } },
            plannedEvents: { type: "array", items: { type: "string" } },
            annualIncome: { type: "number" },
            riskTolerance: { type: "string", enum: ["low", "medium", "high"] },
            requireHsa: { type: "boolean" },
            age: { type: "number" },
          },
          additionalProperties: false,
        },
        label: { type: "string", description: "Short label for the scenario, e.g. 'If you get pregnant'." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "compare_employer_offer",
    description:
      "Compare the best marketplace plan (net of subsidy) against the patient's employer offer. Pass employerMonthlyToEmployee if the patient said what their employer plan costs them per month.",
    input_schema: {
      type: "object",
      properties: { employerMonthlyToEmployee: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "lookup_procedure_cost",
    description: `Estimate what a specific procedure costs across plans in the patient's state. procedureId must be one of: ${procedureIds.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { procedureId: { type: "string", enum: procedureIds } },
      required: ["procedureId"],
      additionalProperties: false,
    },
  },
  {
    name: "finalize_plan",
    description: "Record that the patient has chosen a plan. Pass the plan's marketing name as shown in the ranking.",
    input_schema: {
      type: "object",
      properties: { planName: { type: "string" } },
      required: ["planName"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_outreach",
    description:
      "Compose a message to the patient's employer HR or a hospital/provider (only after a plan is finalized). Returns a draft to show the patient; set send=true only if they approved and a recipient email is known.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["employer", "hospital"] },
        to: { type: "string", description: "Recipient email, if known." },
        note: { type: "string", description: "What the patient wants to ask." },
        send: { type: "boolean" },
      },
      required: ["target"],
      additionalProperties: false,
    },
  },
  {
    name: "estimate_my_cost",
    description: `Estimate what a specific procedure would cost THIS patient on their own plan (their finalized plan, or the current top recommendation) — both before and after their deductible is met. procedureId must be one of: ${procedureIds.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { procedureId: { type: "string", enum: procedureIds } },
      required: ["procedureId"],
      additionalProperties: false,
    },
  },
  {
    name: "audit_bill",
    description:
      "Audit a medical bill the patient received. Pass each line item; map its description to the closest serviceKey so it can be benchmarked against typical allowed amounts. Returns flagged overcharges and likely duplicates the patient should question.",
    input_schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "The line item as printed on the bill." },
              serviceKey: { type: "string", enum: SERVICE_KEYS },
              billed: { type: "number", description: "Dollar amount billed for this line." },
              units: { type: "number" },
            },
            required: ["description", "billed"],
            additionalProperties: false,
          },
        },
      },
      required: ["lines"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_appeal",
    description:
      "Draft an appeal letter for a denied claim. Pass the denied service and the stated denial reason. Returns a draft to show the patient; it is never sent automatically.",
    input_schema: {
      type: "object",
      properties: {
        service: { type: "string", description: "The denied service, e.g. 'MRI of the knee'." },
        denialReason: { type: "string", description: "The reason the insurer gave for the denial." },
      },
      required: ["service", "denialReason"],
      additionalProperties: false,
    },
  },
  {
    name: "recheck_savings",
    description:
      "Re-run the optimizer for the patient's current situation and compare their existing plan to this year's best option, surfacing the annual savings of switching. Use at open enrollment or whenever their health, meds, or income changed.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

export interface DispatchOutput {
  /** JSON-stringifiable result handed back to the model. */
  result: unknown;
  /** Optional rich payload for the web UI. */
  meta?: MessageMeta;
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  thread: Thread,
  plans: Plan[],
): Promise<DispatchOutput> {
  switch (name) {
    case "update_profile": {
      const patch = await extractProfilePatch(String(input.text ?? ""));
      thread.profile = { ...thread.profile, ...patch };
      const { filled, missing } = describeProfile(thread.profile);
      return { result: { captured: filled, stillUseful: missing }, meta: { kind: "profile", data: { filled, missing } } };
    }
    case "remember_context": {
      const note = String(input.note ?? "").trim();
      if (note && !thread.notes.includes(note)) {
        thread.notes.push(note);
        if (thread.notes.length > 20) thread.notes = thread.notes.slice(-20);
      }
      return { result: { remembered: note, allContext: thread.notes } };
    }
    case "recommend_plans": {
      const whatif = (input.whatif as WhatIfPatch) ?? undefined;
      const label = typeof input.label === "string" ? input.label : whatif ? "What-if scenario" : "Your ranked plans";
      const { meta } = recommendPlans(thread.profile as PatientProfile, plans, { whatIf: whatif, label });
      if (thread.status === "intake") thread.status = "advising";
      return { result: meta, meta: { kind: whatif ? "whatif" : "plans", data: meta } };
    }
    case "compare_employer_offer": {
      const employer = typeof input.employerMonthlyToEmployee === "number" ? input.employerMonthlyToEmployee : undefined;
      const meta = compareEmployerOffer(thread.profile as PatientProfile, plans, employer);
      return { result: meta, meta: { kind: "marketplace", data: meta } };
    }
    case "lookup_procedure_cost": {
      const meta = lookupProcedure(thread.profile.state ?? "TX", String(input.procedureId), plans);
      return { result: meta, meta: { kind: "hospital", data: meta } };
    }
    case "finalize_plan": {
      const planName = String(input.planName ?? "");
      const match = plans.find((p) => p.marketingName.toLowerCase() === planName.toLowerCase());
      thread.selectedPlanId = match?.id ?? thread.selectedPlanId;
      thread.status = "finalized";
      return { result: { finalized: true, plan: match?.marketingName ?? planName } };
    }
    case "draft_outreach": {
      const meta = await draftOutreach({
        thread,
        target: input.target === "hospital" ? "hospital" : "employer",
        to: typeof input.to === "string" ? input.to : null,
        note: typeof input.note === "string" ? input.note : undefined,
        send: input.send === true,
      });
      return { result: meta, meta: { kind: "outreach", data: meta } };
    }
    case "estimate_my_cost": {
      // The patient's own plan: their finalized choice, else this year's top recommendation.
      let plan = thread.selectedPlanId
        ? plans.find((p) => p.id === thread.selectedPlanId)
        : undefined;
      if (!plan) {
        const { result } = recommendPlans(thread.profile as PatientProfile, plans);
        plan = result.ranked[0]?.plan;
      }
      if (!plan) return { result: { error: "No plan available to estimate against yet." } };
      const est = estimateOnPlan(plan, String(input.procedureId));
      return { result: est, meta: { kind: "estimate", data: est } };
    }
    case "audit_bill": {
      const raw = Array.isArray(input.lines) ? (input.lines as unknown[]) : [];
      const lines: BillLine[] = raw.map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return {
          description: String(o.description ?? ""),
          serviceKey:
            typeof o.serviceKey === "string" ? (o.serviceKey as ServiceKey) : undefined,
          billed: typeof o.billed === "number" ? o.billed : Number(o.billed) || 0,
          units: typeof o.units === "number" ? o.units : undefined,
        };
      });
      const audit = auditBill(lines);
      return {
        result: audit,
        meta: {
          kind: "billaudit",
          data: {
            totalBilled: audit.totalBilled,
            potentialOvercharge: audit.potentialOvercharge,
            flaggedLines: audit.lines
              .filter((l) => l.flags.length > 0)
              .map((l) => ({
                description: l.description,
                billed: l.billed,
                referenceAllowed: l.referenceAllowed,
                flags: l.flags,
              })),
            summary: audit.flags,
          },
        },
      };
    }
    case "draft_appeal": {
      const draft = await draftAppeal({
        thread,
        service: String(input.service ?? "the denied service"),
        denialReason: String(input.denialReason ?? "not specified"),
        planName: thread.selectedPlanId
          ? plans.find((p) => p.id === thread.selectedPlanId)?.marketingName
          : undefined,
      });
      return { result: draft, meta: { kind: "appeal", data: draft } };
    }
    case "recheck_savings": {
      const res = recheck(thread.profile as PatientProfile, plans, thread.selectedPlanId);
      return { result: res, meta: { kind: "recheck", data: res } };
    }
    default:
      return { result: { error: `Unknown tool ${name}` } };
  }
}
