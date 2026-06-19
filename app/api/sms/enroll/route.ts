import type { NextRequest } from "next/server";
import type { PatientProfile } from "@/lib/types";
import { getChannel } from "@/lib/channel";
import { getOrCreateThread, saveThread, appendMessage, normalizeId } from "@/lib/store/conversations";
import { welcomeMessage } from "@/lib/agents/prompts";

export const runtime = "nodejs";

// Patient opt-in: capture a phone number (and optionally a profile built on the web),
// create the conversation thread, and send the first welcome text.
export async function POST(req: NextRequest) {
  let body: { phone?: string; optIn?: boolean; profile?: Partial<PatientProfile> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const phone = String(body.phone ?? "").trim();
  if (!phone) return Response.json({ error: "A phone number is required." }, { status: 400 });
  if (!body.optIn) return Response.json({ error: "Consent to text is required." }, { status: 400 });

  const channel = getChannel();
  const id = normalizeId(phone);
  const thread = await getOrCreateThread(id, channel.name);
  if (body.profile) thread.profile = { ...thread.profile, ...body.profile };

  const text = welcomeMessage();
  let delivered = false;
  try {
    await channel.send({ to: id, text });
    delivered = channel.name === "loopmessage"; // sandbox "send" is a no-op
  } catch {
    delivered = false;
  }

  // Only record the welcome once (avoid duplicate greetings on re-enroll).
  if (thread.messages.length === 0) appendMessage(thread, { role: "agent", text, ts: Date.now() });
  await saveThread(thread);

  return Response.json({
    ok: true,
    id,
    channel: channel.name,
    delivered,
    welcome: text,
  });
}
