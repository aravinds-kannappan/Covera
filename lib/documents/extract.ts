import type { DrugTier, ServiceKey } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { MODELS, anthropicKeyPresent, extractJSON, getAnthropic } from "@/lib/anthropic/client";
import type {
  DocumentKind,
  DocumentLineItem,
  DocumentParse,
  ExtractedDocument,
  ExtractedPrescription,
} from "@/lib/documents/types";

// Document extraction.
//
// `DocumentExtractor` is the swap point: today it is one LLM pass over already-extracted text
// (a future PDF/OCR front end would produce that text). The extractor is HONEST about what it
// is: every parse records its method and a confidence, and unreadable fields become warnings
// rather than silent guesses. Downstream code (apply-to-sim, bill audit, appeals) consumes the
// structured result and never the raw document, so a better parser can be dropped in later.

export interface DocumentExtractor {
  extract(kind: DocumentKind, text: string): Promise<DocumentParse>;
}

export const SCHEMA_HINT: Record<DocumentKind, string> = {
  eob: `{ "issuer"?, "planName"?, "memberId"?, "claimNumber"?, "serviceStart"?, "serviceEnd"?, "deductibleMetToDate"?: number, "oopMetToDate"?: number, "lines": [ { "description", "serviceKey"?, "cptOrHcpcs"?, "dateOfService"?, "billed"?: number, "allowed"?: number, "planPaid"?: number, "memberResponsibility"?: number, "denied"?: boolean, "denialReason"? } ] }`,
  medicalBill: `{ "provider"?, "serviceDate"?, "totalBilled"?: number, "lines": [ { "description", "serviceKey"?, "cptOrHcpcs"?, "billed"?: number, "allowed"?: number, "memberResponsibility"?: number } ] }`,
  employerPlan: `{ "issuer"?, "planName"?, "metal"?, "employeeMonthlyPremium"?: number, "deductible"?: number, "oopMax"?: number, "coinsurance"?: number (0..1), "hsaEligible"?: boolean, "copays"?: { serviceKey: number } }`,
  prescriptionList: `{ "prescriptions": [ { "name", "tier"?: 'genericDrugs'|'preferredBrandDrugs'|'nonPreferredBrandDrugs'|'specialtyDrugs', "fillsPerYear"?: number } ] }`,
  claimHistory: `{ "planYear"?: number, "deductibleMetToDate"?: number, "oopMetToDate"?: number, "lines": [ { "description", "serviceKey"?, "billed"?: number, "allowed"?: number, "memberResponsibility"?: number, "dateOfService"? } ] }`,
};

function systemPrompt(kind: DocumentKind): string {
  return [
    `You extract structured data from a health-insurance ${kind} document.`,
    "Return ONLY a JSON object matching this shape (omit any field you cannot read; never invent values):",
    SCHEMA_HINT[kind],
    `serviceKey, when used, must be one of: ${SERVICE_KEYS.join(", ")}.`,
    "All money values are plain numbers (no $ or commas). Dates as ISO strings when present.",
    "If a value is illegible or absent, omit it. Do not guess member IDs, claim numbers, or amounts.",
  ].join("\n");
}

const SET = new Set<string>(SERVICE_KEYS);
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, "")); // tolerate "$1,200" style strings
    return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
  }
  return undefined;
}
function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

function sanitizeLine(raw: unknown): DocumentLineItem | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const description = str(o.description);
  if (!description) return null;
  const serviceKey = typeof o.serviceKey === "string" && SET.has(o.serviceKey)
    ? (o.serviceKey as DocumentLineItem["serviceKey"])
    : undefined;
  return {
    description,
    serviceKey,
    cptOrHcpcs: str(o.cptOrHcpcs),
    dateOfService: str(o.dateOfService),
    billed: num(o.billed),
    allowed: num(o.allowed),
    planPaid: num(o.planPaid),
    memberResponsibility: num(o.memberResponsibility),
    denied: o.denied === true,
    denialReason: str(o.denialReason),
  };
}

