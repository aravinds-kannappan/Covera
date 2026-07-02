import { describe, it, expect } from "vitest";
import type { ConstraintCheck, PatientProfile, Plan, SimSummary } from "@/lib/types";
import { buildTrustReport, NOT_ADVICE } from "@/lib/trust/trust";

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: "P", state: "TX", issuer: "Acme", marketingName: "Acme Silver", planType: "PPO",
    metal: "Silver", hsaEligible: false, actuarialValue: 0.7, deductible: 3000,
    drugDeductible: null, integratedMedicalDrugDeductible: true, oopMax: 9000,
    premiumByAge: { "40": 400 }, costShares: {}, ...over,
  };
}
const sim: SimSummary = {
  planId: "P", annualPremium: 5000, annualPremiumGross: 5000, subsidy: 0, expectedOOP: 2000,
  expectedTotal: 7000, median: 6800, p10: 5200, p90: 12000, stdev: 2500, probHitOOPMax: 0.2,
  maxTotal: 14000, histogram: [], oopByService: {}, cvar90: 13000, meanStdErr: 40,
};
const profile: PatientProfile = {
  age: 40, sex: "female", state: "TX", householdSize: 1, annualIncome: 80000, tobacco: false,
  conditions: [], prescriptions: [], plannedEvents: [], providers: [], riskTolerance: "medium",
};
const ok: ConstraintCheck = { coversAllDrugs: true, providersInNetwork: true, hsaOk: true };

const base = {
  sim, profile, assumptions: [], sensitivity: null, overrodeRawTop: false, overrideReasons: [],
};

describe("buildTrustReport", () => {
  it("always carries sources, uncertainty, and the non-advice guardrail", () => {
    const r = buildTrustReport({ ...base, plan: plan(), constraints: ok });
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.uncertainty).toMatch(/\$7,000/);
    expect(r.disclaimer).toBe(NOT_ADVICE);
  });

  it("warns when a prescription cannot be verified against a formulary", () => {
    const p = { ...profile, prescriptions: [{ name: "metformin", tier: "genericDrugs" as const, fillsPerYear: 12 }] };
    const r = buildTrustReport({ ...base, profile: p, plan: plan({ formulary: undefined }), constraints: ok });
    expect(r.drugCoverageFlags.some((f) => /assumed, not verified/.test(f))).toBe(true);
  });

  it("flags an out-of-network provider", () => {
    const p = { ...profile, providers: ["Dr. Smith"] };
    const r = buildTrustReport({
      ...base,
      profile: p,
      plan: plan({ network: ["Dr. Jones"] }),
      constraints: { ...ok, providersInNetwork: false },
    });
    expect(r.networkWarnings.some((w) => /out of this plan's network/.test(w))).toBe(true);
  });

  it("surfaces why the raw cheapest plan was overridden", () => {
    const r = buildTrustReport({
      ...base,
      plan: plan(),
      constraints: ok,
      overrodeRawTop: true,
      overrideReasons: ["It dropped a required drug."],
    });
    expect(r.whatCouldChange.some((w) => /set aside/.test(w))).toBe(true);
  });
});
