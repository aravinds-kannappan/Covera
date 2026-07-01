import type { DrugTier, Plan, Prescription } from "@/lib/types";

// Formulary and network matching.
//
// The single biggest real-world reason people pick the wrong plan is not the cost math: it
// is "does this plan cover my drug, and is my doctor in network." These functions answer
// both. They consume optional per-plan formulary/network data (populated once a CMS QHP
// formulary + provider-network source is ingested) and degrade gracefully when it is
// absent: an unknown formulary is treated as "assume covered" rather than a false alarm, so
// rankings never regress on the data we do not yet have.

export interface DrugCoverage {
  /** True if every requested drug is on the plan's formulary (or the formulary is unknown). */
  coversAll: boolean;
  /** Drugs the plan explicitly does not cover. */
  notCovered: string[];
  /** Drugs covered, but at a higher (costlier) tier than the patient currently has. */
  tierChanges: { name: string; from: DrugTier; to: DrugTier }[];
  /** Whether the plan actually had formulary data to check against. */
  known: boolean;
}

const TIER_RANK: Record<DrugTier, number> = {
  genericDrugs: 0,
  preferredBrandDrugs: 1,
  nonPreferredBrandDrugs: 2,
  specialtyDrugs: 3,
};

export function drugCoverage(plan: Plan, prescriptions: Prescription[]): DrugCoverage {
  if (!plan.formulary || prescriptions.length === 0) {
    return { coversAll: true, notCovered: [], tierChanges: [], known: !!plan.formulary };
  }
  const notCovered: string[] = [];
  const tierChanges: DrugCoverage["tierChanges"] = [];
  for (const rx of prescriptions) {
    const entry = plan.formulary[rx.name.toLowerCase()];
    if (entry === undefined) continue; // not listed: unknown, do not penalize
    if (entry === "notCovered") {
      notCovered.push(rx.name);
    } else if (TIER_RANK[entry] > TIER_RANK[rx.tier]) {
      tierChanges.push({ name: rx.name, from: rx.tier, to: entry });
    }
  }
  return { coversAll: notCovered.length === 0, notCovered, tierChanges, known: true };
}

export interface NetworkCoverage {
  /** True if every provider the patient named is in network (or the network is unknown). */
  allInNetwork: boolean;
  outOfNetwork: string[];
  known: boolean;
}

export function networkCoverage(plan: Plan, providers: string[]): NetworkCoverage {
  if (!plan.network || providers.length === 0) {
    return { allInNetwork: true, outOfNetwork: [], known: !!plan.network };
  }
  const inNet = plan.network.map((p) => p.toLowerCase());
  const outOfNetwork = providers.filter(
    (p) => !inNet.some((n) => n.includes(p.toLowerCase()) || p.toLowerCase().includes(n)),
  );
  return { allInNetwork: outOfNetwork.length === 0, outOfNetwork, known: true };
}

// Annual-dollar penalties applied to a plan's ranking score when it fails to cover a
// patient's real drug or provider. A dropped drug or a lost doctor is a first-order
// mistake, so these dominate small cost-math differences (but only fire when we have data).
export const COVERAGE_PENALTY = {
  drugNotCovered: 6000,
  drugTierBump: 1200,
  providerOutOfNetwork: 3500,
} as const;

/** Total ranking penalty for a plan given the patient's drugs and providers. */
export function coveragePenalty(plan: Plan, prescriptions: Prescription[], providers: string[]): number {
  const drug = drugCoverage(plan, prescriptions);
  const net = networkCoverage(plan, providers);
  return (
    drug.notCovered.length * COVERAGE_PENALTY.drugNotCovered +
    drug.tierChanges.length * COVERAGE_PENALTY.drugTierBump +
    net.outOfNetwork.length * COVERAGE_PENALTY.providerOutOfNetwork
  );
}
