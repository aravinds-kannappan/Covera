/**
 * Held-out calibration validator.
 *
 * The cost-model parameters (data/meps-params.json) are FIT on MEPS 2021+2022
 * (scripts/calibrate/fit_params.py). This script runs the real TypeScript
 * simulation with those fitted params and scores it against the HELD-OUT 2023
 * MEPS aggregates it never saw, writing data/calibration-report.json.
 *
 * This is the honest trust metric. npm run accuracy checks the simulation against
 * the same aggregates the params were tuned to (self-consistency); this checks
 * generalization to an unseen year. If the held-out error is close to the train
 * error, the model is not overfit and the simulation can be trusted.
 *
 *   npx tsx scripts/calibrate/validate_holdout.ts   (no key or network)
 *
 * Reads data/calibration-targets.json (real per-year aggregates emitted by the
 * Python fitter), so no microdata or pandas is needed here.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { PatientProfile } from "@/lib/types";
import { makeRng } from "@/lib/sim/random";
import { buildUtilization, sampleScenario } from "@/lib/sim/utilization";
import type { CalibrationMetric, CalibrationReport } from "@/lib/benchmark/types";

const N_PER_SPLIT = 120_000;
const BANDS = [
  { key: "0-17", lo: 0, hi: 17 },
  { key: "18-44", lo: 18, hi: 44 },
  { key: "45-64", lo: 45, hi: 64 },
  { key: "65+", lo: 65, hi: 90 },
] as const;

interface SplitTargets {
  ageBandMean: Record<string, number>;
  ageShares: Record<string, number>;
  concentration: {
    meanAnnual: number;
    medianAnnual: number;
    top1pct: number;
    top5pct: number;
    top10pct: number;
    bottom50pct: number;
  };
}
interface Targets {
  train: SplitTargets & { years: number[] };
  holdout: SplitTargets & { year: number };
}

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

/** Simulate one person-year of medical+Rx allowed spend for a given age. */
function simYear(rng: () => number, age: number): number {
  return sampleScenario(rng, buildUtilization(baseProfile(age))).totalAllowed;
}

/** Draw a population whose age mix matches `shares`, and return per-person totals + per-band means. */
function simulatePopulation(shares: Record<string, number>, seed: number) {
  const rng = makeRng(seed);
  const totals: number[] = [];
  const byBand: Record<string, number[]> = {};
  for (const b of BANDS) byBand[b.key] = [];
  for (let i = 0; i < N_PER_SPLIT; i++) {
    // pick a band by its share, then a uniform age within it
    let r = rng();
    let band = BANDS[BANDS.length - 1];
    for (const b of BANDS) {
      const s = shares[b.key] ?? 0;
      if (r < s) {
        band = b;
        break;
      }
      r -= s;
    }
    const age = band.lo + Math.floor(rng() * (band.hi - band.lo + 1));
    const spend = simYear(rng, age);
    totals.push(spend);
    byBand[band.key].push(spend);
  }
  return { totals, byBand };
}

