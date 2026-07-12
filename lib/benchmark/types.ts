// Shared shapes for the two benchmark reports (simulation accuracy + LLM models) so the
// generator scripts and the /benchmark viewer page agree on one schema.

export interface Check {
  label: string;
  target: number;
  actual: number;
  /** Human units, e.g. "$" or "%". */
  unit: "$" | "%" | "x";
  pass: boolean;
}

export interface AccuracyReport {
  generatedAt: string;
  source: string;
  scenarioCount: number;
  populationSize: number;
  ageBandCalibration: Check[];
  concentration: Check[];
  subsidy: Check[];
  summary: { passed: number; total: number };
}

// Held-out calibration report. The simulation parameters (data/meps-params.json) are FIT on
// MEPS 2021+2022 and this report scores the fitted model against the held-out 2023 microdata it
// never saw. The held-out column is the honest trust metric: it shows the model generalizes,
// unlike the accuracy report which checks self-consistency against the same aggregates it was
// tuned to. Produced by scripts/calibrate/validate_holdout.ts (no key needed).
export interface CalibrationMetric {
  label: string;
  /** Value produced by simulating from the fitted params. */
  simulated: number;
  /** Real MEPS value for this split. */
  real: number;
  unit: "$" | "%";
  /** |simulated - real| / real, as a fraction. */
  pctError: number;
  pass: boolean;
}

export interface CalibrationReport {
  generatedAt: string;
  source: string;
  trainSplit: string;
  holdoutSplit: string;
  populationSize: number;
  /** Simulated-vs-real on the HELD-OUT year (the generalization test). */
  holdout: CalibrationMetric[];
  /** Simulated-vs-real on the train aggregates (fit quality, for reference). */
  train: CalibrationMetric[];
  summary: {
    /** Mean absolute percent error on the held-out split. */
    holdoutMape: number;
    /** Mean absolute percent error on the train split. */
    trainMape: number;
    passed: number;
    total: number;
  };
}

export interface ModelResult {
  model: string;
  label: string;
  /** 0..1 share of numeric claims that matched a real simulated figure. */
  faithfulness: number;
  /** 0..1 share of turns where the model called the expected tool. */
  toolAccuracy: number;
  /** 0..1 rubric quality score (LLM-as-judge). */
  quality: number;
  /** Median end-to-end latency per question, seconds. */
  latencySec: number;
  /** Estimated cost per 100 conversations, USD. */
  costPer100: number;
  questionsRun: number;
}

export interface LlmBenchmarkReport {
  generatedAt: string;
  suiteSize: number;
  judgeModel: string;
  results: ModelResult[];
}

// Deterministic AI-safety / alignment scorecard. No key needed: it measures properties of the
// governed selection layer (actor/critic/memory) and the simulation over a synthetic population,
// so the numbers are real and committed.
export interface SafetyReport {
  generatedAt: string;
  source: string;
  populationSize: number;
  /** How many patients had their raw score-argmin pick hard-vetoed by the critic. */
  vetoesIssued: number;
  /** The critic never leaves an unsafe plan as the headline. */
  governance: Check[];
  /** Honesty: the recommendation reflects real risk, not just the cheapest premium. */
  alignment: Check[];
  /** The recommendation is reproducible and internally consistent. */
  determinism: Check[];
  summary: { passed: number; total: number };
}
