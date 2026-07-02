import type { Plan, PlanDataset } from "@/lib/types";
import statesIndex from "@/data/states.json";

// Data-driven state loading. The set of supported states is whatever the ingester wrote to
// states.json (real CMS PUF data), so adding a state is `python3 scripts/ingest_pufs.py XX`
// plus a rebuild: no code change here. Each per-state file loads on demand through a webpack
// dynamic-import context over data/plans.*.json, so only the requested state ships per request.

export const SUPPORTED_STATE_CODES: string[] = (
  statesIndex.states as { state: string }[]
).map((s) => s.state);

const supported = new Set(SUPPORTED_STATE_CODES);

export function isSupportedState(state: string): boolean {
  return supported.has(state.toUpperCase());
}

export async function loadPlanDataset(state: string): Promise<PlanDataset | null> {
  const code = state.toUpperCase();
  if (!supported.has(code)) return null;
  const mod = await import(`@/data/plans.${code}.json`);
  return (mod.default ?? mod) as PlanDataset;
}

export async function loadPlans(state: string): Promise<Plan[]> {
  const ds = await loadPlanDataset(state);
  return ds?.plans ?? [];
}

export async function findPlan(
  state: string,
  planId: string,
): Promise<Plan | null> {
  const plans = await loadPlans(state);
  return plans.find((p) => p.id === planId) ?? null;
}
