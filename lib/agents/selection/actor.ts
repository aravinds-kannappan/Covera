import type { RankedPlan } from "@/lib/types";
import type { Action, CriticReview } from "@/lib/agents/selection/types";

// Step 4: the Actor. It commits to exactly ONE next action at a time and never skips ahead:
// it proposes the current best candidate, and only after the Critic has ruled does it either
// finalize or substitute the next candidate down the shortlist. This is the "act step by
// step, do not COMPLETE before the checks" discipline from the roadmap.

/**
 * Decide the next action.
 *  - No review yet at this cursor -> propose the candidate for review.
 *  - Last review approved         -> finalize it.
 *  - Last review blocked, more left -> substitute the next candidate.
 *  - Last review blocked, none left -> finalize the least-bad (the raw top).
 */
export function nextAction(
  ranked: RankedPlan[],
  cursor: number,
  lastReview: CriticReview | null,
): Action {
  const candidate = ranked[cursor];

  if (lastReview === null) {
    return {
      type: "propose_pick",
      screen: "assess_candidate",
      planId: candidate.plan.id,
      rationale: `Lowest risk-adjusted cost among the remaining shortlist ($${Math.round(
        candidate.sim.expectedTotal,
      )} expected all-in).`,
    };
  }

  if (lastReview.approved) {
    return {
      type: "finalize",
      screen: "finalize",
      planId: candidate.plan.id,
      rationale: "Clears every coverage, tail-risk, and affordability check.",
    };
  }

  const hard = lastReview.violations.filter((v) => v.severity === "hard");
  const reason = hard.map((v) => v.detail).join(" ");

  if (cursor + 1 < ranked.length) {
    return {
      type: "substitute_pick",
      screen: "substitute",
      planId: ranked[cursor + 1].plan.id,
      rationale: `Blocked: ${reason} Substituting the next-best plan.`,
    };
  }

  return {
    type: "finalize",
    screen: "finalize",
    planId: ranked[0].plan.id,
    rationale:
      "No shortlisted plan cleared every check; falling back to the top-ranked plan and surfacing the caveats.",
  };
}
