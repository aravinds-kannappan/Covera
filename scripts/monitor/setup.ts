/**
 * Opt-in: register ScrapeGraphAI monitors on plan / pricing pages. Run manually. Each monitor
 * you create is a recurring watch; review ScrapeGraphAI's monitor pricing before enabling many.
 *
 *   ORTHOGONAL_API_KEY=orth_live_... tsx scripts/monitor/setup.ts
 *
 * Edit WATCHES below to the pages you care about. `scope` is echoed back on each change tick
 * (via the webhook) so Covera can route the flag (e.g. to a state's rechecks). Point each
 * monitor's webhook at /api/monitor/webhook in the ScrapeGraphAI dashboard or payload.
 */
import { createPlanMonitor } from "@/lib/jobs/monitor";

const WATCHES = [
  // Example only. Replace with real state-exchange or price-transparency URLs you want watched.
  { url: "https://www.healthcare.gov/", scope: "US", intervalMinutes: 1440 },
];

async function main() {
  if (!process.env.ORTHOGONAL_API_KEY) {
    console.error("Set ORTHOGONAL_API_KEY before running this script.");
    process.exit(1);
  }
  for (const w of WATCHES) {
    const res = await createPlanMonitor(w);
    console.log(res.created ? `Monitoring ${w.url} (id ${res.id}) for scope ${w.scope}.` : `Skipped ${w.url}: ${res.note}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
