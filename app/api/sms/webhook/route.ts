import type { NextRequest } from "next/server";
import { getChannel } from "@/lib/channel";
import { getOrCreateThread, saveThread } from "@/lib/store/conversations";
import { runConcierge } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";

// Canonical inbound path. A provider (LoopMessage) posts here when a patient texts; in
// sandbox mode a curl can hit it the same way. We verify, run the concierge, deliver the
// reply over the channel, and persist. The reply is also echoed in the JSON response so
// it's visible when testing with curl (real providers ignore the body).
export async function POST(req: NextRequest) {
  const channel = getChannel();
  const rawBody = await req.text();

  if (!channel.verify(req, rawBody)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const inbound = channel.parseInbound(rawBody);
  if (!inbound) return Response.json({ ok: true, ignored: true }); // non-text event

  const thread = await getOrCreateThread(inbound.from, channel.name);
  const { replies } = await runConcierge(thread, inbound.text);

  for (const reply of replies) {
    try {
      await channel.send({ to: inbound.from, text: reply.text });
    } catch {
      // Delivery failure shouldn't lose the conversation; it's saved below.
    }
  }
  await saveThread(thread);

  return Response.json({ ok: true, replies });
}
