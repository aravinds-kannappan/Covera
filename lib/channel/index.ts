import type { MessageChannel } from "@/lib/channel/types";
import { sandboxChannel } from "@/lib/channel/sandbox";
import { loopMessageChannel } from "@/lib/channel/loopmessage";

export type { MessageChannel, OutboundMessage, InboundMessage } from "@/lib/channel/types";

/**
 * Pick the active channel from CHANNEL_PROVIDER. Defaults to the sandbox. If LoopMessage
 * is selected but missing credentials, fall back to the sandbox so the app never breaks.
 */
export function getChannel(): MessageChannel {
  const provider = (process.env.CHANNEL_PROVIDER ?? "sandbox").toLowerCase();
  if (provider === "loopmessage" && loopMessageChannel.ready()) return loopMessageChannel;
  return sandboxChannel;
}

export { sandboxChannel, loopMessageChannel };
