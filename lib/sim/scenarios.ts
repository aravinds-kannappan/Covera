import type { Plan } from "@/lib/types";
import type { Scenario } from "@/lib/sim/utilization";
import { adjudicateExplained } from "@/lib/sim/costsharing";
import { MEPS } from "@/lib/sim/params";
import type { Basis } from "@/lib/sim/waterfall";

// One number hides the shape of risk. A person choosing a plan should see a normal year, a
// light year, a rough year, and the specific expensive episodes they might face, each priced
// on THIS plan's real rules. Some of these are percentiles read off the simulated
// distribution (normal / light / high / worst-case); others are deterministic "what if this
// episode happens" years built by adding a real surgery or delivery to a typical year. Every
// scenario is labeled with how it was produced.

export interface NamedScenario {
  key: string;
  label: string;
  description: string;
  /** Allowed (pre-insurance) spend in this year. */
  allowed: number;
  /** Member out-of-pocket on this plan for this year. */
  oop: number;
  /** Premium + OOP. */
  total: number;
  basis: Basis;
}

/** Deep-clone a year's service map so we can add an episode without mutating the sample. */
function cloneYear(s: Scenario): Scenario {
  const byService: Scenario["byService"] = {};
  for (const k in s.byService) byService[k as keyof typeof byService] = [...s.byService[k as keyof typeof byService]!];
  return { byService, totalAllowed: s.totalAllowed };
}

/** Add a planned-event episode (surgery, delivery) to a base year, priced from MEPS. */
function addEpisode(base: Scenario, eventKey: "plannedSurgery" | "pregnancy"): Scenario | null {
  const ep = MEPS.plannedEvents[eventKey];
  if (!ep?.guaranteedEvents?.length) return null;
  const year = cloneYear(base);
  let added = 0;
  for (const g of ep.guaranteedEvents) {
    const allowed = g.allowedOverride ?? MEPS.services[g.service].allowedMedian;
    for (let i = 0; i < g.count; i++) {
      (year.byService[g.service] ??= []).push(allowed);
      year.totalAllowed += allowed;
      added += allowed;
    }
  }
  return added > 0 ? year : null;
}

function nearestByOOP(scored: { scn: Scenario; oop: number }[], q: number): Scenario {
  const i = Math.min(scored.length - 1, Math.max(0, Math.floor(q * scored.length)));
  return scored[i].scn;
}

/**
 * Build the named scenarios for one plan, using the same simulated years the ranking used.
 * `premiumAnnual` is the subsidized annual premium.
 */
export function buildScenarios(
  plan: Plan,
  scenarios: Scenario[],
  premiumAnnual: number,
): NamedScenario[] {
  if (scenarios.length === 0) return [];
  const scored = scenarios
    .map((scn) => ({ scn, oop: adjudicateExplained(plan, scn).oop }))
    .sort((a, b) => a.oop - b.oop);

  const out: NamedScenario[] = [];
  const push = (
    key: string,
    label: string,
    description: string,
    year: Scenario,
    basis: Basis,
  ) => {
    const oop = adjudicateExplained(plan, year).oop;
    out.push({
      key,
      label,
      description,
      allowed: Math.round(year.totalAllowed),
      oop: Math.round(oop),
      total: Math.round(premiumAnnual + oop),
      basis,
    });
  };

  const median = nearestByOOP(scored, 0.5);
  push("light", "Lighter than expected", "A quiet year: minimal care (10th percentile).", nearestByOOP(scored, 0.1), "assumption");
  push("normal", "Normal year", "A typical year for your profile (median).", median, "assumption");
  push("high", "High-utilization year", "A rough year: lots of care (90th percentile).", nearestByOOP(scored, 0.9), "assumption");

  const surgery = addEpisode(median, "plannedSurgery");
  if (surgery) push("surgery", "Surgery year", "A typical year plus one planned surgery episode.", surgery, "derived");
  const pregnancy = addEpisode(median, "pregnancy");
  if (pregnancy) push("pregnancy", "Pregnancy year", "A typical year plus a full maternity/delivery episode.", pregnancy, "derived");

  // Worst-case in-network: everything goes wrong but stays in-network, so the OOP max caps
  // you. This is a hard fact about the plan, independent of the simulation.
  out.push({
    key: "worstInNetwork",
    label: "Worst case, in-network",
    description: "A catastrophic but fully in-network year. Your cost is capped at the out-of-pocket max.",
    allowed: Math.round(scored[scored.length - 1].scn.totalAllowed),
    oop: plan.oopMax,
    total: Math.round(premiumAnnual + plan.oopMax),
    basis: "fact",
  });

  return out;
}
