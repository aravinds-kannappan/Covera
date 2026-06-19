import { describe, it, expect } from "vitest";
import { sandboxChannel } from "@/lib/channel/sandbox";
import { loopMessageChannel } from "@/lib/channel/loopmessage";
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
