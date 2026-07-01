import { describe, it, expect } from "vitest";
import type { Plan, PatientProfile, ServiceCostShare } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { optimizeCached, clearOptimizeCache, optimizeCacheSize } from "@/lib/sim/cache";

function makePlan(over: Partial<Plan> & Pick<Plan, "deductible" | "oopMax">): Plan {
  const costShares: Partial<Record<string, ServiceCostShare>> = {};
  for (const k of SERVICE_KEYS)
    costShares[k] = { copay: null, coinsurance: 0.2, afterDeductible: true, noCharge: false };
  return {
    id: "TEST",
    state: "TX",
    issuer: "Test",
    marketingName: "Test plan",
    planType: "PPO",
    metal: "Silver",
    hsaEligible: false,
    actuarialValue: 0.7,
    drugDeductible: null,
    integratedMedicalDrugDeductible: true,
    premiumByAge: { "40": 400 },
    costShares,
    ...over,
  } as Plan;
}

const plans: Plan[] = [
  makePlan({ id: "BRONZE", metal: "Bronze", deductible: 8000, oopMax: 9000, premiumByAge: { "40": 300 } }),
  makePlan({ id: "GOLD", metal: "Gold", deductible: 1000, oopMax: 4000, premiumByAge: { "40": 600 } }),
];

const profile: PatientProfile = {
  age: 40,
  sex: "female",
  state: "TX",
  householdSize: 1,
  annualIncome: 200000,
  tobacco: false,
  conditions: [],
  prescriptions: [],
  plannedEvents: [],
  providers: [],
  riskTolerance: "medium",
};

describe("optimize cache", () => {
  it("returns the same result object for identical inputs (hit)", () => {
    clearOptimizeCache();
    const a = optimizeCached(profile, plans);
    const b = optimizeCached(profile, plans);
    expect(b).toBe(a);
    expect(optimizeCacheSize()).toBe(1);
  });

  it("misses when the profile changes", () => {
    clearOptimizeCache();
    const a = optimizeCached(profile, plans);
    const c = optimizeCached({ ...profile, age: 55 }, plans);
    expect(c).not.toBe(a);
    expect(optimizeCacheSize()).toBe(2);
  });

  it("ignores fields that do not affect ranking (providers)", () => {
    clearOptimizeCache();
    const a = optimizeCached(profile, plans);
    const b = optimizeCached({ ...profile, providers: ["Dr. Smith"] }, plans);
    expect(b).toBe(a);
  });
});
