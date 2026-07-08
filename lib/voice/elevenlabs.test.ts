import { describe, it, expect, vi } from "vitest";

// No key: the gateway is not ready, so nothing should ever call out.
vi.mock("@/lib/orthogonal/client", () => ({
  orthReady: () => false,
  orthRun: vi.fn(),
  orthCached: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  OrthError: class OrthError extends Error {},
}));

import { personaForMeta, textToSpeech, speechToText, voiceReady } from "@/lib/voice/elevenlabs";

describe("personaForMeta", () => {
  it("maps concierge panel kinds to the right agent voice", () => {
    expect(personaForMeta("profile")).toBe("intake");
    expect(personaForMeta("plans")).toBe("advisor");
    expect(personaForMeta("whatif")).toBe("advisor");
    expect(personaForMeta("marketplace")).toBe("advisor");
    expect(personaForMeta("billaudit")).toBe("clinical");
    expect(personaForMeta("estimate")).toBe("clinical");
    expect(personaForMeta("outreach")).toBe("employer");
    expect(personaForMeta(undefined)).toBe("concierge");
    expect(personaForMeta("something-unknown")).toBe("concierge");
  });
});

describe("graceful degradation with no ORTHOGONAL_API_KEY", () => {
  it("voiceReady is false", () => {
    expect(voiceReady()).toBe(false);
  });

  it("textToSpeech reports 'unconfigured' but still names the persona's voice", async () => {
    const res = await textToSpeech("hello there", "advisor");
    expect(res.source).toBe("unconfigured");
    expect(res.persona).toBe("advisor");
    expect(res.voiceId).toBeTruthy();
    expect(res.audioBase64).toBe("");
  });

  it("speechToText reports 'unconfigured'", async () => {
    const res = await speechToText("YWJj", "audio/webm");
    expect(res.source).toBe("unconfigured");
    expect(res.text).toBe("");
  });
});
