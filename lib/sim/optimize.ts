import type {
  Plan,
  PatientProfile,
  RankedPlan,
  ServiceKey,
} from "@/lib/types";
import { ageBandKey, MEPS } from "@/lib/sim/params";
import { hashSeed, makeRng } from "@/lib/sim/random";
import { buildUtilization, sampleScenarios } from "@/lib/sim/utilization";
import { summarize } from "@/lib/sim/montecarlo";
import { buildSpendGrid, analyticMeanOOP } from "@/lib/sim/analytic";
import {
  computeSubsidy,
  netPremium,
  pickPremium,
  type SubsidyResult,
} from "@/lib/sim/subsidy";

const RISK_LAMBDA: Record<PatientProfile["riskTolerance"], number> = {
  low: 0.6, // risk-averse: penalize bad-year exposure heavily
  medium: 0.3,
  high: 0.1, // risk-tolerant: chase expected cost
};

export interface FrontierPoint {
  planId: string;
  expectedTotal: number;
  risk: number;
  onFrontier: boolean;
}

export interface OptimizeResult {
  ranked: RankedPlan[];
  subsidy: SubsidyResult;
  riskLambda: number;
  consideredCount: number;
  scenarioCount: number;
  frontier: FrontierPoint[];
  drivers: { service: ServiceKey; oop: number }[];
  spendVsAverage: { simulatedMean: number; mepsAverage: number; ageBand: string };
}

export interface OptimizeOptions {
  nCoarse?: number;
  nFine?: number;
  topK?: number;
}

function profileSeed(p: PatientProfile): number {
  return hashSeed(
    JSON.stringify({
      a: p.age,
      s: p.sex,
      c: [...p.conditions].sort(),
      e: [...p.plannedEvents].sort(),
      m: p.prescriptions.map((x) => x.name).sort(),
      st: p.state,
    }),
  );
}

export function optimize(
  profile: PatientProfile,
  allPlans: Plan[],
  opts: OptimizeOptions = {},
): OptimizeResult {
  const nCoarse = opts.nCoarse ?? 500;
  const nFine = opts.nFine ?? 4000;
  const topK = opts.topK ?? 24;

  // Hard constraints: HSA requirement, and catastrophic eligibility (age < 30).
  let plans = allPlans.filter(
    (p) => p.metal !== "Catastrophic" || profile.age < 30,
  );
  if (profile.requireHsa) plans = plans.filter((p) => p.hsaEligible);
  if (plans.length === 0) plans = allPlans;

  const subsidy = computeSubsidy(profile, allPlans);
  const model = buildUtilization(profile);
  const rng = makeRng(profileSeed(profile));

  // --- Coarse pass: rank every plan by expected total cost ---
  // One shared spend distribution, evaluated against every plan in closed form (no
  // per-plan resampling). This shortlists; the Monte-Carlo fine pass below is still exact.
  const coarse = sampleScenarios(rng, model, nCoarse);
  const spendGrid = buildSpendGrid(coarse);
  const coarseScore = new Map<string, number>();
  for (const p of plans) {
    const annualNet = netPremium(p, profile.age, subsidy.aptcMonthly) * 12;
    coarseScore.set(p.id, annualNet + analyticMeanOOP(p, spendGrid));
  }
  const sortedByCoarse = [...plans].sort(
    (a, b) => coarseScore.get(a.id)! - coarseScore.get(b.id)!,
  );

  // Keep the best K, but guarantee the best plan of each metal for diversity.
  const chosen = new Map<string, Plan>();
  for (const p of sortedByCoarse.slice(0, topK)) chosen.set(p.id, p);
  const bestByMetal = new Map<string, Plan>();
  for (const p of sortedByCoarse)
    if (!bestByMetal.has(p.metal)) bestByMetal.set(p.metal, p);
  for (const p of bestByMetal.values()) chosen.set(p.id, p);

  // --- Fine pass: full distribution for the shortlist (common random numbers) ---
  const fine = sampleScenarios(rng, model, nFine);
  let meanAllowed = 0;
  for (const s of fine) meanAllowed += s.totalAllowed;
  meanAllowed /= fine.length;

  const lambda = RISK_LAMBDA[profile.riskTolerance];
  const ranked: RankedPlan[] = [];
  for (const plan of chosen.values()) {
    const annualGross = pickPremium(plan, profile.age) * 12;
    const annualNet = netPremium(plan, profile.age, subsidy.aptcMonthly) * 12;
    const sim = summarize(plan, fine, {
      annualNet,
      annualGross,
      subsidyAnnual: annualGross - annualNet,
    });
    const downside = Math.max(0, sim.p90 - sim.expectedTotal);
    const score = sim.expectedTotal + lambda * downside;
    ranked.push({
      plan,
      sim,
      score,
      constraints: {
        coversAllDrugs: true,
        hsaOk: !profile.requireHsa || plan.hsaEligible,
      },
    });
  }
  ranked.sort((a, b) => a.score - b.score);

  // Pareto frontier: expected cost (x) vs bad-year risk = p90 (y).
  const frontier: FrontierPoint[] = ranked.map((r) => ({
    planId: r.plan.id,
    expectedTotal: r.sim.expectedTotal,
    risk: r.sim.p90,
    onFrontier: false,
  }));
  for (const a of frontier) {
    a.onFrontier = !frontier.some(
      (b) =>
        b !== a &&
        b.expectedTotal <= a.expectedTotal &&
        b.risk <= a.risk &&
        (b.expectedTotal < a.expectedTotal || b.risk < a.risk),
    );
  }

  // Cost drivers for the recommended plan.
  const top = ranked[0];
  const drivers = top
    ? Object.entries(top.sim.oopByService)
        .map(([service, oop]) => ({ service: service as ServiceKey, oop: oop! }))
        .sort((a, b) => b.oop - a.oop)
        .slice(0, 6)
    : [];

  return {
    ranked,
    subsidy,
    riskLambda: lambda,
    consideredCount: plans.length,
    scenarioCount: nFine,
    frontier,
    drivers,
    spendVsAverage: {
      simulatedMean: Math.round(meanAllowed),
      mepsAverage:
        MEPS.ageBands.find((b) => b.key === ageBandKey(profile.age))
          ?.meanAnnualSpend ?? 0,
      ageBand: ageBandKey(profile.age),
    },
  };
}
