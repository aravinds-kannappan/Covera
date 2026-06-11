import type { NextRequest } from "next/server";
import { loadPlans } from "@/lib/data/plans";
import { estimateProcedure } from "@/lib/card";
import { PROCEDURES } from "@/lib/sim/params";

export const runtime = "nodejs";

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const state = String(body.state ?? "TX").toUpperCase();
  const proc = PROCEDURES.find((p) => p.id === body.procedureId) ?? PROCEDURES[0];

  const plans = await loadPlans(state);
  if (plans.length === 0)
    return Response.json({ error: `No plan data for ${state}` }, { status: 400 });

  const rows = plans
    .filter((p) => p.metal !== "Catastrophic")
    .map((p) => {
      const est = estimateProcedure(p, proc);
      return {
        name: p.marketingName,
        issuer: p.issuer,
        metal: p.metal,
        deductible: p.deductible,
        before: est.beforeDeductible,
        after: est.afterDeductible,
      };
    })
    .sort((a, b) => a.before - b.before);

  const befores = rows.map((r) => r.before);
  return Response.json({
    procedure: { id: proc.id, label: proc.label, typicalAllowed: proc.typicalAllowed },
    state,
    count: rows.length,
    stats: {
      min: befores[0] ?? 0,
      median: median(befores),
      max: befores[befores.length - 1] ?? 0,
    },
    cheapest: rows.slice(0, 8),
    costliest: rows.slice(-3).reverse(),
  });
}
