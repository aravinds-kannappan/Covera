import type { Plan, PatientProfile } from "@/lib/types";
import { optimize, type OptimizeResult, type OptimizeOptions } from "@/lib/sim/optimize";
import { hashSeed } from "@/lib/sim/random";

// A small LRU over optimize(). Rankings are a pure, deterministic function of
// (profile, plan set, options), so identical requests — common archetypes, a repeated
// what-if, a page reload, two people with the same situation — return instantly instead of
// re-running the Monte-Carlo simulation. This is what lets the engine scale to high traffic
// and national plan counts: most requests become a hash lookup.

const MAX_ENTRIES = 200;
const cache = new Map<string, OptimizeResult>();

/** Stable key over every input that changes the ranking (providers do not, today). */
function cacheKey(profile: PatientProfile, plans: Plan[], opts: OptimizeOptions): string {
  const shape = {
    a: profile.age,
    s: profile.sex,
    st: profile.state,
    inc: profile.annualIncome,
    hh: profile.householdSize,
    tob: profile.tobacco,
    c: [...profile.conditions].sort(),
    e: [...profile.plannedEvents].sort(),
    m: profile.prescriptions.map((x) => `${x.name}:${x.tier}:${x.fillsPerYear}`).sort(),
    r: profile.riskTolerance,
    hsa: Boolean(profile.requireHsa),
    o: [opts.nCoarse ?? 0, opts.nFine ?? 0, opts.topK ?? 0],
    n: plans.length, // plan-set size is a cheap identity proxy for the bundled state data
  };
  return String(hashSeed(JSON.stringify(shape)));
}

/** optimize(), memoized. Same inputs return the cached result (reference-equal). */
export function optimizeCached(
  profile: PatientProfile,
  plans: Plan[],
  opts: OptimizeOptions = {},
): OptimizeResult {
  const key = cacheKey(profile, plans, opts);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // re-insert to mark most-recently-used
    cache.set(key, hit);
    return hit;
  }
  const result = optimize(profile, plans, opts);
  cache.set(key, result);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}

export function clearOptimizeCache(): void {
  cache.clear();
}

export function optimizeCacheSize(): number {
  return cache.size;
}
