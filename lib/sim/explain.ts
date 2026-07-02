import type { PatientProfile, Plan, RankedPlan } from "@/lib/types";
import type { Scenario, UtilizationModel } from "@/lib/sim/utilization";
import { buildWaterfall, type CostWaterfall } from "@/lib/sim/waterfall";
import { buildFactSheet, type PlanFactSheet } from "@/lib/sim/facts";
import { buildScenarios, type NamedScenario } from "@/lib/sim/scenarios";
import { analyzeSensitivity, type Sensitivity } from "@/lib/sim/sensitivity";
import { buildTrustReport, type TrustReport } from "@/lib/trust/trust";

// The explanation bundle: everything needed to defend a recommendation in plain English. It
// reuses the exact simulated years the ranking scored on, so the audit view can never drift
// from the headline number.

export interface PlanExplanation {
  planId: string;
  waterfall: CostWaterfall;
  facts: PlanFactSheet;
  scenarios: NamedScenario[];
}

export interface RecommendationExplanation {
  plan: PlanExplanation;
  sensitivity: Sensitivity | null;
  trust: TrustReport;
}

/** Full audit view for a single plan. */
export function explainPlan(
  plan: Plan,
  profile: PatientProfile,
  model: UtilizationModel,
  fine: Scenario[],
  premiumNetAnnual: number,
): PlanExplanation {
  return {
    planId: plan.id,
    waterfall: buildWaterfall(plan, fine, premiumNetAnnual),
    facts: buildFactSheet(plan, profile, model, premiumNetAnnual),
    scenarios: buildScenarios(plan, fine, premiumNetAnnual),
  };
}

/** Full audit view for the recommended plan, plus sensitivity and the trust report. */
export function explainRecommendation(params: {
  top: RankedPlan;
  ranked: RankedPlan[];
  profile: PatientProfile;
  model: UtilizationModel;
  fine: Scenario[];
  premiumNetAnnual: number;
  modeledMeanSpend: number;
  overrodeRawTop: boolean;
  overrideReasons: string[];
}): RecommendationExplanation {
  const plan = explainPlan(params.top.plan, params.profile, params.model, params.fine, params.premiumNetAnnual);
  const sensitivity = analyzeSensitivity(params.ranked, params.modeledMeanSpend);
  const trust = buildTrustReport({
    plan: params.top.plan,
    sim: params.top.sim,
    constraints: params.top.constraints,
    profile: params.profile,
    assumptions: plan.facts.assumptions,
    sensitivity,
    overrodeRawTop: params.overrodeRawTop,
    overrideReasons: params.overrideReasons,
  });
  return { plan, sensitivity, trust };
}
