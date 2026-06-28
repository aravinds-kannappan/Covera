import type { Plan, PatientProfile } from "@/lib/types";
import { optimize } from "@/lib/sim/optimize";

// Optimize — annual re-rank.
//
// People overwhelmingly stay on last year's plan even when a better one exists (a 2017
// study found 61% pick a suboptimal plan, overpaying ~$372/yr — driven by inertia, not
// price). This re-runs the optimizer for the patient's current situation and compares
// their existing plan to this year's best, so the concierge can nudge: "your meds changed,
// plan B now saves you $X — want me to switch you?"

export interface RecheckResult {
  bestPlanName: string;
  bestExpectedTotal: number;
  currentPlanName: string | null;
  currentExpectedTotal: number | null;
  annualSavings: number | null;
  shouldSwitch: boolean;
  reason: string;
}

export function recheck(
  profile: PatientProfile,
  plans: Plan[],
  currentPlanId: string | null,
  opts: { switchThreshold?: number } = {},
): RecheckResult {
  const threshold = opts.switchThreshold ?? 300;
  const { ranked } = optimize(profile, plans);
  const best = ranked[0];
  const bestExpectedTotal = Math.round(best.sim.expectedTotal);
  const current = currentPlanId
    ? ranked.find((r) => r.plan.id === currentPlanId)
    : undefined;

  if (!current) {
    return {
      bestPlanName: best.plan.marketingName,
      bestExpectedTotal,
      currentPlanName: null,
      currentExpectedTotal: null,
      annualSavings: null,
      shouldSwitch: Boolean(currentPlanId),
      reason: currentPlanId
        ? "Your current plan is no longer among this year's strongest options for your situation — worth a closer look."
        : `${best.plan.marketingName} is your best-fit plan this year.`,
    };
  }

  const currentExpectedTotal = Math.round(current.sim.expectedTotal);
  const annualSavings = currentExpectedTotal - bestExpectedTotal;
  const shouldSwitch = annualSavings > threshold;
  return {
    bestPlanName: best.plan.marketingName,
    bestExpectedTotal,
    currentPlanName: current.plan.marketingName,
    currentExpectedTotal,
    annualSavings,
    shouldSwitch,
    reason: shouldSwitch
      ? `Switching to ${best.plan.marketingName} could save about $${annualSavings.toLocaleString()} this year.`
      : `Your current plan is still within $${Math.max(0, annualSavings).toLocaleString()} of the best option — staying put is reasonable.`,
  };
}
