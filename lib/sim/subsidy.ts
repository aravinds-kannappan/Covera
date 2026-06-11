import type { Plan, PatientProfile } from "@/lib/types";

// 2025 HHS federal poverty guidelines (48 contiguous states), used for 2026 coverage.
const FPL_BASE = 15650;
const FPL_PER_PERSON = 5500;

export function federalPovertyLevel(householdSize: number): number {
  return FPL_BASE + FPL_PER_PERSON * Math.max(0, householdSize - 1);
}

/**
 * Applicable percentage of income a household is expected to contribute toward
 * the benchmark plan, on the enhanced (ARPA) sliding scale: 0% at/under 150%
 * FPL rising to 8.5% at 400% FPL and held flat above (no subsidy cliff).
 */
export function applicablePercent(fplRatio: number): number {
  const pts: [number, number][] = [
    [1.5, 0.0],
    [2.0, 0.02],
    [2.5, 0.04],
    [3.0, 0.06],
    [4.0, 0.085],
  ];
  if (fplRatio <= pts[0][0]) return 0;
  if (fplRatio >= 4.0) return 0.085;
  for (let i = 1; i < pts.length; i++) {
    if (fplRatio <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (fplRatio - x0)) / (x1 - x0);
    }
  }
  return 0.085;
}

const RATE_AGE_KEYS_CACHE = new Map<string, string>();

/** Map a real age to the CMS rate bucket key present on a plan. */
export function pickPremium(plan: Plan, age: number): number {
  const keys = plan.premiumByAge;
  let key: string;
  if (age <= 14) key = "0-14";
  else if (age >= 64) key = "64 and over";
  else key = String(age);
  if (keys[key] != null) return keys[key];
  // Nearest-available fallback.
  const cacheKey = `${age}:${Object.keys(keys).length}`;
  if (RATE_AGE_KEYS_CACHE.has(cacheKey)) {
    const k = RATE_AGE_KEYS_CACHE.get(cacheKey)!;
    if (keys[k] != null) return keys[k];
  }
  let best: string | null = null;
  let bestDist = Infinity;
  for (const k of Object.keys(keys)) {
    const n = parseInt(k, 10);
    const d = Number.isFinite(n) ? Math.abs(n - age) : 50;
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  if (best) {
    RATE_AGE_KEYS_CACHE.set(cacheKey, best);
    return keys[best];
  }
  return Object.values(keys)[0] ?? 0;
}

/** Second-lowest-cost Silver plan premium (the APTC benchmark) at the patient's age. */
export function computeSLCSP(plans: Plan[], age: number): number {
  const silver = plans
    .filter((p) => p.metal === "Silver")
    .map((p) => pickPremium(p, age))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  if (silver.length === 0) return 0;
  return silver[Math.min(1, silver.length - 1)];
}

export interface SubsidyResult {
  fplRatio: number;
  applicablePercent: number;
  slcspMonthly: number;
  aptcMonthly: number;
}

export function computeSubsidy(
  profile: PatientProfile,
  plans: Plan[],
): SubsidyResult {
  const fpl = federalPovertyLevel(profile.householdSize);
  const fplRatio = fpl > 0 ? profile.annualIncome / fpl : 99;
  const pct = applicablePercent(fplRatio);
  const slcspMonthly = computeSLCSP(plans, profile.age);
  const expectedAnnualContribution = profile.annualIncome * pct;
  const aptcAnnual = Math.max(0, slcspMonthly * 12 - expectedAnnualContribution);
  return {
    fplRatio,
    applicablePercent: pct,
    slcspMonthly,
    aptcMonthly: aptcAnnual / 12,
  };
}

/** Net monthly premium after APTC. APTC cannot apply to Catastrophic plans. */
export function netPremium(plan: Plan, age: number, aptcMonthly: number): number {
  const gross = pickPremium(plan, age);
  if (plan.metal === "Catastrophic") return gross;
  return Math.max(0, gross - aptcMonthly);
}
