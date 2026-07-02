import { describe, it, expect } from "vitest";
import { adjudicate, adjudicateExplained } from "@/lib/sim/costsharing";
import { analyticOOP } from "@/lib/sim/analytic";
import { CLAIM_BUNDLES, REFERENCE_PLAN } from "@/lib/sim/bundles";

// Regression fixtures: each claim bundle has a known expected OOP on the reference plan.
const EXPECTED_OOP: Record<string, number> = {
  diabetesMeds: 480,
  cardiologyVisits: 1050,
  therapyVisits: 2200,
  arthritisMeds: 2080,
  erVisit: 2100,
  imaging: 1200,
  surgeryEpisode: 4080,
  maternityEpisode: 5600,
  inpatientStay: 7600,
};

describe("deterministic claim bundles on the reference plan", () => {
  for (const bundle of CLAIM_BUNDLES) {
    it(`${bundle.key}: OOP matches the hand-computed expectation`, () => {
      const adj = adjudicateExplained(REFERENCE_PLAN, bundle.scenario);
      expect(Math.round(adj.oop)).toBe(EXPECTED_OOP[bundle.key]);
    });
  }

  it("the waterfall identity holds for every bundle", () => {
    for (const bundle of CLAIM_BUNDLES) {
      const a = adjudicateExplained(REFERENCE_PLAN, bundle.scenario);
      // deductible + coinsurance + copays - cap savings == oop, exactly.
      expect(a.deductiblePaid + a.coinsurancePaid + a.copayPaid - a.cappedSavings).toBeCloseTo(a.oop, 6);
    }
  });

  it("explained adjudication agrees with the legacy adjudicate and the closed form", () => {
    for (const bundle of CLAIM_BUNDLES) {
      const explained = adjudicateExplained(REFERENCE_PLAN, bundle.scenario);
      const legacy = adjudicate(REFERENCE_PLAN, bundle.scenario);
      // Uniform 20%-after-deductible plan: adjudication must equal the analytic transform.
      const closed = analyticOOP(bundle.scenario.totalAllowed, 2000, 0.2, 8000);
      expect(explained.oop).toBeCloseTo(legacy.oop, 4);
      expect(explained.oop).toBeCloseTo(closed, 4);
    }
  });

  it("caps a catastrophic bundle at the out-of-pocket max", () => {
    const catastrophic = { byService: { inpatient: [500000] }, totalAllowed: 500000 };
    const a = adjudicateExplained(REFERENCE_PLAN, catastrophic);
    expect(a.oop).toBe(REFERENCE_PLAN.oopMax);
    expect(a.hitOopMax).toBe(true);
    expect(a.cappedSavings).toBeGreaterThan(0);
  });
});
