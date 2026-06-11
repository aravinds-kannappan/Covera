import { describe, it, expect } from "vitest";
import type { Plan, PatientProfile, ServiceKey, ServiceCostShare } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { adjudicate } from "@/lib/sim/costsharing";
import type { Scenario } from "@/lib/sim/utilization";
import { optimize } from "@/lib/sim/optimize";

function scenario(byService: Partial<Record<ServiceKey, number[]>>): Scenario {
  let total = 0;
  for (const k in byService) for (const a of byService[k as ServiceKey]!) total += a;
  return { byService, totalAllowed: total };
}

function makePlan(over: Partial<Plan> & Pick<Plan, "deductible" | "oopMax">): Plan {
  const cs = (s: Partial<ServiceCostShare>): ServiceCostShare => ({
    copay: null,
    coinsurance: null,
    afterDeductible: false,
    noCharge: false,
    ...s,
  });
  const costShares: Partial<Record<ServiceKey, ServiceCostShare>> = {};
  for (const k of SERVICE_KEYS)
    costShares[k] = cs({ coinsurance: 0.2, afterDeductible: true });
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
  };
}

describe("cost-sharing adjudication", () => {
  it("applies a copay before deductible and coinsurance after", () => {
    const plan = makePlan({ deductible: 1000, oopMax: 9000 });
    plan.costShares.primaryCare = {
      copay: 30,
      coinsurance: null,
      afterDeductible: false,
      noCharge: false,
    };
    plan.costShares.inpatient = {
      copay: null,
      coinsurance: 0.2,
      afterDeductible: true,
      noCharge: false,
    };
    // PCP $30 copay + inpatient: $1000 deductible at 100% + 20% of remaining $9000.
    const out = adjudicate(plan, scenario({ primaryCare: [200], inpatient: [10000] }));
    expect(out.oop).toBeCloseTo(30 + 1000 + 0.2 * 9000, 0); // 2830
    expect(out.hitOopMax).toBe(false);
  });

  it("caps member spend at the out-of-pocket maximum", () => {
    const plan = makePlan({ deductible: 1000, oopMax: 5000 });
    const out = adjudicate(plan, scenario({ inpatient: [100000] }));
    expect(out.oop).toBe(5000);
    expect(out.hitOopMax).toBe(true);
  });

  it("models an HSA 'no charge after deductible' plan", () => {
    const plan = makePlan({ deductible: 3000, oopMax: 3000 });
    for (const k of SERVICE_KEYS)
      plan.costShares[k] = {
        copay: 0,
        coinsurance: 0,
        afterDeductible: true,
        noCharge: true,
      };
    // Below deductible: pay full allowed; above: nothing.
    expect(adjudicate(plan, scenario({ inpatient: [2000] })).oop).toBeCloseTo(2000, 0);
    expect(adjudicate(plan, scenario({ inpatient: [10000] })).oop).toBe(3000);
  });

  it("allocates a shared deductible proportionally across services", () => {
    const plan = makePlan({ deductible: 1000, oopMax: 9000 });
    // $1200 of deductible-subject spend at 20% coinsurance:
    // member pays $1000 deductible + 20% of $200 above = $1040.
    const out = adjudicate(plan, scenario({ specialist: [800], labs: [400] }));
    expect(out.oop).toBeCloseTo(1040, 0);
  });
});

describe("optimization ranking", () => {
  const plans: Plan[] = [
    makePlan({ id: "BRONZE", metal: "Bronze", deductible: 8000, oopMax: 9000, premiumByAge: { "40": 300 } }),
    makePlan({ id: "SILVER", metal: "Silver", deductible: 4000, oopMax: 6000, premiumByAge: { "40": 420 } }),
    makePlan({ id: "GOLD", metal: "Gold", deductible: 1000, oopMax: 4000, premiumByAge: { "40": 550 } }),
  ];
  const base: PatientProfile = {
    age: 40,
    sex: "female",
    state: "TX",
    householdSize: 1,
    annualIncome: 200000, // high income -> no subsidy, isolates the cost math
    tobacco: false,
    conditions: [],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };

  it("prefers the cheap high-deductible plan for a healthy person", () => {
    const res = optimize(base, plans, { nCoarse: 300, nFine: 1200 });
    expect(res.ranked[0].plan.metal).toBe("Bronze");
  });

  it("flips to the rich low-deductible plan for a high utilizer", () => {
    const sick: PatientProfile = {
      ...base,
      conditions: ["cancerActive", "diabetesType1"],
      plannedEvents: ["plannedSurgery"],
    };
    const res = optimize(sick, plans, { nCoarse: 300, nFine: 1200 });
    expect(res.ranked[0].plan.metal).toBe("Gold");
    // A high utilizer should very often hit the out-of-pocket max.
    expect(res.ranked[0].sim.probHitOOPMax).toBeGreaterThan(0.5);
  });
});
