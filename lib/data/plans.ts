import type { Plan, PlanDataset } from "@/lib/types";

// Static per-state loaders so the bundler can code-split each dataset; only the
// requested state's plans are loaded per request.
const loaders: Record<string, () => Promise<{ default: unknown }>> = {
  TX: () => import("@/data/plans.TX.json"),
  FL: () => import("@/data/plans.FL.json"),
  NC: () => import("@/data/plans.NC.json"),
  OH: () => import("@/data/plans.OH.json"),
};

export const SUPPORTED_STATE_CODES = Object.keys(loaders);

export async function loadPlanDataset(state: string): Promise<PlanDataset | null> {
  const loader = loaders[state.toUpperCase()];
  if (!loader) return null;
  const mod = await loader();
  return mod.default as PlanDataset;
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
