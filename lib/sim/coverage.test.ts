import { describe, it, expect } from "vitest";
import type { Plan, PatientProfile, Prescription, ServiceCostShare } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { drugCoverage, networkCoverage } from "@/lib/sim/coverage";
import { optimize } from "@/lib/sim/optimize";

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

const metformin: Prescription = { name: "Metformin", tier: "genericDrugs", fillsPerYear: 12 };

describe("drug formulary matching", () => {
  it("assumes covered when the plan has no formulary data", () => {
    const c = drugCoverage(makePlan({ deductible: 1000, oopMax: 5000 }), [metformin]);
    expect(c.coversAll).toBe(true);
    expect(c.known).toBe(false);
  });

  it("flags a drug the formulary does not cover", () => {
    const plan = makePlan({ deductible: 1000, oopMax: 5000, formulary: { metformin: "notCovered" } });
    const c = drugCoverage(plan, [metformin]);
    expect(c.coversAll).toBe(false);
    expect(c.notCovered).toContain("Metformin");
  });

  it("flags a costlier tier placement", () => {
    const plan = makePlan({ deductible: 1000, oopMax: 5000, formulary: { metformin: "specialtyDrugs" } });
    const c = drugCoverage(plan, [metformin]);
    expect(c.coversAll).toBe(true);
    expect(c.tierChanges[0]).toMatchObject({ from: "genericDrugs", to: "specialtyDrugs" });
  });
});

describe("provider network matching", () => {
  it("flags an out-of-network provider (case-insensitive, partial match)", () => {
    const plan = makePlan({ deductible: 1000, oopMax: 5000, network: ["UT Southwestern", "Baylor"] });
    const n = networkCoverage(plan, ["ut southwestern", "Dr. Nobody"]);
    expect(n.allInNetwork).toBe(false);
    expect(n.outOfNetwork).toEqual(["Dr. Nobody"]);
  });
});

describe("coverage penalty affects ranking", () => {
  const base: PatientProfile = {
    age: 40,
    sex: "female",
    state: "TX",
    householdSize: 1,
    annualIncome: 200000,
    tobacco: false,
    conditions: [],
    prescriptions: [metformin],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };
  // Two otherwise-identical plans; only B fails to cover the patient's drug.
  const plans: Plan[] = [
    makePlan({ id: "COVERS", deductible: 3000, oopMax: 7000, formulary: { metformin: "genericDrugs" } }),
    makePlan({ id: "DROPS", deductible: 3000, oopMax: 7000, formulary: { metformin: "notCovered" } }),
  ];

  it("ranks the plan that covers the drug ahead of the one that drops it", () => {
    const res = optimize(base, plans, { nCoarse: 200, nFine: 800 });
    expect(res.ranked[0].plan.id).toBe("COVERS");
    const drops = res.ranked.find((r) => r.plan.id === "DROPS")!;
    expect(drops.constraints.coversAllDrugs).toBe(false);
    expect(res.ranked[0].constraints.coversAllDrugs).toBe(true);
  });
});
