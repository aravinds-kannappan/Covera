import type { PatientProfile, RankedPlan } from "@/lib/types";
import type { CriticReview, SelectionGoal, Violation } from "@/lib/agents/selection/types";

// Step 5: the Critic. Given a candidate plan the Actor wants to recommend, decide whether it
// is safe and appropriate for THIS patient, or whether it should be blocked. Deterministic:
// it reasons over the simulated numbers and the patient's stated situation, never guesses.

/** How much worse a bad year can be before a risk-averse patient's pick is blocked. */
const TAIL = { absDollars: 2500, mult: 1.15 };
/** Premium above this share of income is "unaffordable" if a cheaper option exists. */
const AFFORDABILITY_SHARE = 0.1;

export interface CriticContext {
  profile: PatientProfile;
  ranked: RankedPlan[];
  goal: SelectionGoal;
}

/** Coherent bad-year cost, preferring CVaR and falling back to p90 if unset. */
function tailCost(r: RankedPlan): number {
  return r.sim.cvar90 ?? r.sim.p90;
}

export function review(candidate: RankedPlan, ctx: CriticContext): CriticReview {
  const { profile, ranked, goal } = ctx;
  const violations: Violation[] = [];

  // --- Coverage: a first-order mistake. Never headline a plan that drops care the patient
  // told us they need. These fire only when we actually have formulary / network data. ---
  if (goal.respectCoverage) {
    const c = candidate.constraints;
    if (!c.coversAllDrugs && profile.prescriptions.length > 0)
      violations.push({
        code: "drops_required_drug",
        severity: "hard",
        detail: "This plan does not cover one of the patient's current prescriptions.",
      });
    if (!c.providersInNetwork && profile.providers.length > 0)
      violations.push({
        code: "provider_out_of_network",
        severity: "hard",
        detail: "A doctor the patient asked to keep is out of this plan's network.",
      });
    if (!c.hsaOk)
      violations.push({
        code: "hsa_requirement_unmet",
        severity: "hard",
        detail: "The patient requires an HSA-eligible plan and this one is not.",
      });
  }

  // --- Tail risk: for a risk-averse patient, a plan whose bad year is materially worse than
  // the best available bad year is blocked; for others it is only advisory. ---
  if (goal.boundTailRisk && ranked.length > 0) {
    const bestTail = Math.min(...ranked.map(tailCost));
    const myTail = tailCost(candidate);
    const worseBy = myTail - bestTail;
    if (worseBy > TAIL.absDollars && myTail > bestTail * TAIL.mult) {
      violations.push({
        code: "excess_tail_risk",
        severity: profile.riskTolerance === "low" ? "hard" : "soft",
        detail: `Worst-10%-of-years cost is about $${Math.round(
          worseBy,
        )} above the safest plan on the shortlist.`,
      });
    }
  }

  // --- Affordability: block only when the premium is high AND a cheaper-premium plan on the
  // shortlist would also clear coverage; otherwise there is nothing better to offer. ---
  if (goal.keepAffordable && profile.annualIncome > 0) {
    const share = candidate.sim.annualPremium / profile.annualIncome;
    if (share > AFFORDABILITY_SHARE) {
      const cheaperSafeAlt = ranked.some(
        (r) =>
          r.plan.id !== candidate.plan.id &&
          r.sim.annualPremium < candidate.sim.annualPremium &&
          r.constraints.coversAllDrugs &&
          r.constraints.providersInNetwork &&
          r.constraints.hsaOk,
      );
      violations.push({
        code: "premium_unaffordable",
        severity: cheaperSafeAlt ? "hard" : "soft",
        detail: `Premium is ${(share * 100).toFixed(
          0,
        )}% of stated income${cheaperSafeAlt ? "; a cheaper covered plan exists" : ""}.`,
      });
    }
  }

  const approved = !violations.some((v) => v.severity === "hard");
  return { approved, violations };
}

/** Just the hard violations, for reporting what sank the raw top pick. */
export function hardViolations(review: CriticReview): Violation[] {
  return review.violations.filter((v) => v.severity === "hard");
}
