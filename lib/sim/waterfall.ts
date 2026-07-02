import type { CareSource, Scenario } from "@/lib/sim/utilization";
import { CARE_SOURCES } from "@/lib/sim/utilization";
import { adjudicateExplained } from "@/lib/sim/costsharing";
import type { Plan } from "@/lib/types";

// The auditable cost waterfall.
//
// The whole point is to make "expected yearly cost" defensible line by line. We take the
// simulated years, decompose each one's out-of-pocket by mechanism (deductible phase,
// coinsurance, copays, and what the OOP-max cap saved), average across years, and lay it out
// as a waterfall that sums exactly to the headline number:
//
//   premium + deductible phase + coinsurance + copays - OOP-max cap savings = expected annual
//
// Each row is tagged with its basis: a hard plan FACT, a modeling ASSUMPTION, or a value
// DERIVED by combining the two. Nothing is a black box.

export type Basis = "fact" | "assumption" | "derived";

export interface WaterfallStep {
  key: string;
  label: string;
  /** Dollars. Positive adds to your cost, negative reduces it (the OOP-max cap). */
  amount: number;
  basis: Basis;
  note?: string;
}

export interface CareSourceRow {
  source: CareSource;
  label: string;
  /** Expected allowed dollars of care from this source, before the plan pays anything. */
  allowed: number;
}

export interface CostWaterfall {
  planId: string;
  premiumAnnual: number;
  /** Total price of the care we assume you use, pre-insurance. */
  expectedAllowed: number;
  /** Assumptions: where that care comes from. */
  careBySource: CareSourceRow[];
  /** Premium + the cost-sharing mechanism, summing to expectedAnnual. */
  steps: WaterfallStep[];
  expectedOOP: number;
  expectedAnnual: number;
  probHitOOPMax: number;
}

const SOURCE_LABEL: Record<CareSource, string> = {
  acute: "Everyday & acute care",
  chronicCare: "Chronic condition care (implied meds)",
  prescriptions: "Your prescriptions",
  plannedEvents: "Planned events (surgery, delivery)",
};

/**
 * Build the waterfall for one plan over a set of simulated years and its annual premium.
 * `scenarios` should be the same fine sample the optimizer scored the plan on, so the
 * waterfall reconciles exactly with the ranking.
 */
export function buildWaterfall(
  plan: Plan,
  scenarios: Scenario[],
  premiumAnnual: number,
): CostWaterfall {
  const n = scenarios.length || 1;
  let ded = 0;
  let coins = 0;
  let copay = 0;
  let capped = 0;
  let allowed = 0;
  let hit = 0;
  const bySource: Record<CareSource, number> = {
    acute: 0,
    chronicCare: 0,
    prescriptions: 0,
    plannedEvents: 0,
  };

  for (const s of scenarios) {
    const adj = adjudicateExplained(plan, s);
    ded += adj.deductiblePaid;
    coins += adj.coinsurancePaid;
    copay += adj.copayPaid;
    capped += adj.cappedSavings;
    allowed += s.totalAllowed;
    if (adj.hitOopMax) hit++;
    if (s.bySource) for (const src of CARE_SOURCES) bySource[src] += s.bySource[src];
  }

  ded /= n;
  coins /= n;
  copay /= n;
  capped /= n;
  allowed /= n;
  // Round the parts, then define the totals as their sum, so the waterfall reconciles to the
  // cent on screen (round(a) + round(b) is not round(a + b)).
  const premiumRounded = Math.round(premiumAnnual);
  const oopRounded = Math.round(ded + coins + copay - capped);
  const expectedOOP = oopRounded;
  const expectedAnnual = premiumRounded + oopRounded;

  const careBySource: CareSourceRow[] = CARE_SOURCES.map((source) => ({
    source,
    label: SOURCE_LABEL[source],
    allowed: Math.round(bySource[source] / n),
  })).filter((r) => r.allowed > 0);

  const steps: WaterfallStep[] = [
    {
      key: "premium",
      label: "Annual premium (after subsidy)",
      amount: Math.round(premiumAnnual),
      basis: "fact",
      note: "The plan's premium, net of your ACA subsidy.",
    },
    {
      key: "deductible",
      label: "Care you pay in full (deductible phase)",
      amount: Math.round(ded),
      basis: "derived",
      note: `You pay 100% until the $${plan.deductible.toLocaleString()} deductible is met.`,
    },
    {
      key: "coinsurance",
      label: "Your coinsurance share (after deductible)",
      amount: Math.round(coins),
      basis: "derived",
      note: "A percentage of the allowed amount, per the plan's benefits.",
    },
    {
      key: "copays",
      label: "Flat copays",
      amount: Math.round(copay),
      basis: "derived",
      note: "Fixed dollar copays for copay-based services.",
    },
    {
      key: "oopcap",
      label: "Out-of-pocket max protection",
      amount: -Math.round(capped),
      basis: "fact",
      note: `The $${plan.oopMax.toLocaleString()} cap on your yearly out-of-pocket, averaged over bad years.`,
    },
  ];

  return {
    planId: plan.id,
    premiumAnnual: premiumRounded,
    expectedAllowed: Math.round(allowed),
    careBySource,
    steps,
    expectedOOP,
    expectedAnnual,
    probHitOOPMax: hit / n,
  };
}
