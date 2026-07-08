import { describe, it, expect } from "vitest";
import { sandboxChannel } from "@/lib/channel/sandbox";
import { loopMessageChannel } from "@/lib/channel/loopmessage";
import { agentPhoneChannel } from "@/lib/channel/agentphone";
import { normalizeId } from "@/lib/store/conversations";

describe("sandbox channel inbound parsing", () => {
  it("parses a valid console payload", () => {
    const msg = sandboxChannel.parseInbound(JSON.stringify({ from: "demo:abc", text: "hi" }));
    expect(msg).toEqual({ from: "demo:abc", text: "hi" });
  });
  it("rejects malformed or non-text payloads", () => {
    expect(sandboxChannel.parseInbound("not json")).toBeNull();
    expect(sandboxChannel.parseInbound(JSON.stringify({ from: "x" }))).toBeNull();
  });
  it("always verifies (no external secret)", () => {
    const req = new Request("https://x/api/sms/webhook", { method: "POST" });
    expect(sandboxChannel.verify(req, "{}")).toBe(true);
  });
});

describe("loopmessage channel", () => {
  it("parses an inbound iMessage webhook", () => {
    const body = JSON.stringify({
      alert_type: "message_inbound",
      recipient: "+15551234567",
      text: "what plans do I have?",
    });
    expect(loopMessageChannel.parseInbound(body)).toEqual({
      from: "+15551234567",
      text: "what plans do I have?",
    });
  });
  it("ignores non-inbound alert types", () => {
    const body = JSON.stringify({ alert_type: "message_sent", recipient: "+1", text: "x" });
    expect(loopMessageChannel.parseInbound(body)).toBeNull();
  });
  it("accepts the webhook when no secret is configured (dev)", () => {
    const req = new Request("https://x/api/sms/webhook", { method: "POST" });
    expect(loopMessageChannel.verify(req, "{}".toString())).toBe(true);
  });
});

describe("agentphone channel", () => {
  it("parses an inbound SMS across field-name variants", () => {
    expect(
      agentPhoneChannel.parseInbound(
        JSON.stringify({ type: "message.received", from_number: "+15551234567", body: "what plans do I have?" }),
      ),
    ).toEqual({ from: "+15551234567", text: "what plans do I have?" });
    expect(
      agentPhoneChannel.parseInbound(JSON.stringify({ from: "+15550000000", text: "hi" })),
    ).toEqual({ from: "+15550000000", text: "hi" });
  });
  it("ignores outbound/status/voice events so they never re-enter the loop", () => {
    expect(agentPhoneChannel.parseInbound(JSON.stringify({ type: "message.sent", from: "+1", text: "x" }))).toBeNull();
    expect(agentPhoneChannel.parseInbound(JSON.stringify({ type: "call.completed", from: "+1", text: "x" }))).toBeNull();
    expect(agentPhoneChannel.parseInbound("not json")).toBeNull();
  });
  it("reports not-ready without a key/agent id (falls back to sandbox)", () => {
    expect(agentPhoneChannel.ready()).toBe(false);
    expect(agentPhoneChannel.verify(new Request("https://x"), "{}")).toBe(true); // no secret configured
  });
});

describe("phone normalization", () => {
  it("normalizes US numbers to E.164", () => {
    expect(normalizeId("(555) 123-4567")).toBe("+15551234567");
    expect(normalizeId("15551234567")).toBe("+15551234567");
    expect(normalizeId("+1 555 123 4567")).toBe("+15551234567");
  });
  it("passes demo session ids through", () => {
    expect(normalizeId("demo:abc123")).toBe("demo:abc123");
  });
});
