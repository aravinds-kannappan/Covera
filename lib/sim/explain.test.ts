import { describe, it, expect } from "vitest";
import txData from "@/data/plans.TX.json";
import type { Plan, PatientProfile } from "@/lib/types";
import { optimize } from "@/lib/sim/optimize";
import { NOT_ADVICE } from "@/lib/trust/trust";

const plans = (txData as { plans: Plan[] }).plans;

const profile: PatientProfile = {
  age: 48,
  sex: "female",
  state: "TX",
  householdSize: 2,
  annualIncome: 68000,
  tobacco: false,
  conditions: ["diabetesType2", "hypertension"],
  prescriptions: [{ name: "metformin", tier: "genericDrugs", fillsPerYear: 12 }],
  plannedEvents: [],
  providers: [],
  riskTolerance: "medium",
};

describe("recommendation explanation on real TX data", () => {
  const res = optimize(profile, plans, { nFine: 2000 });
  const explain = res.explain!;
  const top = res.ranked[0];

  it("produces an explanation for the recommended plan", () => {
    expect(explain).toBeDefined();
    expect(explain.plan.planId).toBe(top.plan.id);
  });

  it("the waterfall reconciles exactly with the headline number", () => {
    const w = explain.plan.waterfall;
    // premium + expected OOP == expected annual (definitional).
    expect(w.premiumAnnual + w.expectedOOP).toBe(w.expectedAnnual);
    // The steps sum to the expected annual cost (within per-row rounding).
    const stepSum = w.steps.reduce((a, s) => a + s.amount, 0);
    expect(Math.abs(stepSum - w.expectedAnnual)).toBeLessThanOrEqual(3);
    // And the waterfall agrees with the ranking's expected total.
    expect(Math.abs(w.expectedAnnual - top.sim.expectedTotal)).toBeLessThanOrEqual(5);
  });

  it("care-by-source attributes the patient's prescription", () => {
    const rx = explain.plan.waterfall.careBySource.find((r) => r.source === "prescriptions");
    expect(rx).toBeDefined();
    expect(rx!.allowed).toBeGreaterThan(0);
  });

  it("scenarios are ordered and the worst case is capped at the OOP max", () => {
    const byKey = Object.fromEntries(explain.plan.scenarios.map((s) => [s.key, s]));
    expect(byKey.light.total).toBeLessThanOrEqual(byKey.normal.total);
    expect(byKey.normal.total).toBeLessThanOrEqual(byKey.high.total);
    expect(byKey.worstInNetwork.oop).toBe(top.plan.oopMax);
  });

  it("separates hard facts from assumptions with sources", () => {
    const { facts, assumptions } = explain.plan.facts;
    expect(facts.some((f) => f.key === "deductible")).toBe(true);
    expect(facts.every((f) => f.source.length > 0)).toBe(true);
    expect(assumptions.some((a) => a.key === "utilization")).toBe(true);
    expect(assumptions.every((a) => a.source.length > 0)).toBe(true);
  });

  it("carries a trust report with sources, a drug flag, and the non-advice guardrail", () => {
    expect(explain.trust.sources.length).toBeGreaterThan(0);
    expect(explain.trust.drugCoverageFlags.length).toBeGreaterThan(0); // patient has a prescription
    expect(explain.trust.disclaimer).toBe(NOT_ADVICE);
    expect(explain.trust.whatCouldChange.length).toBeGreaterThan(0);
  });
});
