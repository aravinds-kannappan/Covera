import type { PatientProfile, ServiceKey } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { MEPS, ageBandKey, type MedAddition } from "@/lib/sim/params";
import { lognormal, normal, poisson, type Rng } from "@/lib/sim/random";

/**
 * Where a dollar of modeled care came from. This lets the cost waterfall attribute spend to
 * the things a patient recognizes (my meds, a planned surgery) rather than opaque totals.
 */
export type CareSource =
  | "acute" // frequency-sampled visits/labs/ER/imaging/inpatient (incl. condition-elevated rates)
  | "chronicCare" // maintenance meds a condition implies (e.g. metformin for diabetes)
  | "prescriptions" // the patient's own listed prescriptions
  | "plannedEvents"; // guaranteed events from a planned surgery or delivery

export const CARE_SOURCES: CareSource[] = [
  "acute",
  "chronicCare",
  "prescriptions",
  "plannedEvents",
];

/** One simulated year: allowed-dollar amounts grouped by service line. */
export interface Scenario {
  byService: Partial<Record<ServiceKey, number[]>>;
  totalAllowed: number;
  /**
   * Allowed dollars this year attributed to each care source (for the audit waterfall).
   * Optional so hand-built scenarios (tests, synthetic bundles) stay terse; the sampler
   * always populates it.
   */
  bySource?: Record<CareSource, number>;
}

export interface UtilizationModel {
  /** Expected number of events per year by service (post conditions/events). */
  expectedFreq: Record<ServiceKey, number>;
  /** Chronic medications taken every year (deterministic fills). */
  chronicMeds: MedAddition[];
  /** Guaranteed events from planned events (e.g., a delivery admission). */
  guaranteed: { service: ServiceKey; count: number; allowedOverride?: number }[];
}

/** Translate a patient profile into expected utilization. */
export function buildUtilization(profile: PatientProfile): UtilizationModel {
  const band = ageBandKey(profile.age);
  const expectedFreq = {} as Record<ServiceKey, number>;
  for (const s of SERVICE_KEYS) expectedFreq[s] = MEPS.services[s].freq[band];

  // Condition effects: multiply / add frequencies, accumulate inpatient risk.
  for (const c of profile.conditions) {
    const cp = MEPS.conditions[c];
    if (!cp) continue;
    if (cp.freqMult)
      for (const [s, m] of Object.entries(cp.freqMult))
        expectedFreq[s as ServiceKey] *= m as number;
    if (cp.freqAdd)
      for (const [s, a] of Object.entries(cp.freqAdd))
        expectedFreq[s as ServiceKey] += a as number;
    if (cp.extraInpatientProb) expectedFreq.inpatient += cp.extraInpatientProb;
  }

  // Planned events: add frequencies; collect guaranteed events.
  const guaranteed: UtilizationModel["guaranteed"] = [];
  for (const e of profile.plannedEvents) {
    const ep = MEPS.plannedEvents[e];
    if (!ep) continue;
    if (ep.freqAdd)
      for (const [s, a] of Object.entries(ep.freqAdd))
        expectedFreq[s as ServiceKey] += a as number;
    if (ep.guaranteedEvents) guaranteed.push(...ep.guaranteedEvents);
  }

  // Chronic meds = condition-implied + patient-listed, deduped by name. Source is retained so
  // the audit waterfall can separate "your prescriptions" from meds a condition implies.
  const meds = new Map<string, MedAddition>();
  for (const c of profile.conditions)
    for (const m of MEPS.conditions[c]?.addMeds ?? []) {
      const k = m.name.toLowerCase();
      if (!meds.has(k) || meds.get(k)!.fillsPerYear < m.fillsPerYear)
        meds.set(k, { ...m, source: "condition" });
    }
  for (const p of profile.prescriptions) {
    const k = p.name.toLowerCase();
    // A drug the patient explicitly listed is "their prescription" even if a condition also
    // implies it: keep the patient source (and the larger fill count) so the waterfall
    // attributes it to them rather than folding it into generic chronic care.
    const existingFills = meds.get(k)?.fillsPerYear ?? 0;
    meds.set(k, {
      tier: p.tier,
      fillsPerYear: Math.max(p.fillsPerYear, existingFills),
      name: p.name,
      source: "patient",
    });
  }

  return { expectedFreq, chronicMeds: [...meds.values()], guaranteed };
}

