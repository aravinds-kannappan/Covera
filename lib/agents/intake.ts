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
import { MODELS, extractJSON, getAnthropic } from "@/lib/anthropic/client";

// The Intake sub-agent. A fast, cheap model (haiku) turns a patient's free-text message
// into a structured, validated profile patch. The orchestrator delegates here so the
// expensive reasoning model never has to do brittle field extraction, and so the
// in-app extractor and the texting agent share one implementation.

const CONDITIONS = CONDITION_OPTIONS.map((c) => c.key);
const EVENTS = EVENT_OPTIONS.map((e) => e.key);
const TIERS = DRUG_TIER_OPTIONS.map((t) => t.key);
const STATES = SUPPORTED_STATES.map((s) => s.code);

export type ProfilePatch = Partial<PatientProfile>;

export function intakeSystemPrompt(): string {
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

/** Coerce a raw model object into a safe profile patch (enums, ranges, shapes). */
export function sanitizeProfilePatch(raw: Record<string, unknown>): ProfilePatch {
  const out: ProfilePatch = {};
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

/** Run the intake sub-agent on a free-text message. Returns a validated patch. */
export async function extractProfilePatch(text: string): Promise<ProfilePatch> {
  if (!text.trim()) return {};
  const msg = await getAnthropic().messages.create({
    model: MODELS.fast,
    max_tokens: 800,
    system: intakeSystemPrompt(),
    messages: [{ role: "user", content: text }],
  });
  const out = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = extractJSON<Record<string, unknown>>(out);
  return parsed ? sanitizeProfilePatch(parsed) : {};
}

const FIELD_LABELS: Record<string, (p: PatientProfile) => string | null> = {
  age: (p) => (p.age ? `age ${p.age}` : null),
  state: (p) => {
    const s = SUPPORTED_STATES.find((x) => x.code === p.state);
    return s ? s.name : null;
  },
  annualIncome: (p) => (p.annualIncome ? `$${p.annualIncome.toLocaleString()} income` : null),
  householdSize: (p) => (p.householdSize ? `household of ${p.householdSize}` : null),
  conditions: (p) =>
    p.conditions.length
      ? p.conditions
          .map((c) => CONDITION_OPTIONS.find((o) => o.key === c)?.label ?? c)
          .join(", ")
      : null,
  plannedEvents: (p) =>
    p.plannedEvents.length
      ? p.plannedEvents.map((e) => EVENT_OPTIONS.find((o) => o.key === e)?.label ?? e).join(", ")
      : null,
  prescriptions: (p) => (p.prescriptions.length ? `${p.prescriptions.length} medication(s)` : null),
  riskTolerance: (p) => (p.riskTolerance ? `${p.riskTolerance} risk` : null),
};

/** Summarize which profile fields are captured vs. still useful to ask for. */
export function describeProfile(profile: Partial<PatientProfile>): {
  filled: string[];
  missing: string[];
} {
  const p = profile as PatientProfile;
  const filled: string[] = [];
  for (const fn of Object.values(FIELD_LABELS)) {
    const label = fn(p);
    if (label) filled.push(label);
  }
  const missing: string[] = [];
  if (!p.conditions?.length) missing.push("any health conditions");
  if (!p.prescriptions?.length) missing.push("medications you take");
  if (!p.annualIncome) missing.push("rough household income (for subsidy math)");
  return { filled, missing };
}
