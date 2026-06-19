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
