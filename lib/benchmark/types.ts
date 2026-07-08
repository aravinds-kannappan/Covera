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
