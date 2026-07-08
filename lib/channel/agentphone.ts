import crypto from "node:crypto";
import type { MessageChannel, OutboundMessage, InboundMessage } from "@/lib/channel/types";
import { orthReady, orthRun } from "@/lib/orthogonal/client";
import { kvGet, kvSet } from "@/lib/store/redis";

// AgentPhone as a delivery channel: one provider for both SMS (this file) and, later, voice
// (see scaffolding below). It plugs into the same MessageChannel contract as LoopMessage, so
// the orchestrator does not change: it produces reply text and hands it to whichever channel
// CHANNEL_PROVIDER selects. All calls go through the shared Orthogonal gateway, so the key,
// spend cap, and error handling live in one place.
//
// Cost: sending one SMS bills $0.03 (only real outbound replies bill; inbound is free). With
// no ORTHOGONAL_API_KEY or no AGENTPHONE_AGENT_ID the channel reports not-ready and the app
// routes through the sandbox console instead, exactly like the LoopMessage guard.

const AGENT_ID = process.env.AGENTPHONE_AGENT_ID;
const NUMBER_ID = process.env.AGENTPHONE_NUMBER_ID; // optional: pick a specific sender number
const WEBHOOK_SECRET = process.env.AGENTPHONE_WEBHOOK_SECRET; // optional HMAC on inbound webhooks

// Carrier compliance: the FIRST SMS to any new contact must carry the brand, an opt-in note,
// and opt-out instructions, or carriers may silently filter it. We track who has already been
// greeted so the disclosure is appended exactly once per recipient, never on every reply.
const COMPLIANCE_LINE =
  "\n\nCovera coverage assistant. You opted in by texting us. Reply STOP to opt out.";
const greetedKey = (to: string) => `covera:agentphone:greeted:${to}`;

async function alreadyGreeted(to: string): Promise<boolean> {
  return (await kvGet(greetedKey(to))) === "1";
}
async function markGreeted(to: string): Promise<void> {
  await kvSet(greetedKey(to), "1", 60 * 60 * 24 * 365);
}

export const agentPhoneChannel: MessageChannel = {
  name: "agentphone",

  ready(): boolean {
    return orthReady() && !!AGENT_ID;
  },

  verify(req: Request, rawBody: string): boolean {
    // Without a configured secret we cannot verify; accept (dev) rather than drop messages.
    if (!WEBHOOK_SECRET) return true;
    const provided =
      req.headers.get("x-agentphone-signature") ?? req.headers.get("x-signature") ?? "";
    const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
    if (provided.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  parseInbound(rawBody: string): InboundMessage | null {
    // Parse defensively across field-name variants, and only treat genuinely inbound SMS as a
    // message: status/delivery/outbound events are ignored so they never re-enter the loop.
    try {
      const b = JSON.parse(rawBody) as Record<string, unknown>;
      const type = String(b.type ?? b.event ?? b.direction ?? "").toLowerCase();
      if (/(sent|outbound|delivery|status|call|voice)/.test(type)) return null;

      const from = firstString(b.from_number, b.from, b.sender, (b.message as Record<string, unknown>)?.from);
      const text = firstString(b.body, b.text, b.message_text, (b.message as Record<string, unknown>)?.body);
      if (!from || text == null) return null;
      return { from, text };
    } catch {
      return null;
    }
  },

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.ready()) throw new Error("AgentPhone is not configured");
    const firstContact = !(await alreadyGreeted(msg.to));
    const body = firstContact ? `${msg.text}${COMPLIANCE_LINE}` : msg.text;

    await orthRun("agentphone", "/v1/messages", {
      agent_id: AGENT_ID,
      to_number: msg.to,
      body,
      ...(NUMBER_ID ? { number_id: NUMBER_ID } : {}),
    });

    if (firstContact) await markGreeted(msg.to);
  },
};

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

// --- Voice scaffold (off by default) ----------------------------------------
// AgentPhone can also place outbound voice calls (the outreach agent phoning an employer's HR
// or a hospital's billing desk on the member's behalf). It is scaffolded but gated behind
// ORTH_ENABLE_VOICE so it bills nothing until you deliberately turn it on. Each call bills
// $0.10. The system prompt that shapes the call lives in scripts/agentphone/setup.ts, applied
// to the provisioned agent.

export function voiceEnabled(): boolean {
  return orthReady() && !!AGENT_ID && process.env.ORTH_ENABLE_VOICE === "true";
}

export interface VoiceCallRequest {
  toNumber: string; // E.164 recipient (HR / hospital billing line)
  task: string; // what the agent should accomplish on the call, in plain language
}

/**
 * Placeholder for an outbound voice call. Deliberately does not fire yet: it returns a
 * not-enabled result unless ORTH_ENABLE_VOICE=true, so no call is ever billed by accident.
 * When enabled, wire this to the AgentPhone calls endpoint (POST /v1/calls) through orthRun.
 */
export async function placeVoiceCall(
  req: VoiceCallRequest,
): Promise<{ placed: boolean; reason?: string; callId?: string }> {
  if (!voiceEnabled()) {
    return { placed: false, reason: "Voice is scaffolded but disabled (set ORTH_ENABLE_VOICE=true to enable)." };
  }
  // Intentionally not calling the paid endpoint here. Enabling voice is a separate, explicit
  // step so a stray import can never place a $0.10 call. Reference wiring when you turn it on:
  //   const { data } = await orthRun<{ id: string }>("agentphone", "/v1/calls", {
  //     agent_id: AGENT_ID, to_number: req.toNumber, task: req.task,
  //   });
  //   return { placed: true, callId: data.id };
  void req;
  return { placed: false, reason: "Voice endpoint wiring is intentionally left for explicit enablement." };
}
