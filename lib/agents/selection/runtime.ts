import type {
  Action,
  ScreenId,
  SelectionGoal,
  SelectionInput,
  SelectionResult,
  TrajectoryStep,
  Violation,
} from "@/lib/agents/selection/types";
import { nextAction } from "@/lib/agents/selection/actor";
import { review, hardViolations, type CriticContext } from "@/lib/agents/selection/critic";
import { recall, remember, situationKey } from "@/lib/agents/selection/memory";

// Step 7: the runtime agent. It walks the connected screens, letting the Actor propose and
// the Critic rule, carries short-term memory (the running trajectory) and consults long-term
// memory (already-vetted paths). The output is a governed recommendation plus the full
// audit trail of how it was reached, so nothing is a black box.

const DEFAULT_GOAL: SelectionGoal = {
  respectCoverage: true,
  boundTailRisk: true,
  keepAffordable: true,
};

/** Map a critic violation to the decision screen that owns it, for the visible path. */
function screenForViolation(v: Violation): ScreenId {
  switch (v.code) {
    case "excess_tail_risk":
      return "check_tail_risk";
    case "premium_unaffordable":
      return "check_affordability";
    default:
      return "check_coverage";
  }
}

function advance(screen: ScreenId, rationale: string): Action {
  return { type: "advance", screen, rationale };
}

function emptyResult(goal: SelectionGoal): SelectionResult {
  return {
    goal,
    recommendedPlanId: null,
    rawTopPlanId: null,
    overridden: false,
    vetoedRawTop: [],
    trajectory: [
      { screen: "shortlist", action: advance("shortlist", "No plans survived the filters.") },
    ],
    reusedFromMemory: false,
  };
}

export function runSelection(
  input: SelectionInput,
  goal: SelectionGoal = DEFAULT_GOAL,
): SelectionResult {
  const { profile, ranked } = input;
  if (ranked.length === 0) return emptyResult(goal);

  // Long-term memory: replay an already-vetted path for an identical situation.
  const key = situationKey(profile, ranked);
  const cached = recall(key);
  if (cached) return cached;

  const ctx: CriticContext = { profile, ranked, goal };
  const rawTop = ranked[0];
  const rawTopReview = review(rawTop, ctx);
  const vetoedRawTop = hardViolations(rawTopReview);

  const trajectory: TrajectoryStep[] = [
    {
      screen: "frame_goal",
      action: advance(
        "frame_goal",
        "Goal: lowest risk-adjusted cost that keeps the patient's drugs and doctors, bounds the bad year, and stays affordable.",
      ),
    },
    {
      screen: "shortlist",
      action: advance(
        "shortlist",
        `${ranked.length} plans survived the optimizer; assessing best-first.`,
      ),
    },
  ];

  let recommendedPlanId: string | null = null;
  for (let cursor = 0; cursor < ranked.length; cursor++) {
    const candidate = ranked[cursor];
    const proposal = nextAction(ranked, cursor, null);
    const rev = cursor === 0 ? rawTopReview : review(candidate, ctx);
    trajectory.push({ screen: "assess_candidate", action: proposal, review: rev });

    // Make each failed check its own screen in the path, so the reasoning is legible.
    for (const v of rev.violations)
      trajectory.push({ screen: screenForViolation(v), action: advance(screenForViolation(v), v.detail) });

    const decision = nextAction(ranked, cursor, rev);
    trajectory.push({ screen: decision.screen, action: decision });

    if (decision.type === "finalize") {
      recommendedPlanId = decision.planId ?? candidate.plan.id;
      break;
    }
    // substitute_pick: loop advances the cursor to the next candidate.
  }

  const result: SelectionResult = {
    goal,
    recommendedPlanId,
    rawTopPlanId: rawTop.plan.id,
    overridden: recommendedPlanId !== rawTop.plan.id,
    vetoedRawTop,
    trajectory,
    reusedFromMemory: false,
  };

  remember(key, result);
  return result;
}
