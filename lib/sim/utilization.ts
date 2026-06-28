import type { PatientProfile, ServiceKey } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import { MEPS, ageBandKey, type MedAddition } from "@/lib/sim/params";
import { lognormal, poisson, type Rng } from "@/lib/sim/random";

/** One simulated year: allowed-dollar amounts grouped by service line. */
export interface Scenario {
  byService: Partial<Record<ServiceKey, number[]>>;
  totalAllowed: number;
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

  // Chronic meds = condition-implied + patient-listed, deduped by name.
  const meds = new Map<string, MedAddition>();
  for (const c of profile.conditions)
    for (const m of MEPS.conditions[c]?.addMeds ?? []) {
      const k = m.name.toLowerCase();
      if (!meds.has(k) || meds.get(k)!.fillsPerYear < m.fillsPerYear)
        meds.set(k, m);
    }
  for (const p of profile.prescriptions) {
    const k = p.name.toLowerCase();
    const m = { tier: p.tier, fillsPerYear: p.fillsPerYear, name: p.name };
    if (!meds.has(k) || meds.get(k)!.fillsPerYear < m.fillsPerYear) meds.set(k, m);
  }

  return { expectedFreq, chronicMeds: [...meds.values()], guaranteed };
}

function push(scn: Scenario, service: ServiceKey, allowed: number) {
  (scn.byService[service] ??= []).push(allowed);
  scn.totalAllowed += allowed;
}

/** Draw one simulated year of care from the model. */
export function sampleScenario(rng: Rng, model: UtilizationModel): Scenario {
  const scn: Scenario = { byService: {}, totalAllowed: 0 };

  // Person-year frailty: one mean-1, right-skewed multiplier shared across every acute
  // service this year. It makes a year's risk correlated (a bad year is bad across the
  // board) instead of independent per service: the only way independent Poissons can
  // reproduce the real MEPS concentration (top 5% of people ≈ 50% of spend) and the
  // catastrophic tail. Mean 1 keeps age-band mean spend on target; sigma sets the skew.
  // Parameterized by median so the lognormal's MEAN is exactly 1 (median = e^(-σ²/2)).
  const fSigma = MEPS.frailty.sigma;
  const frailty = lognormal(rng, Math.exp(-(fSigma * fSigma) / 2), fSigma);

  for (const s of SERVICE_KEYS) {
    const count = poisson(rng, Math.max(0, model.expectedFreq[s] * frailty));
    if (count === 0) continue;
    const { allowedMedian, allowedSigma } = MEPS.services[s];
    for (let i = 0; i < count; i++)
      push(scn, s, lognormal(rng, allowedMedian, allowedSigma));
  }

  // Chronic meds: deterministic fills, each with sampled allowed amount.
  for (const m of model.chronicMeds) {
    const { allowedMedian, allowedSigma } = MEPS.services[m.tier];
    for (let i = 0; i < m.fillsPerYear; i++)
      push(scn, m.tier, lognormal(rng, allowedMedian, allowedSigma));
  }

  // Guaranteed events (planned surgery, delivery, ...).
  for (const g of model.guaranteed) {
    const sp = MEPS.services[g.service];
    for (let i = 0; i < g.count; i++)
      push(
        scn,
        g.service,
        g.allowedOverride ?? lognormal(rng, sp.allowedMedian, sp.allowedSigma),
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
