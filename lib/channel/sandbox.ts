import type { MessageChannel, InboundMessage } from "@/lib/channel/types";

/**
 * The default channel. It needs no external account: inbound messages arrive as plain
 * JSON from the on-page console (or a curl), and outbound replies are returned to the
 * caller directly (the route hands them back in its JSON response, which the console
 * renders as bubbles). This makes the whole multi-agent loop exercisable locally and on
 * Vercel with zero third-party setup.
 */
export const sandboxChannel: MessageChannel = {
  name: "sandbox",
  ready() {
    return true;
  },
  verify() {
    return true;
  },
  parseInbound(rawBody: string): InboundMessage | null {
    try {
      const body = JSON.parse(rawBody) as { from?: string; text?: string };
      if (!body.from || typeof body.text !== "string") return null;
      return { from: body.from, text: body.text };
    } catch {
      return null;
    }
  },
  // Replies are surfaced via the route response, so there's nothing to push here.
  async send(): Promise<void> {},
};
