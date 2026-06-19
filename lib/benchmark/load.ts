import fs from "node:fs";
import path from "node:path";
import type { AccuracyReport, LlmBenchmarkReport } from "@/lib/benchmark/types";

// Server-side readers for the committed report artifacts. Return null when a report
// hasn't been generated yet so the page can show a graceful "not yet run" state.
function read<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", file), "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadAccuracyReport(): AccuracyReport | null {
  return read<AccuracyReport>("accuracy-report.json");
}

export function loadLlmBenchmark(): LlmBenchmarkReport | null {
  return read<LlmBenchmarkReport>("llm-benchmark.json");
}
