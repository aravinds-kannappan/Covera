import { describe, it, expect, vi, afterEach } from "vitest";
import { orthReady, orthRun, orthCached, OrthError } from "@/lib/orthogonal/client";

// These tests never hit the network: fetch is mocked. With no ORTHOGONAL_API_KEY in the test
// env, orthReady is false and orthRun refuses before any call, which is the safe default.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orthogonal gateway", () => {
  it("reports not-ready and refuses to call without a key", async () => {
    expect(orthReady()).toBe(false);
    await expect(orthRun("tavily", "/search", { query: "x" })).rejects.toBeInstanceOf(OrthError);
    try {
      await orthRun("tavily", "/search", { query: "x" });
    } catch (e) {
      expect((e as OrthError).kind).toBe("unconfigured");
    }
  });

  it("caches a computed value under a key and reuses it", async () => {
    const fn = vi.fn().mockResolvedValue({ answer: "42" });
    const key = `test:cache:${Math.random()}`;
    const a = await orthCached(key, 60, fn);
    const b = await orthCached(key, 60, fn);
    expect(a).toEqual({ answer: "42" });
    expect(b).toEqual({ answer: "42" });
    expect(fn).toHaveBeenCalledTimes(1); // second call served from cache
  });
});