function emptyBySource(): Record<CareSource, number> {
  return { acute: 0, chronicCare: 0, prescriptions: 0, plannedEvents: 0 };
}

function push(scn: Scenario, service: ServiceKey, allowed: number, source: CareSource) {
  (scn.byService[service] ??= []).push(allowed);
  scn.totalAllowed += allowed;
  if (scn.bySource) scn.bySource[source] += allowed;
}

/**
 * Draw one simulated year of care from the model.
 *
 * `frailtyZ` optionally pins the standard-normal draw behind the person-year frailty
 * multiplier. Leaving it undefined draws a fresh one (plain Monte-Carlo). Supplying it lets
 * the caller run antithetic pairs (Z and -Z), which is the dominant variance-reduction
 * lever here: frailty is the single latent factor that a whole year's cost hinges on, so
 * pairing a bad-luck year with its mirror image collapses the noise in the mean estimate.
 */
export function sampleScenario(
  rng: Rng,
  model: UtilizationModel,
  frailtyZ?: number,
): Scenario {
  const scn: Scenario = { byService: {}, totalAllowed: 0, bySource: emptyBySource() };

  // Person-year frailty: one mean-1, right-skewed multiplier shared across every acute
  // service this year. It makes a year's risk correlated (a bad year is bad across the
  // board) instead of independent per service: the only way independent Poissons can
  // reproduce the real MEPS concentration (top 5% of people ≈ 50% of spend) and the
  // catastrophic tail. Mean 1 keeps age-band mean spend on target; sigma sets the skew.
  // Parameterized by median so the lognormal's MEAN is exactly 1 (median = e^(-σ²/2)).
  const fSigma = MEPS.frailty.sigma;
  const z = frailtyZ ?? normal(rng);
  const frailty = Math.exp(-(fSigma * fSigma) / 2) * Math.exp(fSigma * z);

  for (const s of SERVICE_KEYS) {
    const count = poisson(rng, Math.max(0, model.expectedFreq[s] * frailty));
    if (count === 0) continue;
    const { allowedMedian, allowedSigma } = MEPS.services[s];
    for (let i = 0; i < count; i++)
      push(scn, s, lognormal(rng, allowedMedian, allowedSigma), "acute");
  }

  // Chronic meds: deterministic fills, each with sampled allowed amount. Patient-listed drugs
  // are attributed to "prescriptions"; condition-implied maintenance drugs to "chronicCare".
  for (const m of model.chronicMeds) {
    const { allowedMedian, allowedSigma } = MEPS.services[m.tier];
    const src: CareSource = m.source === "patient" ? "prescriptions" : "chronicCare";
    for (let i = 0; i < m.fillsPerYear; i++)
      push(scn, m.tier, lognormal(rng, allowedMedian, allowedSigma), src);
  }

  // Guaranteed events (planned surgery, delivery, ...).
  for (const g of model.guaranteed) {
    const sp = MEPS.services[g.service];
    for (let i = 0; i < g.count; i++)
      push(
        scn,
        g.service,
        g.allowedOverride ?? lognormal(rng, sp.allowedMedian, sp.allowedSigma),
        "plannedEvents",
      );
  }

  return scn;
}

export function sampleScenarios(
  rng: Rng,
  model: UtilizationModel,
  n: number,
): Scenario[] {
  const out: Scenario[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = sampleScenario(rng, model);
  return out;
}

/**
 * Antithetic variant: draws n years as n/2 mirror-image pairs sharing a frailty draw of
 * +Z and -Z. Consecutive entries (2j, 2j+1) form one pair, which the estimator layer uses
 * to report the realized variance reduction. Same expectation as `sampleScenarios`,
 * lower-variance mean, and still fully deterministic under a seeded rng.
 */
export function sampleScenariosAntithetic(
  rng: Rng,
  model: UtilizationModel,
  n: number,
): Scenario[] {
  const out: Scenario[] = new Array(n);
  for (let i = 0; i < n; i += 2) {
    const z = normal(rng);
    out[i] = sampleScenario(rng, model, z);
    if (i + 1 < n) out[i + 1] = sampleScenario(rng, model, -z);
  }
  return out;
}
