import { describe, it, expect } from "vitest";
import type { Plan, PatientProfile, ServiceCostShare } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { recheck } from "@/lib/sim/recheck";

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
  makePlan({ id: "BRONZE", metal: "Bronze", deductible: 8000, oopMax: 9000, marketingName: "Bronze Saver", premiumByAge: { "40": 300 } }),
  makePlan({ id: "GOLD", metal: "Gold", deductible: 1000, oopMax: 4000, marketingName: "Gold Rich", premiumByAge: { "40": 600 } }),
];

const healthy: PatientProfile = {
  age: 40,
  sex: "female",
  state: "TX",
  householdSize: 1,
  annualIncome: 200000, // high income → no subsidy, isolates the cost math
  tobacco: false,
  conditions: [],
  prescriptions: [],
  plannedEvents: [],
  providers: [],
  riskTolerance: "medium",
};

describe("annual recheck", () => {
  it("surfaces switch savings when the patient is on a pricier plan than their best fit", () => {
    const res = recheck(healthy, plans, "GOLD");
    expect(res.currentPlanName).toBe("Gold Rich");
    expect(res.bestPlanName).toBe("Bronze Saver");
    expect(res.annualSavings!).toBeGreaterThan(0);
    expect(res.shouldSwitch).toBe(true);
  });

  it("handles having no current plan yet", () => {
    const res = recheck(healthy, plans, null);
    expect(res.currentPlanName).toBeNull();
    expect(res.annualSavings).toBeNull();
    expect(res.bestPlanName).toBe("Bronze Saver");
  });
});
