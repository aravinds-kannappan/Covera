import { describe, it, expect } from "vitest";
import { makeRng } from "@/lib/sim/random";
import { buildUtilization, sampleScenarios, sampleScenariosAntithetic } from "@/lib/sim/utilization";
import { adjudicateOOP } from "@/lib/sim/costsharing";
import type { Plan, PatientProfile } from "@/lib/types";
import txData from "@/data/plans.TX.json";
import {
  antitheticGain,
  cvar,
  meanStdErr,
  quantileStdErr,
  variance,
} from "@/lib/sim/estimators";

const plans = (txData as { plans: Plan[] }).plans;

describe("tail-risk estimators", () => {
  it("CVaR is the mean of the worst tail and is >= the p90 point", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    // Worst 10% = 91..100, mean 95.5.
    expect(cvar(sorted, 0.1)).toBeCloseTo(95.5, 5);
    // Worst 5% = 96..100, mean 98.
    expect(cvar(sorted, 0.05)).toBeCloseTo(98, 5);
    const p90 = sorted[Math.floor(0.9 * sorted.length)];
    expect(cvar(sorted, 0.1)).toBeGreaterThanOrEqual(p90);
  });

  it("mean standard error shrinks with sample size", () => {
    const big = Array.from({ length: 4000 }, (_, i) => (i % 50) * 100);
    const small = big.slice(0, 250);
    expect(meanStdErr(big)).toBeLessThan(meanStdErr(small));
  });

  it("quantile standard error is finite and non-negative on a real distribution", () => {
    const sorted = Array.from({ length: 500 }, () => Math.random() * 1000).sort((a, b) => a - b);
    const se = quantileStdErr(sorted, 0.9);
    expect(se).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(se)).toBe(true);
  });

  it("variance is zero for a constant sample", () => {
    expect(variance([7, 7, 7, 7])).toBe(0);
  });
});

describe("antithetic variance reduction", () => {
  it("reports ~1x when draws are not actually paired", () => {
    const iid = Array.from({ length: 2000 }, () => Math.random());
    const gain = antitheticGain(iid);
    // No pairing structure: ratio should sit near 1 (within sampling slack).
    expect(gain.ratio).toBeGreaterThan(0.6);
    expect(gain.ratio).toBeLessThan(1.6);
  });

  it("beats plain resampling on real plan cost, at equal draw count", () => {
    const profile: PatientProfile = {
      age: 47,
      sex: "female",
      state: "TX",
      householdSize: 2,
      annualIncome: 70000,
      tobacco: false,
      conditions: ["diabetesType2"],
      prescriptions: [],
      plannedEvents: [],
      providers: [],
      riskTolerance: "medium",
    };
    const model = buildUtilization(profile);
    const plan = plans[0];
    const n = 4000;

    const anti = sampleScenariosAntithetic(makeRng(1), model, n).map((s) => adjudicateOOP(plan, s));
    const iid = sampleScenarios(makeRng(1), model, n).map((s) => adjudicateOOP(plan, s));

    const gain = antitheticGain(anti);
    // Frailty is the dominant latent factor, so mirror-image pairs must cut variance.
    expect(gain.ratio).toBeGreaterThan(1.05);
    expect(gain.effectiveSampleSize).toBeGreaterThan(n);
    // Both estimators are unbiased: their means should be close.
    const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(meanOf(anti) - meanOf(iid))).toBeLessThan(0.15 * meanOf(iid) + 1);
  });
});
