// Estimators that go past "resample and average".
//
// Plain Monte-Carlo gives you a mean and a histogram. For an insurance decision that is not
// enough: the number that should move a risk-averse patient is what a genuinely bad year
// costs, and a mean with no error bar can flip a ranking on sampling noise alone. This
// module adds three things on top of the raw draws:
//
//   1. Coherent tail risk (CVaR / expected shortfall), not just a single p90 point.
//   2. Standard errors on the mean and the p90, so we know when two plans are a real tie.
//   3. A measured variance-reduction ratio for antithetic sampling, so the extra structure
//      pays for itself in effective sample size rather than just "giving power to the work".
//
// Everything here is deterministic math over an array of totals. No LLM, no trained model.

/** Population variance of a sample (divide by n; these are full enumerations of draws). */
export function variance(xs: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  let mean = 0;
  for (const x of xs) mean += x;
  mean /= n;
  let v = 0;
  for (const x of xs) v += (x - mean) ** 2;
  return v / n;
}

/** Standard error of the sample mean: sqrt(Var / n). */
export function meanStdErr(xs: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  return Math.sqrt(variance(xs) / n);
}

/**
 * Conditional Value at Risk (a.k.a. expected shortfall): the average outcome in the worst
 * `alpha` fraction of years. `sortedAsc` must be ascending. CVaR is a coherent risk measure
 * (sub-additive, convex), which p90 is not, so ranking risk-averse patients on it is sound.
 */
export function cvar(sortedAsc: number[], alpha: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const tailCount = Math.max(1, Math.round(alpha * n));
  let s = 0;
  for (let i = n - tailCount; i < n; i++) s += sortedAsc[i];
  return s / tailCount;
}

/**
 * Asymptotic standard error of a sample quantile: SE(x_p) = sqrt(p(1-p)/n) / f(x_p), with
 * the density f estimated from the spacing of the sorted sample around the quantile. This
 * is what tells us whether one plan's "bad year" is really worse than another's or just
 * noise. `sortedAsc` must be ascending.
 */
export function quantileStdErr(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n < 8) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.floor(p * n)));
  // Symmetric window carrying ~10% of the mass to estimate the local density.
  const k = Math.max(2, Math.round(0.05 * n));
  const lo = Math.max(0, idx - k);
  const hi = Math.min(n - 1, idx + k);
  const spread = sortedAsc[hi] - sortedAsc[lo];
  if (spread <= 0) return 0;
  const density = (hi - lo) / n / spread; // (probability mass) / (dollar spread)
  return Math.sqrt((p * (1 - p)) / n) / density;
}

export interface AntitheticGain {
  /** Var(iid mean) / Var(antithetic mean) at the same draw count. >= 1 means it helped. */
  ratio: number;
  /** Draw count scaled by the ratio: how many plain draws this estimate is worth. */
  effectiveSampleSize: number;
}

/**
 * Measure the variance reduction from antithetic sampling. `totals` is assumed laid out as
 * consecutive mirror-image pairs (2j, 2j+1), the layout `sampleScenariosAntithetic`
 * produces. We compare the variance of the antithetic mean estimator against the variance a
 * plain iid mean of the same size would have. A ratio of 1.0 (the honest default) is what
 * you get if the draws were not actually paired.
 */
export function antitheticGain(totals: number[]): AntitheticGain {
  const n = totals.length;
  const pairs = Math.floor(n / 2);
  if (pairs < 2) return { ratio: 1, effectiveSampleSize: n };
  const pairMeans = new Array<number>(pairs);
  for (let j = 0; j < pairs; j++) pairMeans[j] = (totals[2 * j] + totals[2 * j + 1]) / 2;
  const allVar = variance(totals.slice(0, 2 * pairs));
  const pairVar = variance(pairMeans);
  // Var(antithetic mean) = pairVar / pairs; Var(iid mean, same n) = allVar / (2*pairs).
  // ratio = allVar / (2 * pairVar).
  const ratio = pairVar > 0 ? allVar / (2 * pairVar) : 1;
  const safe = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return { ratio: safe, effectiveSampleSize: n * safe };
}
