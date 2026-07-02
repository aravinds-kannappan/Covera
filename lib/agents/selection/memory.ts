import type { PatientProfile, RankedPlan } from "@/lib/types";
import { hashSeed } from "@/lib/sim/random";
import type { SelectionResult } from "@/lib/agents/selection/types";

// Step 6: memory.
//
//   Short-term memory is the running trajectory the runtime carries within one selection:
//   the last screen, the last action, the last critic verdict (see runtime.ts).
//
//   Long-term memory is this module: a store of critic-APPROVED trajectories keyed by the
//   situation that produced them. When the same patient situation and the same shortlist
//   come back (a page reload, open enrollment, two people with identical facts), we replay
//   the already-vetted path instead of re-deriving it. This is honest memoization of a
//   corrected decision path, i.e. "keep the successful corrected path" from the roadmap. It
//   is NOT model training and learns no weights; it caches outcomes, nothing more.

const MAX_ENTRIES = 500;
const store = new Map<string, SelectionResult>();

/**
 * A situation signature: the patient facts that change the decision, plus the identity and
 * order of the shortlist the critic will judge. If either shifts, it is a new situation and
 * we re-run rather than trust a stale path.
 */
export function situationKey(profile: PatientProfile, ranked: RankedPlan[]): string {
  const shape = {
    a: profile.age,
    inc: profile.annualIncome,
    r: profile.riskTolerance,
    hsa: Boolean(profile.requireHsa),
    rx: profile.prescriptions.map((p) => p.name.toLowerCase()).sort(),
    prov: [...profile.providers].map((p) => p.toLowerCase()).sort(),
    // Shortlist identity: plan ids in ranked order, with each plan's bad-year cost bucketed
    // so trivially different simulations still hit the same corrected path.
    sl: ranked.map((r) => `${r.plan.id}:${Math.round((r.sim.cvar90 ?? r.sim.p90) / 250)}`),
  };
  return String(hashSeed(JSON.stringify(shape)));
}

/** Long-term recall: return a previously vetted trajectory for this situation, if any. */
export function recall(key: string): SelectionResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  store.delete(key);
  store.set(key, hit); // mark most-recently-used
  return { ...hit, reusedFromMemory: true };
}

/** Persist a vetted trajectory so an identical situation reuses it. */
export function remember(key: string, result: SelectionResult): void {
  store.set(key, result);
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
}

export function clearSelectionMemory(): void {
  store.clear();
}

export function selectionMemorySize(): number {
  return store.size;
}
