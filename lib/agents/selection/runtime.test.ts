import { describe, it, expect, beforeEach } from "vitest";
import type { Plan, PatientProfile, RankedPlan, SimSummary } from "@/lib/types";
import { runSelection } from "@/lib/agents/selection/runtime";
import { review } from "@/lib/agents/selection/critic";
import { clearSelectionMemory, selectionMemorySize } from "@/lib/agents/selection/memory";

function plan(id: string, over: Partial<Plan> = {}): Plan {
  return {
    id,
    state: "TX",
    issuer: "Test",
    marketingName: id,
    planType: "PPO",
    metal: "Silver",
    hsaEligible: false,
    actuarialValue: 0.7,
    deductible: 3000,
    drugDeductible: null,
    integratedMedicalDrugDeductible: true,
    oopMax: 9000,
    premiumByAge: { "40": 400 },
    costShares: {},
    ...over,
  };
}

function sim(over: Partial<SimSummary> & Pick<SimSummary, "planId">): SimSummary {
  return {
    annualPremium: 5000,
    annualPremiumGross: 5000,
    subsidy: 0,
    expectedOOP: 2000,
    expectedTotal: 7000,
    median: 6800,
    p10: 5200,
    p90: 12000,
    stdev: 2500,
    probHitOOPMax: 0.2,
    maxTotal: 14000,
    histogram: [],
    oopByService: {},
    cvar90: 13000,
    ...over,
  };
}

function ranked(
  id: string,
  simOver: Partial<SimSummary>,
  constraints: Partial<RankedPlan["constraints"]> = {},
  planOver: Partial<Plan> = {},
): RankedPlan {
  return {
    plan: plan(id, planOver),
    sim: sim({ planId: id, ...simOver }),
    score: simOver.expectedTotal ?? 7000,
    constraints: {
      coversAllDrugs: true,
      providersInNetwork: true,
      hsaOk: true,
      ...constraints,
    },
  };
}

const patient = (over: Partial<PatientProfile> = {}): PatientProfile => ({
  age: 40,
  sex: "female",
  state: "TX",
  householdSize: 1,
  annualIncome: 80000,
  tobacco: false,
  conditions: [],
  prescriptions: [],
  plannedEvents: [],
  providers: [],
  riskTolerance: "medium",
  ...over,
});

beforeEach(() => clearSelectionMemory());

describe("critic", () => {
  it("hard-vetoes a plan that drops a required drug", () => {
    const profile = patient({ prescriptions: [{ name: "metformin", tier: "genericDrugs", fillsPerYear: 12 }] });
    const cand = ranked("DROPS", { expectedTotal: 6000 }, { coversAllDrugs: false });
    const rev = review(cand, { profile, ranked: [cand], goal: { respectCoverage: true, boundTailRisk: true, keepAffordable: true } });
    expect(rev.approved).toBe(false);
    expect(rev.violations.some((v) => v.code === "drops_required_drug" && v.severity === "hard")).toBe(true);
  });

  it("blocks a brutal bad year for a risk-averse patient but not a risk-tolerant one", () => {
    const shortlist = [
      ranked("SAFE", { expectedTotal: 7200, cvar90: 9000 }),
      ranked("RISKY", { expectedTotal: 7000, cvar90: 16000 }),
    ];
    const goal = { respectCoverage: true, boundTailRisk: true, keepAffordable: true };
    const risky = shortlist[1];
    expect(review(risky, { profile: patient({ riskTolerance: "low" }), ranked: shortlist, goal }).approved).toBe(false);
    expect(review(risky, { profile: patient({ riskTolerance: "high" }), ranked: shortlist, goal }).approved).toBe(true);
  });
});

describe("runSelection runtime", () => {
  it("overrides the raw cheapest when it drops a required drug, promoting a covered plan", () => {
    const profile = patient({ prescriptions: [{ name: "metformin", tier: "genericDrugs", fillsPerYear: 12 }] });
    const shortlist = [
      ranked("CHEAP_NO_DRUG", { expectedTotal: 6000 }, { coversAllDrugs: false }),
      ranked("COVERED", { expectedTotal: 6400 }),
    ];
    const res = runSelection({ profile, ranked: shortlist });
    expect(res.rawTopPlanId).toBe("CHEAP_NO_DRUG");
    expect(res.recommendedPlanId).toBe("COVERED");
    expect(res.overridden).toBe(true);
    expect(res.vetoedRawTop.some((v) => v.code === "drops_required_drug")).toBe(true);
    // The path is auditable and ends at a finalize.
    expect(res.trajectory[res.trajectory.length - 1].action.type).toBe("finalize");
  });

  it("keeps the raw top when it already clears every check", () => {
    const profile = patient();
    const shortlist = [
      ranked("GOOD", { expectedTotal: 6000, cvar90: 9000 }),
      ranked("OTHER", { expectedTotal: 6500, cvar90: 9500 }),
    ];
    const res = runSelection({ profile, ranked: shortlist });
    expect(res.recommendedPlanId).toBe("GOOD");
    expect(res.overridden).toBe(false);
  });

  it("reuses a vetted path from long-term memory for an identical situation", () => {
    const profile = patient();
    const shortlist = [ranked("A", { expectedTotal: 6000, cvar90: 9000 }), ranked("B", { expectedTotal: 6500, cvar90: 9500 })];
    const first = runSelection({ profile, ranked: shortlist });
    expect(first.reusedFromMemory).toBe(false);
    expect(selectionMemorySize()).toBe(1);
    const second = runSelection({ profile, ranked: shortlist });
    expect(second.reusedFromMemory).toBe(true);
    expect(second.recommendedPlanId).toBe(first.recommendedPlanId);
  });
});
