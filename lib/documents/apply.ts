import type { Metal, PatientProfile, Plan, ServiceCostShare, ServiceKey } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { auditBill, type BillAudit, type BillLine } from "@/lib/sim/billaudit";
import type {
  DocumentLineItem,
  ExtractedBill,
  ExtractedDocument,
  ExtractedEmployerPlan,
  ExtractedEOB,
  ExtractedPrescriptionList,
} from "@/lib/documents/types";

// Where uploads meet the simulation. Structured facts from a user's own paperwork are strictly
// better than national assumptions, so this module maps them into the exact shapes the engine
// already consumes: prescriptions into the profile, an employer plan into a real Plan the cost
// engine can adjudicate, bill/EOB lines into the audit, and denied lines into appeal
// candidates. Nothing here invents data: absent fields stay absent.

/** Merge extracted prescriptions into the profile (patient-listed drugs win, deduped by name). */
export function mergePrescriptions(
  profile: PatientProfile,
  list: ExtractedPrescriptionList,
): { profile: PatientProfile; added: string[] } {
  const byName = new Map(profile.prescriptions.map((p) => [p.name.toLowerCase(), p]));
  const added: string[] = [];
  for (const rx of list.prescriptions) {
    const key = rx.name.toLowerCase();
    if (!byName.has(key)) added.push(rx.name);
    byName.set(key, {
      name: rx.name,
      tier: rx.tier ?? byName.get(key)?.tier ?? "genericDrugs",
      fillsPerYear: rx.fillsPerYear ?? byName.get(key)?.fillsPerYear ?? 12,
    });
  }
  return { profile: { ...profile, prescriptions: [...byName.values()] }, added };
}

/**
 * Turn an extracted employer plan into a real Plan the cost engine can score. Employer plans
 * are not age-rated or subsidy-eligible, so the premium is stored as a single fixed monthly
 * cost to the employee (not a healthcare.gov rate); callers should simulate it directly rather
 * than push it through the ACA subsidy path. Returns null if the core cost-sharing is missing.
 */
export function employerPlanToPlan(e: ExtractedEmployerPlan, state = ""): Plan | null {
  if (e.deductible == null || e.oopMax == null) return null;
  const coins = e.coinsurance ?? 0.2;
  const costShares: Partial<Record<ServiceKey, ServiceCostShare>> = {};
  for (const k of SERVICE_KEYS) {
    const copay = e.copays?.[k];
    costShares[k] =
      copay != null
        ? { copay, coinsurance: null, afterDeductible: false, noCharge: false }
        : { copay: null, coinsurance: coins, afterDeductible: true, noCharge: false };
  }
  const monthly = e.employeeMonthlyPremium ?? 0;
  return {
    id: "EMPLOYER",
    state,
    issuer: e.issuer ?? "Employer plan",
    marketingName: e.planName ?? "Your employer plan",
    planType: "PPO",
    metal: (isMetal(e.metal) ? e.metal : "Silver") as Metal,
    hsaEligible: e.hsaEligible ?? false,
    actuarialValue: null,
    deductible: e.deductible,
    drugDeductible: null,
    integratedMedicalDrugDeductible: true,
    oopMax: e.oopMax,
    // A flat employee premium at every rate-age bucket: employer plans are not age-rated.
    premiumByAge: { "0-20": monthly, "21": monthly, "40": monthly, "64 and over": monthly },
    costShares,
  };
}

function isMetal(s: string | undefined): s is Metal {
  return (
    s === "Bronze" ||
    s === "Expanded Bronze" ||
    s === "Silver" ||
    s === "Gold" ||
    s === "Platinum" ||
    s === "Catastrophic"
  );
}

/** Map document lines to the bill auditor's input and run the deterministic audit. */
export function auditDocument(doc: ExtractedEOB | ExtractedBill): BillAudit {
  const lines: BillLine[] = doc.lines.map((l) => ({
    description: l.description,
    serviceKey: l.serviceKey,
    // Audit against submitted charges: prefer billed, fall back to allowed.
    billed: l.billed ?? l.allowed ?? 0,
  }));
  return auditBill(lines);
}

/** Denied lines on an EOB are appeal candidates. */
export function deniedLines(doc: ExtractedEOB): DocumentLineItem[] {
  return doc.lines.filter((l) => l.denied);
}

/** Any year-to-date accumulators an EOB or claim history exposes, to refine the estimate. */
export function extractedAccumulators(
  doc: ExtractedDocument,
): { deductibleMetToDate?: number; oopMetToDate?: number } | null {
  if (doc.kind === "eob" || doc.kind === "claimHistory") {
    if (doc.deductibleMetToDate != null || doc.oopMetToDate != null)
      return { deductibleMetToDate: doc.deductibleMetToDate, oopMetToDate: doc.oopMetToDate };
  }
  return null;
}