/** Coerce a raw model object into a valid ExtractedDocument, collecting warnings. */
export function sanitizeExtracted(
  kind: DocumentKind,
  raw: Record<string, unknown>,
  warnings: string[],
): ExtractedDocument {
  const lines = Array.isArray(raw.lines)
    ? (raw.lines.map(sanitizeLine).filter(Boolean) as DocumentLineItem[])
    : [];
  switch (kind) {
    case "eob":
      if (lines.length === 0) warnings.push("No line items could be read from this EOB.");
      return {
        kind, lines,
        issuer: str(raw.issuer), planName: str(raw.planName), memberId: str(raw.memberId),
        claimNumber: str(raw.claimNumber), serviceStart: str(raw.serviceStart), serviceEnd: str(raw.serviceEnd),
        deductibleMetToDate: num(raw.deductibleMetToDate), oopMetToDate: num(raw.oopMetToDate),
      };
    case "medicalBill":
      if (lines.length === 0) warnings.push("No line items could be read from this bill.");
      return { kind, lines, provider: str(raw.provider), serviceDate: str(raw.serviceDate), totalBilled: num(raw.totalBilled) };
    case "employerPlan": {
      const copaysRaw = (raw.copays ?? {}) as Record<string, unknown>;
      const copays: Partial<Record<ServiceKey, number>> = {};
      for (const k in copaysRaw) {
        const v = num(copaysRaw[k]);
        if (SET.has(k) && v != null) copays[k as ServiceKey] = v;
      }
      return {
        kind,
        issuer: str(raw.issuer),
        planName: str(raw.planName),
        metal: str(raw.metal),
        employeeMonthlyPremium: num(raw.employeeMonthlyPremium),
        deductible: num(raw.deductible),
        oopMax: num(raw.oopMax),
        coinsurance: num(raw.coinsurance),
        hsaEligible: raw.hsaEligible === true,
        copays: Object.keys(copays).length ? copays : undefined,
      };
    }
    case "prescriptionList": {
      const rxRaw = Array.isArray(raw.prescriptions) ? raw.prescriptions : [];
      const tiers = new Set<DrugTier>([
        "genericDrugs",
        "preferredBrandDrugs",
        "nonPreferredBrandDrugs",
        "specialtyDrugs",
      ]);
      const prescriptions: ExtractedPrescription[] = [];
      for (const r of rxRaw) {
        const o = (r ?? {}) as Record<string, unknown>;
        const name = str(o.name);
        if (!name) continue;
        const tier = typeof o.tier === "string" && tiers.has(o.tier as DrugTier) ? (o.tier as DrugTier) : undefined;
        prescriptions.push({ name, tier, fillsPerYear: num(o.fillsPerYear) });
      }
      if (prescriptions.length === 0) warnings.push("No prescriptions could be read.");
      return { kind, prescriptions };
    }
    case "claimHistory":
      return {
        kind, lines, planYear: num(raw.planYear),
        deductibleMetToDate: num(raw.deductibleMetToDate), oopMetToDate: num(raw.oopMetToDate),
      };
  }
}

/** The default extractor: one LLM pass, clearly labeled, with a graceful no-key fallback. */
export class LLMDocumentExtractor implements DocumentExtractor {
  async extract(kind: DocumentKind, text: string): Promise<DocumentParse> {
    const warnings: string[] = [];
    if (!text.trim()) {
      return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0, method: "empty input", warnings: ["No document text provided."] };
    }
    if (!anthropicKeyPresent()) {
      warnings.push("No extractor configured (ANTHROPIC_API_KEY missing): returning an empty structured result.");
      return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0, method: "unconfigured", warnings };
    }
    const method = `LLM extraction (${MODELS.fast})`;
    try {
      const msg = await getAnthropic().messages.create({
        model: MODELS.fast,
        max_tokens: 2048,
        system: systemPrompt(kind),
        messages: [{ role: "user", content: text.slice(0, 20000) }],
      });
      const textOut = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
      const raw = extractJSON<Record<string, unknown>>(textOut);
      if (!raw) {
        warnings.push("The document could not be parsed into structured fields.");
        return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0.1, method, warnings };
      }
      const data = sanitizeExtracted(kind, raw, warnings);
      // Confidence: heuristic on how much structured content came back.
      const filled = "lines" in data ? data.lines.length : "prescriptions" in data ? data.prescriptions.length : 5;
      const confidence = Math.max(0.2, Math.min(0.9, filled === 0 ? 0.2 : 0.6 + Math.min(0.3, filled * 0.05)));
      return { kind, data, confidence, method, warnings };
    } catch {
      warnings.push("Extraction failed; try re-uploading or use the manual form.");
      return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0, method, warnings };
    }
  }
}

export const documentExtractor: DocumentExtractor = new LLMDocumentExtractor();
