import type { Plan, PatientProfile } from "@/lib/types";
import type { MarketplaceMeta } from "@/lib/agents/types";
import { computeSubsidy, netPremium } from "@/lib/sim/subsidy";

// The Marketplace tool powers the product's reframe: instead of accepting whatever an
// employer offers, the patient can see the single best deal across the *entire* on-
// exchange marketplace for their state, net of the subsidy they'd qualify for, and
// compare it against their employer's offer.

export function compareEmployerOffer(
  profile: PatientProfile,
  plans: Plan[],
  employerMonthlyToEmployee?: number,
): MarketplaceMeta {
  const subsidy = computeSubsidy(profile, plans);
  const eligible = plans.filter((p) => p.metal !== "Catastrophic" || profile.age < 30);

  let best = Infinity;
  for (const p of eligible) {
    best = Math.min(best, netPremium(p, profile.age, subsidy.aptcMonthly));
  }
  const bestMarketplaceMonthly = Number.isFinite(best) ? Math.round(best) : 0;

  const employer = typeof employerMonthlyToEmployee === "number" ? employerMonthlyToEmployee : null;
  let verdict: string;
  if (employer == null) {
    verdict =
      subsidy.aptcMonthly > 0
        ? `With your subsidy, the cheapest marketplace plan runs about $${bestMarketplaceMonthly}/mo. Share what your employer plan costs you and I'll compare.`
        : `The cheapest marketplace plan runs about $${bestMarketplaceMonthly}/mo before any employer comparison.`;
  } else if (bestMarketplaceMonthly < employer) {
    verdict = `The marketplace wins here: about $${employer - bestMarketplaceMonthly}/mo cheaper than your employer's offer (and you keep the subsidy).`;
  } else {
    verdict = `Your employer offer is the better deal: about $${bestMarketplaceMonthly - employer}/mo cheaper than the best marketplace option, since employer plans aren't subsidy-eligible for you.`;
  }

  return {
    state: profile.state,
    planCount: plans.length,
    issuers: new Set(plans.map((p) => p.issuer)).size,
    employerOfferMonthly: employer,
    bestMarketplaceMonthly,
    verdict,
  };
}
