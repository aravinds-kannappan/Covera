import type {
  DrugTier,
  PatientProfile,
  Plan,
  ServiceCostShare,
  ServiceKey,
} from "@/lib/types";
import { CONDITION_OPTIONS } from "@/lib/options";
import type { ProcedurePrice } from "@/lib/sim/params";

/** A portable, patient-owned coverage summary. The whole card lives in the URL. */
export interface CoverageCard {
  v: 1;
  name: string;
  state: string;
  age: number;
  issued: string;
  plan: {
    id: string;
    name: string;
    issuer: string;
    metal: string;
    planType: string;
    deductible: number;
    oopMax: number;
    hsa: boolean;
    premiumMonthly: number;
    costShares: Partial<Record<ServiceKey, ServiceCostShare>>;
  };
  conditions: string[];
  meds: { name: string; tier: DrugTier }[];
}

export function buildCard(
  profile: PatientProfile,
  plan: Plan,
  premiumMonthly: number,
  name: string,
): CoverageCard {
  const condLabel = (k: string) =>
    CONDITION_OPTIONS.find((c) => c.key === k)?.label ?? k;
  return {
    v: 1,
    name: name.trim() || "Member",
    state: profile.state,
    age: profile.age,
    issued: new Date().toISOString().slice(0, 10),
    plan: {
      id: plan.id,
      name: plan.marketingName,
      issuer: plan.issuer,
      metal: plan.metal,
      planType: plan.planType,
      deductible: plan.deductible,
      oopMax: plan.oopMax,
      hsa: plan.hsaEligible,
      premiumMonthly: Math.round(premiumMonthly),
      costShares: plan.costShares,
    },
    conditions: profile.conditions.map(condLabel),
    meds: profile.prescriptions.map((p) => ({ name: p.name, tier: p.tier })),
  };
}

// --- URL-safe encoding (payload travels in the link's hash; never sent to a server) ---

export function encodeCard(card: CoverageCard): string {
  const json = JSON.stringify(card);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCard(token: string): CoverageCard | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob !== "undefined"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf-8");
    const card = JSON.parse(json);
    return card?.v === 1 ? (card as CoverageCard) : null;
  } catch {
    return null;
  }
}

export interface ProcedureEstimate {
  beforeDeductible: number;
  afterDeductible: number;
}

/** The minimal plan fields needed to adjudicate a single procedure. */
export type PlanCostBasis = {
  deductible: number;
  oopMax: number;
  costShares: Partial<Record<ServiceKey, ServiceCostShare>>;
};

/** Estimate a member's point-of-care cost for a procedure under their plan rules. */
export function estimateProcedure(
  plan: PlanCostBasis,
  proc: ProcedurePrice,
): ProcedureEstimate {
  const cs = plan.costShares[proc.serviceKey];
  const allowed = proc.typicalAllowed;
  const cap = plan.oopMax;

  const before = (() => {
    if (!cs) return Math.min(allowed * 0.3, cap);
    if (!cs.afterDeductible) {
      if (cs.noCharge) return 0;
      if (cs.copay != null) return Math.min(cs.copay, allowed);
      if (cs.coinsurance != null) return cs.coinsurance * allowed;
      return 0;
    }
    // Subject to deductible: pay toward deductible, then post-deductible share.
    const toDed = Math.min(allowed, plan.deductible);
    const rem = allowed - toDed;
    let pay = toDed;
    if (rem > 0 && !cs.noCharge) {
      if (cs.coinsurance != null) pay += cs.coinsurance * rem;
      else if (cs.copay != null) pay += cs.copay;
    }
    return Math.min(pay, cap);
  })();

  const after = (() => {
    if (!cs) return Math.min(allowed * 0.2, cap);
    if (cs.noCharge) return 0;
    if (cs.copay != null) return Math.min(cs.copay, cap);
    if (cs.coinsurance != null) return Math.min(cs.coinsurance * allowed, cap);
    return 0;
  })();

  return { beforeDeductible: Math.round(before), afterDeductible: Math.round(after) };
}
