import type { NextRequest } from "next/server";
import type { PatientProfile } from "@/lib/types";
import { loadPlans } from "@/lib/data/plans";
import { optimizeCached } from "@/lib/sim/cache";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let profile: PatientProfile;
  try {
    profile = (await req.json()) as PatientProfile;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!profile?.state) {
    return Response.json({ error: "Missing state" }, { status: 400 });
  }

  const plans = await loadPlans(profile.state);
  if (plans.length === 0) {
    return Response.json(
      { error: `No plan data for ${profile.state}` },
      { status: 400 },
    );
  }

  const result = optimizeCached(profile, plans);
  return Response.json(result);
}
