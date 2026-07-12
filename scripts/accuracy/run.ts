/**
 * Simulation-accuracy report.
 *
 * Self-consistency check on the recalibrated engine, plus the ACA subsidy math. The cost
 * parameters in data/meps-params.json are FIT to real MEPS 2021+2022 microdata
 * (scripts/calibrate/fit_params.py); this report confirms the engine, run forward, reproduces
 * the age-band means and concentration those params encode, and that the subsidy formula is
 * exact. No API key or network needed.
 *
 *   npm run accuracy   →   writes data/accuracy-report.json
 *
 * The HONEST generalization test is separate: scripts/calibrate/validate_holdout.ts scores the
 * fitted model against the held-out 2023 MEPS year it never saw (data/calibration-report.json).
 *
 * Methodology note:
 * - The validation population is condition-agnostic (a typical person per age band). The base
 *   frequencies are fit to the real overall MEPS means and the person-year frailty multiplier is
 *   fit to the real concentration, so base + frailty alone reproduces both without layering
 *   synthetic conditions on top (which would double-count spend the base already includes).
 *   Condition and planned-event multipliers are per-patient clinical adjustments, not part of
 *   this population aggregate. Ages follow the real MEPS person-weighted shares.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { PatientProfile } from "@/lib/types";
import { MEPS, ageBandKey } from "@/lib/sim/params";
import { makeRng } from "@/lib/sim/random";
import { buildUtilization, sampleScenario } from "@/lib/sim/utilization";
import { federalPovertyLevel, applicablePercent } from "@/lib/sim/subsidy";
import type { AccuracyReport, Check } from "@/lib/benchmark/types";

const POPULATION = 80_000;

function baseProfile(age: number): PatientProfile {
  return {
    age,
    sex: "female",
    state: "TX",
    householdSize: 1,
    annualIncome: 45000,
    tobacco: false,
    conditions: [],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };
}

// Real MEPS person-weighted age shares (2021+2022 train split, from data/meps-params.json's
// source microdata; see scripts/calibrate). Used to build a representative validation population.
const AGE_SHARES: { key: string; min: number; max: number; share: number }[] = [
  { key: "0-17", min: 1, max: 17, share: 0.219 },
  { key: "18-44", min: 18, max: 44, share: 0.354 },
  { key: "45-64", min: 45, max: 64, share: 0.248 },
  { key: "65+", min: 65, max: 88, share: 0.179 },
];

// Simulate one condition-agnostic population of {age, annual spend}, shared across all checks.
// Base frequency + frailty are calibrated to reproduce the real overall means and concentration;
// conditions are a per-patient adjustment layer and are deliberately not injected here.
function simulatePopulation(): { age: number; spend: number }[] {
  const rng = makeRng(98765);
  const people: { age: number; spend: number }[] = [];
  for (let i = 0; i < POPULATION; i++) {
    let r = rng();
    let band = AGE_SHARES[AGE_SHARES.length - 1];
    for (const b of AGE_SHARES) {
      if (r < b.share) {
        band = b;
        break;
      }
      r -= b.share;
    }
    const age = band.min + Math.floor(rng() * (band.max - band.min + 1));
    const model = buildUtilization(baseProfile(age));
    people.push({ age, spend: sampleScenario(rng, model).totalAllowed });
  }
  return people;
}

function ageBandChecks(pop: { age: number; spend: number }[]): Check[] {
  return MEPS.ageBands.map((band) => {
    const inBand = pop.filter((p) => ageBandKey(p.age) === band.key);
    const mean = inBand.reduce((s, x) => s + x.spend, 0) / Math.max(1, inBand.length);
    const pctError = Math.abs(mean - band.meanAnnualSpend) / band.meanAnnualSpend;
    return {
      label: `Age ${band.key} mean spend`,
      target: band.meanAnnualSpend,
      actual: Math.round(mean),
      unit: "$" as const,
      pass: pctError <= 0.25,
    };
  });
}

function concentration(pop: { age: number; spend: number }[]): { checks: Check[]; size: number } {
  const spends = pop.map((p) => p.spend).sort((a, b) => b - a); // descending
  const total = spends.reduce((s, x) => s + x, 0);
  const topShare = (frac: number) => {
    const n = Math.max(1, Math.floor(spends.length * frac));
    return spends.slice(0, n).reduce((s, x) => s + x, 0) / total;
  };
  const bottomShare = (frac: number) => {
    const n = Math.max(1, Math.floor(spends.length * frac));
    return spends.slice(spends.length - n).reduce((s, x) => s + x, 0) / total;
  };
  const sortedAsc = [...spends].sort((a, b) => a - b);
  const median = sortedAsc[Math.floor(sortedAsc.length / 2)];
  const mean = total / spends.length;
  const c = MEPS.concentration;

  const pctCheck = (label: string, target: number, actual: number, tol = 0.08): Check => ({
    label,
    target: Math.round(target * 100),
    actual: Math.round(actual * 100),
    unit: "%",
    pass: Math.abs(actual - target) <= tol,
  });

  return {
    size: spends.length,
    checks: [
      pctCheck("Top 1% share of spend", c.top1pct, topShare(0.01)),
      pctCheck("Top 5% share of spend", c.top5pct, topShare(0.05)),
      pctCheck("Top 10% share of spend", c.top10pct, topShare(0.1)),
      pctCheck("Bottom 50% share of spend", c.bottom50pct, bottomShare(0.5), 0.05),
      {
        label: "Population mean annual spend",
        target: c.meanAnnual,
        actual: Math.round(mean),
        unit: "$",
        pass: Math.abs(mean - c.meanAnnual) / c.meanAnnual <= 0.3,
      },
      {
        label: "Population median annual spend",
        target: c.medianAnnual,
        actual: Math.round(median),
        unit: "$",
        pass: Math.abs(median - c.medianAnnual) / c.medianAnnual <= 0.5,
      },
    ],
  };
}

// --- 3. Subsidy / APTC formula checks ---------------------------------------------------
function subsidyChecks(): Check[] {
  const near = (label: string, target: number, actual: number, unit: Check["unit"], tol: number): Check => ({
    label,
    target,
    actual: Math.round(actual * 100) / 100,
    unit,
    pass: Math.abs(actual - target) <= tol,
  });
  return [
    near("FPL, household of 1", 15650, federalPovertyLevel(1), "$", 1),
    near("FPL, household of 4", 32150, federalPovertyLevel(4), "$", 1),
    near("Applicable % at 150% FPL", 0, applicablePercent(1.5) * 100, "%", 0.1),
    near("Applicable % at 250% FPL", 4, applicablePercent(2.5) * 100, "%", 0.2),
    near("Applicable % at 400% FPL", 8.5, applicablePercent(4.0) * 100, "%", 0.2),
    near("Applicable % above 400% FPL (capped)", 8.5, applicablePercent(6.0) * 100, "%", 0.2),
  ];
}

function main() {
  console.log("Running simulation-accuracy report…");
  const pop = simulatePopulation();
  const ageBand = ageBandChecks(pop);
  const conc = concentration(pop);
  const subsidy = subsidyChecks();
  const all = [...ageBand, ...conc.checks, ...subsidy];
  const report: AccuracyReport = {
    generatedAt: new Date().toISOString(),
    source: MEPS._provenance.source,
    scenarioCount: POPULATION,
    populationSize: conc.size,
    ageBandCalibration: ageBand,
    concentration: conc.checks,
    subsidy,
    summary: { passed: all.filter((c) => c.pass).length, total: all.length },
  };

  const outDir = path.resolve(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "accuracy-report.json"), JSON.stringify(report, null, 2));

  for (const c of all) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.label}: ${c.actual}${c.unit === "$" ? "" : c.unit} (target ${c.target}${c.unit === "$" ? "" : c.unit})`);
  }
  console.log(`\n${report.summary.passed}/${report.summary.total} checks passed → data/accuracy-report.json`);
}

main();
