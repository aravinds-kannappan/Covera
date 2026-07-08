import { decodeCard, estimateProcedure } from "@/lib/card";
import { PROCEDURES } from "@/lib/sim/params";

// The patient's Concierge answering ANOTHER agent (the hospital or employer desk), using only the
// Coverage Card the patient shared. This is the mesh handshake: real coverage facts and a real,
// deterministic out-of-pocket estimate, with zero access to the patient's records (the whole card
// lives in the token). No LLM and no simulation draw is needed to answer, so it always works.

export interface ConciergeConsult {
  ok: boolean;
  member?: string;
  plan?: string;
  coverage?: { deductible: number; oopMax: number; metal: string; issuer: string };
  estimate?: { procedure: string; ifDeductibleUnmet: number; ifDeductibleMet: number };
  drugsOnCard?: string[];
  note: string;
}

export function consultConcierge(input: { cardToken?: string; procedureId?: string }): ConciergeConsult {
  const card = input.cardToken ? decodeCard(input.cardToken) : null;
  if (!card) {
    return {
      ok: false,
      note: "No valid Coverage Card was shared, so the concierge can't confirm this member's coverage. Ask them to paste their card link.",
    };
  }

  const coverage = {
    deductible: card.plan.deductible,
    oopMax: card.plan.oopMax,
    metal: card.plan.metal,
    issuer: card.plan.issuer,
  };

  let estimate: ConciergeConsult["estimate"];
  if (input.procedureId) {
    const proc = PROCEDURES.find((p) => p.id === input.procedureId);
    if (proc) {
      const est = estimateProcedure(card.plan, proc);
      estimate = {
        procedure: proc.label,
        ifDeductibleUnmet: est.beforeDeductible,
        ifDeductibleMet: est.afterDeductible,
      };
    }
  }

  return {
    ok: true,
    member: card.name,
    plan: `${card.plan.metal} · ${card.plan.name}`,
    coverage,
    estimate,
    drugsOnCard: card.meds.map((m) => m.name),
    note: "Answered from the member's Coverage Card only. No records were accessed.",
  };
}
