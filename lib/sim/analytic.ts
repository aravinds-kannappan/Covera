import type { Plan } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import type { Scenario } from "@/lib/sim/utilization";

// Closed-form cost-sharing transform.
//
// Out-of-pocket cost is a monotone, piecewise-linear function of ONE number: a year's
// total allowed spend: you pay 100% up to the deductible, then a coinsurance slope, capped
// at the out-of-pocket max. So instead of re-adjudicating thousands of sampled years
// against every plan (the Monte-Carlo coarse pass), we build the patient's spend
// distribution ONCE and evaluate each plan's (deductible, coinsurance, oopMax) against it
// in closed form. This is the ranking proxy used to shortlist plans; the Monte-Carlo fine
// pass still produces the exact per-service distribution for the plans we actually show.

const FALLBACK_COINS: Record<string, number> = {
  Bronze: 0.4,
  "Expanded Bronze": 0.4,
  Silver: 0.3,
  Gold: 0.2,
  Platinum: 0.1,
  Catastrophic: 0.45,
};

/** A compact, plan-independent summary of one patient's annual-spend distribution. */
export interface SpendGrid {
  /** Representative total-allowed-spend levels (ascending), each equally weighted. */
  points: number[];
  mean: number;
}

/**
 * Compress a cloud of sampled years into an evenly-weighted quantile grid. A 64-point grid
 * is plenty for mean/percentile of a monotone transform and turns the coarse pass from
 * O(plans × scenarios × services) into O(plans × 64) scalar evaluations.
 */
export function buildSpendGrid(scenarios: Scenario[], bins = 64): SpendGrid {
  const totals = scenarios.map((s) => s.totalAllowed).sort((a, b) => a - b);
  const n = totals.length || 1;
  const points = new Array<number>(bins);
  for (let b = 0; b < bins; b++) {
    const q = (b + 0.5) / bins;
    points[b] = totals[Math.min(totals.length - 1, Math.floor(q * totals.length))] ?? 0;
  }
  const mean = totals.reduce((a, b) => a + b, 0) / n;
  return { points, mean };
}

/**
 * A single representative coinsurance for a plan: the mean of its real per-service
 * coinsurance rates, falling back to a metal-typical rate when a plan is copay-heavy or
 * sparse. This is the slope of the 1-D OOP function above the deductible.
 */
export function effectiveCoinsurance(plan: Plan): number {
  let sum = 0;
  let count = 0;
  for (const k of SERVICE_KEYS) {
    const cs = plan.costShares[k];
    if (cs?.coinsurance != null) {
      sum += cs.coinsurance;
      count++;
    }
  }
  if (count > 0) return sum / count;
  return FALLBACK_COINS[plan.metal] ?? 0.3;
}

/** Member OOP for one year of `spend`, in closed form. */
export function analyticOOP(
  spend: number,
  deductible: number,
  coinsurance: number,
  oopMax: number,
): number {
  if (spend <= 0) return 0;
  if (spend <= deductible) return Math.min(spend, oopMax);
  const oop = deductible + coinsurance * (spend - deductible);
  return Math.min(oop, oopMax);
}

/** Expected member OOP for a plan over a patient's spend grid: no per-plan sampling. */
export function analyticMeanOOP(plan: Plan, grid: SpendGrid): number {
  const coins = effectiveCoinsurance(plan);
  let s = 0;
  for (const x of grid.points) s += analyticOOP(x, plan.deductible, coins, plan.oopMax);
  return s / grid.points.length;
}

export interface AnalyticSummary {
  expectedOOP: number;
  p10: number;
  p50: number;
  p90: number;
  probHitOOPMax: number;
}

/**
 * Full closed-form risk summary for a plan. Because OOP is monotone in spend, the OOP
 * quantiles are just the spend quantiles transformed: so p90 cost is free, no resampling.
 */
export function analyticSummary(plan: Plan, grid: SpendGrid): AnalyticSummary {
  const coins = effectiveCoinsurance(plan);
  const oop = grid.points.map((x) =>
    analyticOOP(x, plan.deductible, coins, plan.oopMax),
  ); // ascending (monotone transform of ascending grid)
  const n = oop.length;
  const at = (q: number) => oop[Math.min(n - 1, Math.max(0, Math.floor(q * n)))];
  const hitThreshold = plan.oopMax - 1;
  const hit = oop.filter((v) => v >= hitThreshold).length / n;
  return {
    expectedOOP: oop.reduce((a, b) => a + b, 0) / n,
    p10: at(0.1),
    p50: at(0.5),
    p90: at(0.9),
    probHitOOPMax: hit,
  };
}
