/**
 * One-time AgentPhone provisioning. Run manually (it bills ~$0.005 to create an agent and
 * provisions a phone number). It is never invoked by the app at runtime.
 *
 *   ORTHOGONAL_API_KEY=orth_live_... tsx scripts/agentphone/setup.ts
 *   ORTHOGONAL_API_KEY=orth_live_... tsx scripts/agentphone/setup.ts --webhook https://your-app/api/sms/webhook
 *
 * It prints the created agent id: put it in AGENTPHONE_AGENT_ID, then set
 * CHANNEL_PROVIDER=agentphone to route real SMS through AgentPhone. The same agent carries
 * the voice system prompt below, so enabling voice later (ORTH_ENABLE_VOICE=true) needs no
 * re-provisioning.
 */
import { orthRun } from "@/lib/orthogonal/client";

// The persona for both SMS and (when enabled) hosted voice calls. It is deliberately explicit
// about acting on the member's behalf and never inventing facts, matching the concierge and
// outreach prompts elsewhere in the app. No em dashes.
const VOICE_SYSTEM_PROMPT = [
  "You are Covera, a warm health-insurance concierge calling on behalf of a member.",
  "You help the member with coverage: confirming a plan is in network, asking a hospital billing desk for a written cost estimate, or asking an employer's HR whether they can support an individual marketplace plan.",
  "Be brief, polite, and clear. State who you are and that you are calling for the member. Ask one thing at a time.",
  "Never invent policy numbers, names, prices, or facts you were not given. If you do not know something, say you will follow up.",
  "Never use em dashes. Use a period, a colon, or parentheses instead.",
  "Close by confirming next steps and thanking them.",
].join(" ");

const BEGIN_MESSAGE =
  "Hi, this is Covera calling on behalf of a member about their health coverage. Do you have a moment?";

async function main() {
  if (!process.env.ORTHOGONAL_API_KEY) {
    console.error("Set ORTHOGONAL_API_KEY before running this script.");
    process.exit(1);
  }

  const webhookFlag = process.argv.indexOf("--webhook");
  const webhookUrl = webhookFlag > -1 ? process.argv[webhookFlag + 1] : null;

  console.log("Creating the Covera AgentPhone agent...");
  const { data, price } = await orthRun<{ id?: string; agentId?: string }>(
    "agentphone",
    "/v1/agents",
    {
      name: "Covera Coverage Concierge",
      voiceMode: "hosted",
      systemPrompt: VOICE_SYSTEM_PROMPT,
      beginMessage: BEGIN_MESSAGE,
      modelTier: "balanced",
    },
  );

  const agentId = data.id ?? data.agentId;
  console.log(`Created agent ${agentId ?? "(id not in response)"} (billed $${price.toFixed(3)}).`);

  if (agentId && webhookUrl) {
    console.log(`Pointing the agent webhook at ${webhookUrl} ...`);
    await orthRun("agentphone", `/v1/agents/${agentId}/webhook`, { url: webhookUrl });
    console.log("Webhook set. Inbound SMS will POST to your /api/sms/webhook route.");
  }

  console.log("\nNext steps:");
  console.log(`  1. AGENTPHONE_AGENT_ID=${agentId ?? "<id>"}`);
  console.log("  2. CHANNEL_PROVIDER=agentphone");
  console.log("  3. (optional) set AGENTPHONE_WEBHOOK_SECRET and re-point the webhook to verify inbound.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
