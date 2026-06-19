import crypto from "node:crypto";
import type { MessageChannel, OutboundMessage, InboundMessage } from "@/lib/channel/types";

// Real blue-bubble iMessage via LoopMessage (https://loopmessage.com). Apple exposes no
// official iMessage API, so a relay like LoopMessage (or SendBlue, which is shaped the
// same way) is required. All credentials are optional: when absent the channel reports
// not-ready and the app routes through the sandbox instead.

const AUTH_KEY = process.env.LOOPMESSAGE_AUTH_KEY;
const SECRET_KEY = process.env.LOOPMESSAGE_SECRET_KEY;
const SENDER_NAME = process.env.LOOPMESSAGE_SENDER_NAME;
const WEBHOOK_SECRET = process.env.LOOP_WEBHOOK_SECRET;

const SEND_URL = "https://server.loopmessage.com/api/v1/message/send/";

export const loopMessageChannel: MessageChannel = {
  name: "loopmessage",
  ready() {
    return !!AUTH_KEY && !!SECRET_KEY && !!SENDER_NAME;
  },

  verify(req: Request, rawBody: string): boolean {
    // If no webhook secret is configured we can't verify; accept (dev) rather than drop.
    if (!WEBHOOK_SECRET) return true;
    const provided = req.headers.get("x-loop-signature") ?? "";
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    // Constant-time compare; lengths must match for timingSafeEqual.
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  },

  parseInbound(rawBody: string): InboundMessage | null {
    try {
      const body = JSON.parse(rawBody) as {
        alert_type?: string;
        recipient?: string;
        text?: string;
      };
      if (body.alert_type !== "message_inbound") return null;
      if (!body.recipient || typeof body.text !== "string") return null;
      return { from: body.recipient, text: body.text };
    } catch {
      return null;
    }
  },

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.ready()) throw new Error("LoopMessage is not configured");
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        authorization: AUTH_KEY!,
        "Loop-Secret-Key": SECRET_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        recipient: msg.to,
        text: msg.text,
        sender_name: SENDER_NAME,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LoopMessage send failed (${res.status}): ${detail}`);
    }
  },
};
