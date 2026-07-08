import { orthReady, orthRun } from "@/lib/orthogonal/client";
import { kvGet, kvSet } from "@/lib/store/redis";

// Proactive plan-change detection (opt-in). ScrapeGraphAI can watch a URL (a state exchange
// plan page, a hospital charge-master / price-transparency page) and notify when it changes.
// That turns Covera's "re-check at open enrollment" from a periodic pull into a push: when a
// watched page shifts, we flag the affected scope so the next recheck_savings knows to re-run.
//
// This is a scaffold: NO monitor is created unless you run scripts/monitor/setup.ts, so it
// bills nothing by default. The create endpoint shape can vary; treat this as the integration
// point and confirm the monitor payload against the current ScrapeGraphAI docs before enabling.

export function monitorEnabled(): boolean {
  return orthReady();
}

const flaggedKey = (scope: string) => `covera:monitor:flagged:${scope}`;

/** Record that a watched scope (e.g. a state code) changed and merits a fresh recheck. */
export async function flagScopeChanged(scope: string, detail: string): Promise<void> {
  await kvSet(flaggedKey(scope), JSON.stringify({ detail, at: Date.now() }), 60 * 60 * 24 * 60);
}

/** Read (and optionally consume) a pending change flag for a scope. */
export async function getScopeFlag(scope: string): Promise<{ detail: string; at: number } | null> {
  const raw = await kvGet(flaggedKey(scope));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { detail: string; at: number };
  } catch {
    return null;
  }
}

export interface CreateMonitorInput {
  url: string;
  scope: string; // what this monitor covers, e.g. a state code, used to route change flags
  intervalMinutes?: number;
}

/**
 * Create a change monitor on a URL. Opt-in and manual (see scripts/monitor/setup.ts). Returns
 * the monitor id when created. Never called at runtime by the app.
 */
export async function createPlanMonitor(
  input: CreateMonitorInput,
): Promise<{ created: boolean; id?: string; note?: string }> {
  if (!monitorEnabled()) return { created: false, note: "Monitoring is not configured." };
  try {
    const { data } = await orthRun<{ id?: string; monitorId?: string }>(
      "scrapegraphai",
      "/api/monitor",
      {
        url: input.url,
        formats: [{ type: "markdown" }],
        interval: input.intervalMinutes ?? 1440, // default: once a day
        metadata: { scope: input.scope },
      },
    );
    return { created: true, id: data.id ?? data.monitorId };
  } catch (e) {
    return { created: false, note: e instanceof Error ? e.message : "create failed" };
  }
}
