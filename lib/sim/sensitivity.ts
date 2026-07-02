import type { RankedPlan } from "@/lib/types";
import { analyticOOP, effectiveCoinsurance } from "@/lib/sim/analytic";

// "When does the winning plan stop winning?" Because out-of-pocket is a closed-form, monotone
// function of one number (a year's total allowed spend), we can trace each plan's total cost
// (premium + OOP) as a line over spend and find exactly where a challenger overtakes the
// winner. That crossover, stated in plain dollars of care, is the honest answer to "is this
// really the right plan for me": e.g. "the Bronze plan wins only below ~$9,000 of care a year."

const STEP = 500; // dollars of allowed spend per grid point
const MAX_SPEND = 250_000; // beyond this everyone is pinned at their OOP max

export interface Crossover {
  challengerPlanId: string;
  challengerName: string;
  /** Winner wins below this annual allowed-spend level; challenger wins above it. */
  crossoverSpend: number | null;
  /** True when the winner beats this challenger across the whole plausible range. */
  winnerDominates: boolean;
  note: string;
}

export interface Sensitivity {
  winnerPlanId: string;
  winnerName: string;
  /** The patient's modeled mean annual allowed spend, for context on which side they sit. */
  modeledMeanSpend: number;
  crossovers: Crossover[];
}

function totalCostAtSpend(r: RankedPlan, spend: number): number {
  return (
    r.sim.annualPremium +
    analyticOOP(spend, r.plan.deductible, effectiveCoinsurance(r.plan), r.plan.oopMax)
  );
}

/**
 * For the top-ranked plan, find where each of the next few plans would overtake it as spend
 * rises. `modeledMeanSpend` (the simulation's mean total allowed) anchors the explanation.
 */
export function analyzeSensitivity(
  ranked: RankedPlan[],
  modeledMeanSpend: number,
  maxChallengers = 3,
): Sensitivity | null {
  if (ranked.length < 2) return null;
  const winner = ranked[0];
  const crossovers: Crossover[] = [];

  // Compare against DISTINCT alternatives: skip the winner's own near-twins (same marketing
  // name) and dedupe challengers by name, so we never say a plan beats itself.
  const seen = new Set<string>([winner.plan.marketingName]);
  const challengers: RankedPlan[] = [];
  for (const r of ranked.slice(1)) {
    if (seen.has(r.plan.marketingName)) continue;
    seen.add(r.plan.marketingName);
    challengers.push(r);
    if (challengers.length >= maxChallengers) break;
  }

  const meanSpend = Math.round(modeledMeanSpend);

  for (const challenger of challengers) {
    // Anchor the comparison at the patient's own modeled spend: that is always an unambiguous,
    // decision-relevant statement, unlike a "wins below $X" claim that breaks when copay-heavy
    // curves cross more than once. We still find the nearest crossing for context.
    const winnerCheaper = (x: number) => totalCostAtSpend(winner, x) <= totalCostAtSpend(challenger, x);
    const winnerAtMean = totalCostAtSpend(winner, modeledMeanSpend);
    const challengerAtMean = totalCostAtSpend(challenger, modeledMeanSpend);
    const winnerWinsAtMean = winnerAtMean <= challengerAtMean;
    const gap = Math.round(Math.abs(winnerAtMean - challengerAtMean));

    // First spend level where the lead changes hands, scanning outward from the mean.
    let crossoverSpend: number | null = null;
    let prev = winnerCheaper(0);
    for (let x = STEP; x <= MAX_SPEND; x += STEP) {
      const cur = winnerCheaper(x);
      if (cur !== prev) {
        crossoverSpend = x;
        break;
      }
      prev = cur;
    }
    const winnerDominates = crossoverSpend == null && winnerWinsAtMean;

    // Note: this compares total cost AT a single spend level, which is not the same as the
    // simulation's expected cost (an average over the whole distribution of years). So we say
    // "at that level of care", never "on expected cost".
    const lead = winnerWinsAtMean
      ? `${winner.plan.marketingName} is about $${gap.toLocaleString()} cheaper a year than ${challenger.plan.marketingName} (${challenger.plan.metal})`
      : `${challenger.plan.marketingName} (${challenger.plan.metal}) looks about $${gap.toLocaleString()} cheaper at that single spend level, but ${winner.plan.marketingName} is recommended once the full range of possible years and your risk preference are weighed`;
    const crossNote =
      crossoverSpend != null
        ? ` The two cross around $${crossoverSpend.toLocaleString()} of annual care.`
        : "";
    const note = `At your modeled ~$${meanSpend.toLocaleString()} of care a year, ${lead}.${crossNote}`;

    crossovers.push({
      challengerPlanId: challenger.plan.id,
      challengerName: challenger.plan.marketingName,
      crossoverSpend,
      winnerDominates,
      note,
    });
  }

  return {
    winnerPlanId: winner.plan.id,
    winnerName: winner.plan.marketingName,
    modeledMeanSpend: Math.round(modeledMeanSpend),
    crossovers,
  };
}
