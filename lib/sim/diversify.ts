import type { PatientProfile, RankedPlan } from "@/lib/types";

// Why this exists: the optimizer keeps the top ~24 plans, but a marketplace is full of
// near-identical products (the same issuer's Silver at three trivially different deductibles,
// or five carriers landing within $50 of each other). Showing all of them is the "20 options
// at the same price" problem: it looks like choice but is noise. This module collapses the
// twins and then picks a small, genuinely DIFFERENT set that spans the cost/risk tradeoff and
// the choices a person actually makes (cheapest, safest, HSA), each with a reason to exist.

export interface CuratedPlan {
  ranked: RankedPlan;
  /** Short role label for the card, e.g. "Best overall", "Safest bad year". */
  tag?: string;
  /** One-line reason this plan earns a distinct slot. */
  roleReason?: string;
}

/** Coherent bad-year cost, preferring CVaR and falling back to p90. */
function tailCost(r: RankedPlan): number {
  return r.sim.cvar90 ?? r.sim.p90;
}

/**
 * Collapse near-duplicate products. Two plans are twins if they are the same issuer, metal,
 * and plan type with deductible and out-of-pocket max in the same ~$1k bucket. Among twins we
 * keep the best-scoring one: the rest add nothing a shopper can act on.
 */
export function dedupeNearTwins(ranked: RankedPlan[]): RankedPlan[] {
  const best = new Map<string, RankedPlan>();
  for (const r of ranked) {
    const key = [
      r.plan.issuer,
      r.plan.metal,
      r.plan.planType,
      Math.round(r.plan.deductible / 1000),
      Math.round(r.plan.oopMax / 1000),
    ].join("|");
    const cur = best.get(key);
    if (!cur || r.score < cur.score) best.set(key, r);
  }
  // Preserve the incoming score order.
  return ranked.filter((r) => best.get(
    [r.plan.issuer, r.plan.metal, r.plan.planType, Math.round(r.plan.deductible / 1000), Math.round(r.plan.oopMax / 1000)].join("|"),
  ) === r);
}

/**
 * Curate a small, diverse shortlist from the ranked plans.
 *
 * 1. Drop near-twins.
 * 2. Seat the anchor roles a shopper reasons in: best overall, safest bad year, lowest
 *    premium, and (when relevant) the best HSA-eligible plan.
 * 3. Fill any remaining slots by greedily maximizing spread across the (expected cost,
 *    bad-year cost) plane, capped per metal so it never becomes five Silvers.
 */
export function curateShortlist(
  ranked: RankedPlan[],
  profile: PatientProfile,
  count = 6,
): CuratedPlan[] {
  const pool = dedupeNearTwins(ranked);
  if (pool.length === 0) return [];
  if (pool.length <= count) {
    // Still label the roles, but show everything.
    return withAnchorTags(pool, profile);
  }

  const chosen: RankedPlan[] = [];
  const take = (r: RankedPlan | undefined) => {
    if (r && !chosen.includes(r)) chosen.push(r);
  };

  // --- Anchors (order = priority) ---
  take(pool[0]); // best overall (already governed to the front)
  take([...pool].sort((a, b) => tailCost(a) - tailCost(b))[0]); // safest bad year
  take([...pool].sort((a, b) => a.sim.annualPremium - b.sim.annualPremium)[0]); // cheapest premium
  const hsaBest = pool.filter((r) => r.plan.hsaEligible).sort((a, b) => a.score - b.score)[0];
  if (profile.requireHsa || hsaBest) take(hsaBest); // an HSA option when one exists

  // --- Fill the rest by max-min diversity in normalized cost/risk space, capping per metal ---
  const xs = pool.map((r) => r.sim.expectedTotal);
  const ys = pool.map(tailCost);
  const nx = norm(xs);
  const ny = norm(ys);
  const coord = new Map<RankedPlan, [number, number]>();
  pool.forEach((r, i) => coord.set(r, [nx(xs[i]), ny(ys[i])]));

  const metalCap = Math.max(2, Math.ceil(count / 3));
  const metalCount = () => {
    const m: Record<string, number> = {};
    for (const r of chosen) m[r.plan.metal] = (m[r.plan.metal] ?? 0) + 1;
    return m;
  };

  while (chosen.length < count) {
    const caps = metalCount();
    let bestPlan: RankedPlan | null = null;
    let bestDist = -1;
    for (const r of pool) {
      if (chosen.includes(r)) continue;
      if ((caps[r.plan.metal] ?? 0) >= metalCap) continue;
      const [px, py] = coord.get(r)!;
      let minD = Infinity;
      for (const c of chosen) {
        const [cx, cy] = coord.get(c)!;
        minD = Math.min(minD, (px - cx) ** 2 + (py - cy) ** 2);
      }
      if (minD > bestDist) {
        bestDist = minD;
        bestPlan = r;
      }
    }
    if (!bestPlan) break; // metal caps exhausted the pool
    chosen.push(bestPlan);
  }

  // Present in score order for a sensible reading order, then tag roles.
  chosen.sort((a, b) => a.score - b.score);
  return withAnchorTags(chosen, profile);
}

/** Attach role tags to an already-chosen set. */
function withAnchorTags(plans: RankedPlan[], profile: PatientProfile): CuratedPlan[] {
  if (plans.length === 0) return [];
  const best = plans.reduce((a, b) => (a.score <= b.score ? a : b));
  const safest = plans.reduce((a, b) => (tailCost(a) <= tailCost(b) ? a : b));
  const cheapest = plans.reduce((a, b) =>
    a.sim.annualPremium <= b.sim.annualPremium ? a : b,
  );
  const hsa = plans
    .filter((r) => r.plan.hsaEligible)
    .sort((a, b) => a.score - b.score)[0];

  return plans.map((r) => {
    let tag: string | undefined;
    let roleReason: string | undefined;
    if (r === best) {
      tag = "Best overall";
      roleReason = "Lowest risk-adjusted cost after the safety checks.";
    } else if (r === safest) {
      tag = "Safest bad year";
      roleReason = "Smallest cost in the worst 10% of years.";
    } else if (r === cheapest) {
      tag = "Lowest premium";
      roleReason = "Cheapest monthly premium on the shortlist.";
    } else if (hsa && r === hsa && (profile.requireHsa || r.plan.hsaEligible)) {
      tag = "HSA-eligible";
      roleReason = "Best HSA-eligible option, for tax-advantaged saving.";
    }
    return { ranked: r, tag, roleReason };
  });
}

/** Build a [0,1] normalizer over a numeric column (flat column maps to 0.5). */
function norm(xs: number[]): (v: number) => number {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = hi - lo;
  return (v: number) => (span > 0 ? (v - lo) / span : 0.5);
}
