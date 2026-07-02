import type { NextRequest } from "next/server";
import type { Metal, Plan } from "@/lib/types";
import { loadPlans } from "@/lib/data/plans";
import { pickPremium } from "@/lib/sim/subsidy";
import { adjudicateExplained } from "@/lib/sim/costsharing";
import { CLAIM_BUNDLES } from "@/lib/sim/bundles";

export const runtime = "nodejs";

// Powers the benchmark tab's claim-bundle explorer: for a state, take the cheapest real plan
// in each metal tier and run every deterministic claim bundle (diabetes year, surgery episode,
// maternity, ...) through the exact adjudication engine the recommendations use. It turns the
// abstract "how accurate is this" question into "here is precisely what a surgery costs you on
// a real Bronze vs Gold plan, and the math behind it." Nothing is precomputed or faked.

const METAL_ORDER: Metal[] = ["Bronze", "Expanded Bronze", "Silver", "Gold", "Platinum"];

function cheapestByMetal(plans: Plan[], metal: Metal): Plan | null {
  const inMetal = plans.filter((p) => p.metal === metal && pickPremium(p, 40) > 0);
  if (inMetal.length === 0) return null;
  return inMetal.reduce((a, b) => (pickPremium(a, 40) <= pickPremium(b, 40) ? a : b));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const state = String(body.state ?? "TX").toUpperCase();
  const plans = await loadPlans(state);
  if (plans.length === 0)
    return Response.json({ error: `No plan data for ${state}` }, { status: 400 });

  // Up to four representative columns: the cheapest plan in each metal tier that exists.
  const columns: {
    metal: Metal;
    planName: string;
    issuer: string;
    monthlyPremium: number;
    deductible: number;
    oopMax: number;
  }[] = [];
  const chosen: Plan[] = [];
  for (const metal of METAL_ORDER) {
    const p = cheapestByMetal(plans, metal);
    if (!p) continue;
    chosen.push(p);
    columns.push({
      metal,
      planName: p.marketingName,
      issuer: p.issuer,
      monthlyPremium: Math.round(pickPremium(p, 40)),
      deductible: p.deductible,
      oopMax: p.oopMax,
    });
    if (columns.length >= 4) break;
  }

  const bundles = CLAIM_BUNDLES.map((b) => ({
    key: b.key,
    label: b.label,
    allowed: Math.round(b.scenario.totalAllowed),
    cells: chosen.map((p) => {
      const adj = adjudicateExplained(p, b.scenario);
      return {
        metal: p.metal,
        oop: Math.round(adj.oop),
        deductiblePaid: Math.round(adj.deductiblePaid),
        coinsurancePaid: Math.round(adj.coinsurancePaid),
        copayPaid: Math.round(adj.copayPaid),
        hitOopMax: adj.hitOopMax,
      };
    }),
  }));

  return Response.json({ state, columns, bundles });
}
