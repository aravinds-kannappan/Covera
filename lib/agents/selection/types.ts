import type { PatientProfile, RankedPlan } from "@/lib/types";

// The 7-step "medical agent from connected screens" roadmap, mapped onto plan selection.
//
//   1. Real goal          -> SelectionGoal (below): a stated objective, not just argmin.
//   2. Each screen = state -> ScreenId: the sequence of decision screens the agent walks.
//   3. Ground with tools   -> the simulation already produced RankedPlan (sim + constraints).
//   4. Actor agent         -> actor.ts: proposes ONE next action per screen.
//   5. Critic agent        -> critic.ts: checks the proposed pick, blocks unsafe/early ones.
//   6. Memory              -> memory.ts: short-term (last step) + long-term (whole path).
//   7. Runtime agent       -> runtime.ts: drives actor/critic/memory to a governed pick.
//
// Actor and Critic here are DETERMINISTIC decision agents over the simulated numbers, not
// LLMs and not trained policies. The conversational LLM concierge sits above this layer.

/** Step 1: the goal is explicit, and the critic enforces it. */
export interface SelectionGoal {
  /** Never headline a plan that drops a required drug or the patient's doctor. */
  respectCoverage: boolean;
  /** For a risk-averse patient, cap how bad a bad year is allowed to get. */
  boundTailRisk: boolean;
  /** Keep the premium affordable relative to income. */
  keepAffordable: boolean;
}

/** Step 2: the connected screens the agent moves through, in order. */
export type ScreenId =
  | "frame_goal"
  | "shortlist"
  | "assess_candidate"
  | "check_coverage"
  | "check_tail_risk"
  | "check_affordability"
  | "substitute"
  | "finalize";

/** Step 4: exactly one next action, chosen by the actor. */
export type ActionType =
  | "advance"
  | "propose_pick"
  | "substitute_pick"
  | "finalize";

export interface Action {
  type: ActionType;
  screen: ScreenId;
  planId?: string;
  rationale: string;
}

/** Step 5: what the critic can flag. `hard` blocks the pick; `soft` is advisory. */
export interface Violation {
  code:
    | "drops_required_drug"
    | "provider_out_of_network"
    | "hsa_requirement_unmet"
    | "excess_tail_risk"
    | "premium_unaffordable"
    | "within_noise_of_cheaper";
  severity: "hard" | "soft";
  detail: string;
}

export interface CriticReview {
  approved: boolean;
  violations: Violation[];
}

export interface TrajectoryStep {
  screen: ScreenId;
  action: Action;
  review?: CriticReview;
}

/** Step 7 output: the governed pick plus the full auditable path that produced it. */
export interface SelectionResult {
  goal: SelectionGoal;
  recommendedPlanId: string | null;
  /** What pure score argmin would have picked, before the critic. */
  rawTopPlanId: string | null;
  /** True when the critic moved the recommendation off the raw top pick. */
  overridden: boolean;
  /** Hard violations the raw top pick carried (empty when it was already safe). */
  vetoedRawTop: Violation[];
  /** Long-term memory: every screen, action, and review in order. */
  trajectory: TrajectoryStep[];
  /** True when this exact situation was already solved and reused from memory. */
  reusedFromMemory: boolean;
}

export interface SelectionInput {
  profile: PatientProfile;
  /** Score-ordered shortlist straight from the optimizer. */
  ranked: RankedPlan[];
}
