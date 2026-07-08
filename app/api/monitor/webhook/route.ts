import type { NextRequest } from "next/server";
import { flagScopeChanged } from "@/lib/jobs/monitor";

export const runtime = "nodejs";

// Receives ScrapeGraphAI monitor ticks. When a watched page changes, we record a flag against
// the scope the monitor covers (carried in the monitor's metadata), so the next recheck for
// that scope knows something moved. This is opt-in: it only ever fires if you created monitors
// via scripts/monitor/setup.ts. It records a flag and returns 200; it never makes a paid call.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: true, ignored: true });
  }

  // A change tick typically carries a diff and the monitor's metadata. Be permissive about the
  // exact shape; only act when a change is signaled and a scope is present.
  const changed = body.changed === true || String(body.type ?? body.event ?? "").toLowerCase().includes("change");
  const meta = (body.metadata ?? {}) as Record<string, unknown>;
  const scope = String(meta.scope ?? body.scope ?? "").trim();

  if (changed && scope) {
    await flagScopeChanged(scope, "A watched plan/pricing page changed.");
    return Response.json({ ok: true, flagged: scope });
  }
  return Response.json({ ok: true, ignored: true });
}
