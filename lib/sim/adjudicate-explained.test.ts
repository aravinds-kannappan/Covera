import { describe, it, expect } from "vitest";
import txData from "@/data/plans.TX.json";
import type { Plan } from "@/lib/types";
import { adjudicate, adjudicateExplained } from "@/lib/sim/costsharing";
import { CLAIM_BUNDLES } from "@/lib/sim/bundles";

// The benchmark tab's bundle explorer runs adjudicateExplained on REAL plans (mixed copays and
// coinsurance, not the uniform reference plan). This guards the two properties the UI relies on:
// the mechanism buckets reconcile to the OOP, and the explained OOP matches the legacy path.
const plans = (txData as { plans: Plan[] }).plans;

describe("adjudicateExplained on real TX plans", () => {
  const sample = plans.filter((p) => p.metal !== "Catastrophic").slice(0, 40);

  it("mechanism buckets reconcile to OOP, and match legacy adjudicate, for every bundle", () => {
    for (const plan of sample) {
      for (const bundle of CLAIM_BUNDLES) {
        const a = adjudicateExplained(plan, bundle.scenario);
        // deductible + coinsurance + copays - cap savings == oop
        expect(a.deductiblePaid + a.coinsurancePaid + a.copayPaid - a.cappedSavings).toBeCloseTo(a.oop, 4);
        // OOP never exceeds the plan cap, and is non-negative
        expect(a.oop).toBeGreaterThanOrEqual(0);
        expect(a.oop).toBeLessThanOrEqual(plan.oopMax + 1);
        // Agrees with the legacy adjudicator's OOP
        expect(a.oop).toBeCloseTo(adjudicate(plan, bundle.scenario).oop, 4);
      }
    }
  });
});