function concentrationOf(totals: number[]) {
  const sorted = [...totals].sort((a, b) => b - a); // descending
  const total = sorted.reduce((s, x) => s + x, 0);
  const topShare = (f: number) => {
    const n = Math.max(1, Math.floor(sorted.length * f));
    return sorted.slice(0, n).reduce((s, x) => s + x, 0) / total;
  };
  const bottomShare = (f: number) => {
    const n = Math.max(1, Math.floor(sorted.length * f));
    return sorted.slice(sorted.length - n).reduce((s, x) => s + x, 0) / total;
  };
  const asc = [...totals].sort((a, b) => a - b);
  return {
    meanAnnual: total / totals.length,
    medianAnnual: asc[Math.floor(asc.length / 2)],
    top1pct: topShare(0.01),
    top5pct: topShare(0.05),
    top10pct: topShare(0.1),
    bottom50pct: bottomShare(0.5),
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Build the comparison metrics for one split. */
function metricsFor(split: SplitTargets, seed: number): CalibrationMetric[] {
  const { totals, byBand } = simulatePopulation(split.ageShares, seed);
  const conc = concentrationOf(totals);
  const out: CalibrationMetric[] = [];

  const dollar = (label: string, simulated: number, real: number, tol = 0.15) => {
    const pctError = real ? Math.abs(simulated - real) / real : 0;
    out.push({ label, simulated: Math.round(simulated), real: Math.round(real), unit: "$", pctError: +pctError.toFixed(3), pass: pctError <= tol });
  };
  const pct = (label: string, simulated: number, real: number, tolAbs = 0.05) => {
    const pctError = real ? Math.abs(simulated - real) / real : 0;
    out.push({ label, simulated: +(simulated * 100).toFixed(1), real: +(real * 100).toFixed(1), unit: "%", pctError: +pctError.toFixed(3), pass: Math.abs(simulated - real) <= tolAbs });
  };

  for (const b of BANDS) dollar(`Age ${b.key} mean spend`, mean(byBand[b.key]), split.ageBandMean[b.key]);
  dollar("Population mean spend", conc.meanAnnual, split.concentration.meanAnnual);
  pct("Top 1% share of spend", conc.top1pct, split.concentration.top1pct);
  pct("Top 5% share of spend", conc.top5pct, split.concentration.top5pct);
  pct("Top 10% share of spend", conc.top10pct, split.concentration.top10pct);
  return out;
}

function mape(ms: CalibrationMetric[]): number {
  return +(ms.reduce((s, m) => s + m.pctError, 0) / ms.length).toFixed(3);
}

function main() {
  const targetsPath = path.resolve(process.cwd(), "data", "calibration-targets.json");
  const targets = JSON.parse(readFileSync(targetsPath, "utf8")) as Targets;

  console.log("Simulating from fitted params and scoring against held-out 2023 MEPS...");
  const trainMetrics = metricsFor(targets.train, 20260101);
  const holdoutMetrics = metricsFor(targets.holdout, 20230101);

  const all = [...trainMetrics, ...holdoutMetrics];
  const report: CalibrationReport = {
    generatedAt: new Date().toISOString(),
    source:
      "Real TypeScript simulation (lib/sim) run with params fit on MEPS 2021+2022, scored against held-out MEPS 2023 (HC-251). No key or network.",
    trainSplit: `MEPS ${targets.train.years.join(" + ")}`,
    holdoutSplit: `MEPS ${targets.holdout.year} (HC-251)`,
    populationSize: N_PER_SPLIT,
    holdout: holdoutMetrics,
    train: trainMetrics,
    summary: {
      holdoutMape: mape(holdoutMetrics),
      trainMape: mape(trainMetrics),
      passed: all.filter((m) => m.pass).length,
      total: all.length,
    },
  };

  const outDir = path.resolve(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "calibration-report.json"), JSON.stringify(report, null, 2));

  console.log(`\nHeld-out 2023 (the honest test)     train fit (reference)`);
  const pad = (s: string, n: number) => s.padEnd(n);
  for (let i = 0; i < holdoutMetrics.length; i++) {
    const h = holdoutMetrics[i];
    const t = trainMetrics[i];
    const fmt = (m: CalibrationMetric) =>
      `${m.pass ? "PASS" : "FAIL"} sim ${m.unit === "$" ? "$" : ""}${m.simulated}${m.unit === "%" ? "%" : ""} vs ${m.unit === "$" ? "$" : ""}${m.real}${m.unit === "%" ? "%" : ""} (${(m.pctError * 100).toFixed(0)}%)`;
    console.log(`  ${pad(h.label, 26)} ${pad(fmt(h), 40)} ${fmt(t)}`);
  }
  console.log(
    `\nHeld-out MAPE ${(report.summary.holdoutMape * 100).toFixed(1)}%  ·  Train MAPE ${(report.summary.trainMape * 100).toFixed(1)}%  ·  ${report.summary.passed}/${report.summary.total} within tolerance`,
  );
  console.log("→ data/calibration-report.json");
}

main();
