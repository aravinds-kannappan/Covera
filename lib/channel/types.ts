/** A message the agent sends out to a patient (or, for outreach, to a contact). */
export interface OutboundMessage {
  to: string; // E.164 phone for iMessage; demo session id for sandbox
  text: string;
}

/** A message arriving from a patient via the channel's webhook. */
export interface InboundMessage {
  from: string;
  text: string;
}

/**
 * A delivery channel. The orchestrator is channel-agnostic: it produces reply text and
 * hands it to whichever channel is configured. The sandbox channel routes replies to an
 * on-page console; the LoopMessage channel sends real blue-bubble iMessage.
 */
export interface MessageChannel {
  readonly name: "sandbox" | "loopmessage";
  /** True when the channel has the credentials it needs to actually deliver. */
  ready(): boolean;
  /** Verify an inbound webhook request is authentic (signature/secret check). */
  verify(req: Request, rawBody: string): boolean;
  /** Parse an inbound webhook body into a normalized message, or null if not a text. */
  parseInbound(rawBody: string): InboundMessage | null;
  /** Deliver an outbound message. */
  send(msg: OutboundMessage): Promise<void>;
}
