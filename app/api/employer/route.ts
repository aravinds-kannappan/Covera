import type { NextRequest } from "next/server";
import { loadPlans } from "@/lib/data/plans";
import { computeSLCSP, pickPremium } from "@/lib/sim/subsidy";
import { EMPLOYER_BANDS } from "@/lib/options";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let state = "TX";
  try {
    state = String((await req.json()).state ?? "TX").toUpperCase();
  } catch {
    /* default */
  }
  const plans = await loadPlans(state);
  if (plans.length === 0)
    return Response.json({ error: `No plan data for ${state}` }, { status: 400 });

  const nonCat = plans.filter((p) => p.metal !== "Catastrophic");
  const bands = EMPLOYER_BANDS.map((b) => {
    const premiums = nonCat
      .map((p) => pickPremium(p, b.repAge))
      .filter((x) => x > 0);
    return {
      key: b.key,
      label: b.label,
      repAge: b.repAge,
      lowestPremium: Math.round(Math.min(...premiums)),
      slcsp: Math.round(computeSLCSP(plans, b.repAge)),
    };
  });

  return Response.json({
    state,
    planCount: plans.length,
    issuers: [...new Set(plans.map((p) => p.issuer))].length,
    bands,
  });
}
