import { describe, it, expect } from "vitest";
import { getThread, saveThread, getOrCreateThread, appendMessage, newThread } from "@/lib/store/conversations";

// With no UPSTASH_REDIS_REST_* env vars set, the store uses its in-process Map fallback,
// which is exactly what these tests exercise.

describe("conversation store (in-memory fallback)", () => {
  it("creates a thread seeded with a runnable default profile", () => {
    const t = newThread("+15550000001", "sandbox");
    expect(t.status).toBe("intake");
    expect(t.profile.state).toBeTruthy();
    expect(t.messages).toHaveLength(0);
  });

  it("round-trips a saved thread", async () => {
    const t = newThread("+15550000002", "sandbox");
    appendMessage(t, { role: "patient", text: "hi", ts: Date.now() });
    await saveThread(t);
    const loaded = await getThread("+15550000002");
    expect(loaded).not.toBeNull();
    expect(loaded!.messages).toHaveLength(1);
    expect(loaded!.messages[0].text).toBe("hi");
  });

  it("getOrCreate returns the existing thread when present", async () => {
    const t = newThread("+15550000003", "sandbox");
    t.profile.age = 41;
    await saveThread(t);
    const again = await getOrCreateThread("+15550000003", "sandbox");
    expect(again.profile.age).toBe(41);
  });

  it("caps stored history length", () => {
    const t = newThread("+15550000004", "sandbox");
    for (let i = 0; i < 80; i++) appendMessage(t, { role: "patient", text: `m${i}`, ts: i });
    expect(t.messages.length).toBeLessThanOrEqual(60);
    expect(t.messages.at(-1)!.text).toBe("m79");
  });
});
