import type { JobQueue } from "@/lib/jobs/types";
import { InProcessQueue } from "@/lib/jobs/inprocess";
import type { PatientProfile } from "@/lib/types";
import { loadPlans } from "@/lib/data/plans";
import { optimize } from "@/lib/sim/optimize";
import { recheck } from "@/lib/sim/recheck";

// Wires job kinds to their handlers and hands back a single shared queue. Handlers are plain
// async functions over their payload: exactly the code you would hand to BullMQ/Inngest/etc.
// The data-refresh kinds (ingestPlans, refreshFormulary, refreshProcedurePrices, runBenchmark)
// are produced by the Python ingestion scripts and a real deploy would register adapters that
// shell out to or trigger those; they are intentionally left unregistered here so enqueuing
// one fails loudly rather than pretending to run.

export interface RecheckPayload {
  profile: PatientProfile;
  currentPlanId?: string | null;
}

export interface LongSimPayload {
  profile: PatientProfile;
  nFine?: number;
}

let shared: JobQueue | null = null;

export function getJobQueue(): JobQueue {
  if (shared) return shared;
  const q = new InProcessQueue();

  // Annual (or on-change) re-check: is this year's best plan cheaper than the current one?
  q.register<RecheckPayload, unknown>("recheckRecommendation", async (payload) => {
    const plans = await loadPlans(payload.profile.state);
    if (plans.length === 0) throw new Error(`No plan data for ${payload.profile.state}`);
    return recheck(payload.profile, plans, payload.currentPlanId ?? null);
  });

  // A high-resolution simulation that would be too slow for a request path.
  q.register<LongSimPayload, unknown>("longSimulation", async (payload, ctx) => {
    const plans = await loadPlans(payload.profile.state);
    if (plans.length === 0) throw new Error(`No plan data for ${payload.profile.state}`);
    ctx.progress(0.1);
    const res = optimize(payload.profile, plans, { nFine: payload.nFine ?? 20000 });
    ctx.progress(1);
    return {
      recommendedPlanId: res.governance.recommendedPlanId,
      scenarioCount: res.scenarioCount,
      topExpectedTotal: res.ranked[0]?.sim.expectedTotal ?? null,
    };
  });

  shared = q;
  return shared;
}
