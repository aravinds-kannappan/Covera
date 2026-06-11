import type { NextRequest } from "next/server";
import type {
  ConditionKey,
  DrugTier,
  PatientProfile,
  PlannedEventKey,
} from "@/lib/types";
import {
  CONDITION_OPTIONS,
  DRUG_TIER_OPTIONS,
  EVENT_OPTIONS,
  SUPPORTED_STATES,
} from "@/lib/options";
import { MODELS, anthropicKeyPresent, extractJSON, getAnthropic } from "@/lib/anthropic/client";

export const runtime = "nodejs";

const CONDITIONS = CONDITION_OPTIONS.map((c) => c.key);
const EVENTS = EVENT_OPTIONS.map((e) => e.key);
const TIERS = DRUG_TIER_OPTIONS.map((t) => t.key);
const STATES = SUPPORTED_STATES.map((s) => s.code);

function systemPrompt(): string {
  const condList = CONDITION_OPTIONS.map((c) => `${c.key} (${c.label})`).join(", ");
  const eventList = EVENT_OPTIONS.map((e) => `${e.key} (${e.label})`).join(", ");
  return [
    "You convert a person's free-text description of their health and finances into a JSON profile for a health-insurance optimizer.",
    "Return ONLY a JSON object. Include a key only when the text clearly implies it; omit everything else. Never invent values.",
    "",
    "Keys:",
    "- age (integer), sex ('male'|'female'), state (one of " + STATES.join(", ") + ")",
    "- householdSize (integer), annualIncome (integer dollars), tobacco (boolean)",
    "- conditions: array of any of: " + condList,
    "- plannedEvents: array of any of: " + eventList,
    "- prescriptions: array of { name (string), tier ('genericDrugs'|'preferredBrandDrugs'|'nonPreferredBrandDrugs'|'specialtyDrugs'), fillsPerYear (12 for a daily/maintenance med, else 1-4) }",
    "- providers: array of doctor/hospital names",
    "- riskTolerance: 'low' (wants protection from a bad year), 'medium', or 'high' (wants lowest expected cost)",
    "",
    "Map drugs to a tier by your best knowledge (e.g. insulin -> preferredBrandDrugs, a biologic -> specialtyDrugs, metformin -> genericDrugs).",
  ].join("\n");
}

type Patch = Partial<PatientProfile>;

function sanitize(raw: Record<string, unknown>): Patch {
  const out: Patch = {};
  if (typeof raw.age === "number") out.age = Math.max(0, Math.min(120, Math.round(raw.age)));
  if (raw.sex === "male" || raw.sex === "female") out.sex = raw.sex;
  if (typeof raw.state === "string" && STATES.includes(raw.state.toUpperCase()))
    out.state = raw.state.toUpperCase();
  if (typeof raw.householdSize === "number")
    out.householdSize = Math.max(1, Math.round(raw.householdSize));
  if (typeof raw.annualIncome === "number")
    out.annualIncome = Math.max(0, Math.round(raw.annualIncome));
  if (typeof raw.tobacco === "boolean") out.tobacco = raw.tobacco;
  if (Array.isArray(raw.conditions))
    out.conditions = raw.conditions.filter((c): c is ConditionKey =>
      CONDITIONS.includes(c as ConditionKey),
    );
  if (Array.isArray(raw.plannedEvents))
    out.plannedEvents = raw.plannedEvents.filter((e): e is PlannedEventKey =>
      EVENTS.includes(e as PlannedEventKey),
    );
  if (Array.isArray(raw.providers))
    out.providers = raw.providers.filter((p): p is string => typeof p === "string");
  if (raw.riskTolerance === "low" || raw.riskTolerance === "medium" || raw.riskTolerance === "high")
    out.riskTolerance = raw.riskTolerance;
  if (Array.isArray(raw.prescriptions)) {
    out.prescriptions = raw.prescriptions
      .map((p) => p as Record<string, unknown>)
      .filter((p) => typeof p?.name === "string" && TIERS.includes(p?.tier as DrugTier))
      .map((p) => ({
        name: String(p.name),
        tier: p.tier as DrugTier,
        fillsPerYear:
          typeof p.fillsPerYear === "number" ? Math.max(1, Math.round(p.fillsPerYear)) : 12,
      }));
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!anthropicKeyPresent()) {
    return Response.json(
      { error: "The assistant needs an ANTHROPIC_API_KEY to be configured." },
      { status: 503 },
    );
  }
  let text = "";
  try {
    text = String((await req.json()).text ?? "");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!text.trim()) return Response.json({ patch: {} });

  try {
    const msg = await getAnthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 800,
      system: systemPrompt(),
      messages: [{ role: "user", content: text }],
    });
    const out = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = extractJSON<Record<string, unknown>>(out);
    return Response.json({ patch: parsed ? sanitize(parsed) : {} });
  } catch (e) {
    const status = e instanceof Error && "status" in e ? (e as { status: number }).status : 500;
    return Response.json(
      { error: "Could not read that. Try the form, or rephrase." },
      { status: status === 401 ? 503 : 500 },
    );
  }
}
