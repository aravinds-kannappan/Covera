import type { Plan, ServiceKey, SimSummary } from "@/lib/types";
import type { Scenario } from "@/lib/sim/utilization";
import { adjudicate, adjudicateOOP } from "@/lib/sim/costsharing";
import {
  antitheticGain,
  cvar,
  meanStdErr,
  quantileStdErr,
} from "@/lib/sim/estimators";

/** Mean member OOP across scenarios (coarse pass: fast, no attribution). */
export function meanOOP(plan: Plan, scenarios: Scenario[]): number {
  let s = 0;
  for (let i = 0; i < scenarios.length; i++) s += adjudicateOOP(plan, scenarios[i]);
  return s / scenarios.length;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[i];
}

/** Full distribution + risk metrics for one plan (fine pass). */
export function summarize(
  plan: Plan,
  scenarios: Scenario[],
  premium: { annualNet: number; annualGross: number; subsidyAnnual: number },
): SimSummary {
  const n = scenarios.length;
  const totals = new Array<number>(n);
  const svcAcc: Partial<Record<ServiceKey, number>> = {};
  let oopSum = 0;
  let hit = 0;

  for (let i = 0; i < n; i++) {
    const adj = adjudicate(plan, scenarios[i]);
    if (adj.hitOopMax) hit++;
    oopSum += adj.oop;
    for (const k in adj.byService) {
      const key = k as ServiceKey;
      svcAcc[key] = (svcAcc[key] ?? 0) + adj.byService[key]!;
    }
    totals[i] = premium.annualNet + adj.oop;
  }

  const sorted = [...totals].sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (totals[i] - mean) ** 2;
  variance /= n;

  const oopByService: Partial<Record<ServiceKey, number>> = {};
  for (const k in svcAcc) oopByService[k as ServiceKey] = svcAcc[k as ServiceKey]! / n;

  // Tail risk + estimator precision. `totals` keeps the antithetic pair layout (2j, 2j+1)
  // so the variance-reduction ratio is measured, not assumed; `sorted` feeds the coherent
  // tail metrics and the quantile error bar.
  const gain = antitheticGain(totals);

  // Histogram over ~28 bins for the distribution chart.
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const bins = 28;
  const width = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, b) => ({
    bin: Math.round(lo + (b + 0.5) * width),
    count: 0,
  }));
  for (const t of totals) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((t - lo) / width)));
    histogram[b].count++;
  }

  return {
    planId: plan.id,
    annualPremium: Math.round(premium.annualNet),
    annualPremiumGross: Math.round(premium.annualGross),
    subsidy: Math.round(premium.subsidyAnnual),
    expectedOOP: Math.round(oopSum / n),
    expectedTotal: Math.round(mean),
    median: Math.round(percentile(sorted, 0.5)),
    p10: Math.round(percentile(sorted, 0.1)),
    p90: Math.round(percentile(sorted, 0.9)),
    stdev: Math.round(Math.sqrt(variance)),
    probHitOOPMax: hit / n,
    maxTotal: Math.round(sorted[sorted.length - 1]),
    histogram,
    oopByService,
    cvar90: Math.round(cvar(sorted, 0.1)),
    cvar95: Math.round(cvar(sorted, 0.05)),
    meanStdErr: Math.round(meanStdErr(totals)),
    p90StdErr: Math.round(quantileStdErr(sorted, 0.9)),
    varianceReductionRatio: Number(gain.ratio.toFixed(2)),
    effectiveSampleSize: Math.round(gain.effectiveSampleSize),
  };
}
