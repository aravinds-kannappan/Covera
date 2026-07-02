import type { Plan, PatientProfile } from "@/lib/types";
import type { OptimizeResult } from "@/lib/sim/optimize";
import type { PlansMeta } from "@/lib/agents/types";
import { optimizeCached } from "@/lib/sim/cache";
import { usd } from "@/lib/utils";

// The Advisor tool. It is the simulation, not an LLM: given a profile (optionally with a
// "what-if" patch), it runs the real Monte-Carlo optimizer over real CMS plans and
// returns a compact, textable ranking. The orchestrator does the explaining; this
// guarantees every number the agent texts is a real simulated figure, never invented.

/** Fields the agent may override to explore a what-if scenario. */
export interface WhatIfPatch {
  conditions?: PatientProfile["conditions"];
  plannedEvents?: PatientProfile["plannedEvents"];
  annualIncome?: number;
  riskTolerance?: PatientProfile["riskTolerance"];
  requireHsa?: boolean;
  age?: number;
}

export function applyWhatIf(base: PatientProfile, patch?: WhatIfPatch): PatientProfile {
  if (!patch) return base;
  const next: PatientProfile = { ...base };
  if (Array.isArray(patch.conditions)) next.conditions = patch.conditions;
  if (Array.isArray(patch.plannedEvents)) next.plannedEvents = patch.plannedEvents;
  if (typeof patch.annualIncome === "number") next.annualIncome = patch.annualIncome;
  if (typeof patch.riskTolerance === "string") next.riskTolerance = patch.riskTolerance;
  if (typeof patch.requireHsa === "boolean") next.requireHsa = patch.requireHsa;
  if (typeof patch.age === "number") next.age = patch.age;
  return next;
}

export function toPlansMeta(result: OptimizeResult, label: string): PlansMeta {
  return {
    label,
    subsidyMonthly: Math.round(result.subsidy.aptcMonthly),
    topPlans: result.ranked.slice(0, 3).map((r) => ({
      name: r.plan.marketingName,
      metal: r.plan.metal,
      expectedTotal: Math.round(r.sim.expectedTotal),
      p90: Math.round(r.sim.p90),
      annualPremium: Math.round(r.sim.annualPremium),
      probHitOOPMax: Math.round(r.sim.probHitOOPMax * 100),
    })),
  };
}

/** Run the optimizer for a profile (+ optional what-if) and return display-ready data. */
export function recommendPlans(
  base: PatientProfile,
  plans: Plan[],
  opts: { whatIf?: WhatIfPatch; label?: string } = {},
): { result: OptimizeResult; meta: PlansMeta } {
  const profile = applyWhatIf(base, opts.whatIf);
  // Slightly lighter sampling than the full web run keeps texting latency snappy.
  const result = optimizeCached(profile, plans, { nFine: 2500 });
  return { result, meta: toPlansMeta(result, opts.label ?? "Your ranked plans") };
}

/** A terse, model-readable summary of the current ranking for the system prompt. */
export function plansSummaryText(result: OptimizeResult): string {
  if (result.ranked.length === 0) return "No plans matched the current filters.";
  const lines = result.ranked
    .slice(0, 5)
    .map((r, i) => {
      const s = r.sim;
      // worst-10%-of-years (CVaR) is the number a risk-averse patient should hear; p90 is a
      // single point, CVaR is the average of the whole bad tail beyond it.
      const badYear = usd(s.cvar90 ?? s.p90);
      return `${i + 1}. ${r.plan.marketingName} (${r.plan.metal}): premium ${usd(
        s.annualPremium,
      )}/yr, expected all-in ${usd(s.expectedTotal)}, worst-10%-of-years ${badYear}, ${Math.round(
        s.probHitOOPMax * 100,
      )}% chance of hitting the OOP max.`;
    });

  // Surface the governance verdict so the concierge can explain WHY the headline plan may not
  // be the raw cheapest (it dropped a drug/doctor, priced the patient out, or was too risky).
  const g = result.governance;
  if (g.overridden && g.vetoedRawTop.length > 0) {
    lines.unshift(
      `Note: the raw cheapest plan was set aside because ${g.vetoedRawTop
        .map((v) => v.detail)
        .join(" ")} The plan below (#1) is the safe recommendation.`,
    );
  }
  return lines.join("\n");
}
