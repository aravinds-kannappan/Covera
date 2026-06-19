import type { Plan } from "@/lib/types";
import type { HospitalMeta } from "@/lib/agents/types";
import { estimateProcedure } from "@/lib/card";
import { PROCEDURES } from "@/lib/sim/params";

// The Hospital tool: what a given procedure would cost a member across every plan in the
// state, so the agent can answer "how much is an MRI / a delivery / a knee replacement?"
// with a real range rather than a guess.

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function lookupProcedure(state: string, procedureId: string, plans: Plan[]): HospitalMeta {
  const proc = PROCEDURES.find((p) => p.id === procedureId) ?? PROCEDURES[0];
  const befores = plans
    .filter((p) => p.metal !== "Catastrophic")
    .map((p) => estimateProcedure(p, proc).beforeDeductible);

  return {
    procedure: proc.label,
    state,
    min: befores.length ? Math.round(Math.min(...befores)) : 0,
    median: Math.round(median(befores)),
    max: befores.length ? Math.round(Math.max(...befores)) : 0,
  };
}

/** The procedure ids the agent may reference, for the tool schema + prompt. */
export const PROCEDURE_CHOICES = PROCEDURES.map((p) => ({ id: p.id, label: p.label }));
