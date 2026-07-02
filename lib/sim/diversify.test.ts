import { describe, it, expect } from "vitest";
import type { Plan, PatientProfile, RankedPlan, SimSummary, Metal } from "@/lib/types";
import { curateShortlist, dedupeNearTwins } from "@/lib/sim/diversify";

function plan(id: string, over: Partial<Plan> = {}): Plan {
  return {
    id, state: "TX", issuer: "Acme", marketingName: id, planType: "PPO",
    metal: "Silver", hsaEligible: false, actuarialValue: 0.7, deductible: 3000,
    drugDeductible: null, integratedMedicalDrugDeductible: true, oopMax: 9000,
    premiumByAge: { "40": 400 }, costShares: {}, ...over,
  };
}
function sim(id: string, over: Partial<SimSummary> = {}): SimSummary {
  return {
    planId: id, annualPremium: 5000, annualPremiumGross: 5000, subsidy: 0,
    expectedOOP: 2000, expectedTotal: 7000, median: 6800, p10: 5200, p90: 12000,
    stdev: 2500, probHitOOPMax: 0.2, maxTotal: 14000, histogram: [], oopByService: {},
    cvar90: 13000, ...over,
  };
}
function rp(
  id: string,
  simOver: Partial<SimSummary>,
  planOver: Partial<Plan> = {},
  score?: number,
): RankedPlan {
  return {
    plan: plan(id, planOver),
    sim: sim(id, simOver),
    score: score ?? simOver.expectedTotal ?? 7000,
    constraints: { coversAllDrugs: true, providersInNetwork: true, hsaOk: true },
  };
}

const patient: PatientProfile = {
  age: 40, sex: "female", state: "TX", householdSize: 1, annualIncome: 80000,
  tobacco: false, conditions: [], prescriptions: [], plannedEvents: [], providers: [],
  riskTolerance: "medium",
};

describe("dedupeNearTwins", () => {
  it("collapses same-issuer, same-metal, similar-deductible plans to the best-scoring one", () => {
    const twins = [
      rp("A1", { expectedTotal: 7000 }, { issuer: "BCBS", metal: "Silver", deductible: 3000, oopMax: 9000 }, 7000),
      rp("A2", { expectedTotal: 7100 }, { issuer: "BCBS", metal: "Silver", deductible: 3200, oopMax: 9000 }, 7100),
      rp("B1", { expectedTotal: 6800 }, { issuer: "Oscar", metal: "Bronze", deductible: 8000, oopMax: 9000 }, 6800),
    ];
    const out = dedupeNearTwins(twins);
    expect(out.map((r) => r.plan.id).sort()).toEqual(["A1", "B1"]); // A2 dropped as A1's twin
  });
});

describe("curateShortlist", () => {
  it("caps the list and returns only distinct plans that span metals", () => {
    // 15 Silvers all clustered near the same price, plus a couple of distinct options.
    const ranked: RankedPlan[] = [];
    for (let i = 0; i < 15; i++)
      ranked.push(
        rp(`S${i}`, { expectedTotal: 7000 + i * 5, p90: 12000 + i * 5, cvar90: 13000 + i * 5 },
          { issuer: `Carrier${i}`, metal: "Silver", deductible: 3000, oopMax: 9000 }, 7000 + i * 5),
      );
    ranked.push(rp("BRZ", { expectedTotal: 6800, p90: 15000, cvar90: 17000, annualPremium: 3600 }, { issuer: "Z", metal: "Bronze" as Metal, deductible: 8000 }, 6900));
    ranked.push(rp("GLD", { expectedTotal: 7300, p90: 9000, cvar90: 9500 }, { issuer: "Y", metal: "Gold" as Metal, deductible: 1000, oopMax: 4000 }, 7100));
    ranked.sort((a, b) => a.score - b.score);

    const curated = curateShortlist(ranked, patient, 6);
    const ids = curated.map((c) => c.ranked.plan.id);
    expect(curated.length).toBeLessThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length); // distinct
    const metals = new Set(curated.map((c) => c.ranked.plan.metal));
    expect(metals.size).toBeGreaterThan(1); // not all Silver
    // Distinct roles are surfaced.
    expect(curated.some((c) => c.tag === "Best overall")).toBe(true);
    expect(curated.some((c) => c.tag === "Safest bad year")).toBe(true);
  });

  it("tags an HSA option when one exists", () => {
    const ranked = [
      rp("STD", { expectedTotal: 6800 }, { metal: "Silver" }, 6800),
      rp("HSA", { expectedTotal: 7200 }, { metal: "Bronze" as Metal, hsaEligible: true, deductible: 7000 }, 7200),
      rp("GOLD", { expectedTotal: 7400 }, { metal: "Gold" as Metal, deductible: 1000, oopMax: 4000 }, 7400),
    ];
    const curated = curateShortlist(ranked, patient, 6);
    expect(curated.some((c) => c.tag === "HSA-eligible")).toBe(true);
  });
});
