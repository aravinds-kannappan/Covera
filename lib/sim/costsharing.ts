import type { Plan, ServiceCostShare, ServiceKey } from "@/lib/types";
import type { Scenario } from "@/lib/sim/utilization";

export interface Adjudication {
  oop: number;
  byService: Partial<Record<ServiceKey, number>>;
  hitOopMax: boolean;
}

// When a plan is missing a benefit row, fall back to a metal-typical coinsurance.
const FALLBACK_COINS: Record<string, number> = {
  Bronze: 0.4,
  "Expanded Bronze": 0.4,
  Silver: 0.3,
  Gold: 0.2,
  Platinum: 0.1,
  Catastrophic: 0.45,
};

function shareFor(plan: Plan, service: ServiceKey): ServiceCostShare {
  return (
    plan.costShares[service] ?? {
      copay: null,
      coinsurance: FALLBACK_COINS[plan.metal] ?? 0.3,
      afterDeductible: true,
      noCharge: false,
    }
  );
}

function sum(arr: number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

/**
 * Lean path: member out-of-pocket only (no attribution). Used for the coarse
 * pass over every plan. Deductible is allocated proportionally across the
 * deductible-subject services, which avoids a per-event sort.
 */
export function adjudicateOOP(plan: Plan, scn: Scenario): number {
  let oop = 0;
  let dedSubjectTotal = 0;

  for (const key in scn.byService) {
    const service = key as ServiceKey;
    const amounts = scn.byService[service]!;
    const cs = shareFor(plan, service);
    if (cs.afterDeductible) {
      dedSubjectTotal += sum(amounts);
    } else if (!cs.noCharge) {
      if (cs.copay != null) {
        for (let i = 0; i < amounts.length; i++)
          oop += Math.min(cs.copay, amounts[i]);
      } else if (cs.coinsurance != null) {
        oop += cs.coinsurance * sum(amounts);
      }
    }
  }

  const aboveDed = Math.max(0, dedSubjectTotal - plan.deductible);
  const fracAbove = dedSubjectTotal > 0 ? aboveDed / dedSubjectTotal : 0;

  for (const key in scn.byService) {
    const service = key as ServiceKey;
    const cs = shareFor(plan, service);
    if (!cs.afterDeductible) continue;
    const amounts = scn.byService[service]!;
    const svcSum = sum(amounts);
    const svcAbove = svcSum * fracAbove;
    let pay = svcSum - svcAbove; // deductible portion paid at 100%
    if (cs.noCharge) {
      /* nothing beyond the deductible */
    } else if (cs.coinsurance != null) {
      pay += cs.coinsurance * svcAbove;
    } else if (cs.copay != null) {
      pay += cs.copay * amounts.length * fracAbove;
    }
    oop += pay;
    if (oop >= plan.oopMax) return plan.oopMax;
  }

  return Math.min(oop, plan.oopMax);
}

/** Full path: member OOP plus per-service attribution. Used for displayed plans. */
export function adjudicate(plan: Plan, scn: Scenario): Adjudication {
  const byService: Partial<Record<ServiceKey, number>> = {};
  let oop = 0;
  let dedSubjectTotal = 0;

  for (const key in scn.byService) {
    const service = key as ServiceKey;
    const amounts = scn.byService[service]!;
    const cs = shareFor(plan, service);
    if (cs.afterDeductible) {
      dedSubjectTotal += sum(amounts);
    } else if (!cs.noCharge) {
      let add = 0;
      if (cs.copay != null)
        for (let i = 0; i < amounts.length; i++) add += Math.min(cs.copay, amounts[i]);
      else if (cs.coinsurance != null) add += cs.coinsurance * sum(amounts);
      if (add > 0) {
        byService[service] = (byService[service] ?? 0) + add;
        oop += add;
      }
    }
  }

  const aboveDed = Math.max(0, dedSubjectTotal - plan.deductible);
  const fracAbove = dedSubjectTotal > 0 ? aboveDed / dedSubjectTotal : 0;

  for (const key in scn.byService) {
    const service = key as ServiceKey;
    const cs = shareFor(plan, service);
    if (!cs.afterDeductible) continue;
    const amounts = scn.byService[service]!;
    const svcSum = sum(amounts);
    const svcAbove = svcSum * fracAbove;
    let pay = svcSum - svcAbove;
    if (cs.noCharge) {
      /* free after deductible */
    } else if (cs.coinsurance != null) {
      pay += cs.coinsurance * svcAbove;
    } else if (cs.copay != null) {
      pay += cs.copay * amounts.length * fracAbove;
    }
    byService[service] = (byService[service] ?? 0) + pay;
    oop += pay;
  }

  let hitOopMax = false;
  if (oop >= plan.oopMax) {
    const scale = oop > 0 ? plan.oopMax / oop : 0;
    for (const k in byService) byService[k as ServiceKey]! *= scale;
    oop = plan.oopMax;
    hitOopMax = true;
  }
  return { oop, byService, hitOopMax };
}
