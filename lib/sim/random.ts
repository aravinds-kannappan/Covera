// Deterministic, seedable RNG + samplers. Seeding makes every simulation
// reproducible, so the same profile always yields the same ranking.

export type Rng = () => number;

/** mulberry32 — small, fast, well-distributed PRNG. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function normal(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Lognormal parameterized by its median and the log-space sigma.
 * median = exp(mu)  =>  value = median * exp(sigma * Z).
 */
export function lognormal(rng: Rng, median: number, sigma: number): number {
  return median * Math.exp(sigma * normal(rng));
}

/** Poisson (Knuth) — fine for the small rates used here. */
export function poisson(rng: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    // Normal approximation for large lambda.
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rng)));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Hash a string to a 32-bit int, for deriving a stable seed from a profile. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
