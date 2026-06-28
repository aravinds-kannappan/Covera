import { describe, it, expect } from "vitest";
import txData from "@/data/plans.TX.json";
import type { Plan, PatientProfile } from "@/lib/types";
import { makeRng } from "@/lib/sim/random";
import { buildUtilization, sampleScenarios } from "@/lib/sim/utilization";
import { meanOOP } from "@/lib/sim/montecarlo";
import {
  analyticOOP,
  analyticMeanOOP,
  analyticSummary,
  buildSpendGrid,
} from "@/lib/sim/analytic";

const plans = (txData as { plans: Plan[] }).plans;

describe("closed-form OOP transform", () => {
  it("pays full cost below the deductible", () => {
    expect(analyticOOP(500, 1000, 0.2, 9000)).toBe(500);
  });
  it("applies coinsurance above the deductible", () => {
    // 1000 deductible at 100% + 20% of the remaining 10000 = 3000.
    expect(analyticOOP(11000, 1000, 0.2, 9000)).toBe(3000);
  });
  it("caps at the out-of-pocket maximum", () => {
    expect(analyticOOP(100000, 1000, 0.2, 5000)).toBe(5000);
  });
  it("is monotonic non-decreasing in spend", () => {
    let prev = -1;
    for (let s = 0; s <= 50000; s += 1000) {
      const oop = analyticOOP(s, 2000, 0.3, 8000);
      expect(oop).toBeGreaterThanOrEqual(prev);
      prev = oop;
    }
  });
});

// Spearman rank correlation — robust to the absolute differences (copays, per-service
// deductibles) the 1-D proxy intentionally smooths over. We only need the RANKING to
// agree, since the coarse pass just shortlists.
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const order = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], k) => (r[i] = k));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

describe("analytic engine vs Monte-Carlo coarse pass", () => {
  const profile: PatientProfile = {
    age: 52,
    sex: "male",
    state: "TX",
    householdSize: 1,
    annualIncome: 60000,
    tobacco: false,
    conditions: ["diabetesType2", "hypertension"],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };

  it("ranks real TX plans in close agreement with Monte-Carlo, far faster", () => {
    const model = buildUtilization(profile);
    const scenarios = sampleScenarios(makeRng(123), model, 1500);
    const grid = buildSpendGrid(scenarios);

    const t0 = Date.now();
    const analytic = plans.map((p) => analyticMeanOOP(p, grid));
    const tAnalytic = Date.now() - t0;

    const t1 = Date.now();
    const mc = plans.map((p) => meanOOP(p, scenarios));
    const tMc = Date.now() - t1;

    const rho = spearman(analytic, mc);
    console.log(
      `\nanalytic vs MC over ${plans.length} plans: rho=${rho.toFixed(3)}, ` +
        `analytic ${tAnalytic}ms vs MC ${tMc}ms (${(tMc / Math.max(1, tAnalytic)).toFixed(1)}x)`,
    );

    expect(rho).toBeGreaterThan(0.7); // strong rank agreement
    expect(tAnalytic).toBeLessThanOrEqual(tMc); // never slower
  });

  it("produces monotone percentiles and a bounded hit probability", () => {
    const model = buildUtilization(profile);
    const grid = buildSpendGrid(sampleScenarios(makeRng(7), model, 800));
    const s = analyticSummary(plans[0], grid);
    expect(s.p10).toBeLessThanOrEqual(s.p50);
    expect(s.p50).toBeLessThanOrEqual(s.p90);
    expect(s.probHitOOPMax).toBeGreaterThanOrEqual(0);
    expect(s.probHitOOPMax).toBeLessThanOrEqual(1);
  });
});
