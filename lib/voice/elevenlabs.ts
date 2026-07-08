import crypto from "node:crypto";
import { orthReady, orthRun, orthCached, OrthError } from "@/lib/orthogonal/client";

// Voice for the concierge, through the same Orthogonal gateway as every other paid capability.
// Text-to-speech ($0.08) speaks the agent's reply; speech-to-text ($0.03) transcribes the
// patient. Both follow Covera's rules: dormant with no key (callers fall back to the browser's
// Web Speech API), cached so a repeated line never re-bills, and a paid call only on an explicit
// user action. Emotion comes from per-persona voice_settings on the cheap per-voice endpoint, so
// a handoff between agents changes the voice without paying for the $0.10 text-to-dialogue API.
//
// The gateway slug ("elevenlabs"), paths, and response envelope are inferred from the ElevenLabs
// API and centralized here; if the live gateway differs it is one adapter to adjust (same
// defensive pattern as lib/documents/scrapegraph.ts).

export type VoicePersona = "intake" | "advisor" | "clinical" | "employer" | "concierge";

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

interface VoiceConfig {
  voiceId: string;
  settings: VoiceSettings;
}

const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_turbo_v2_5";
const STT_MODEL = process.env.ELEVENLABS_STT_MODEL || "scribe_v1";

// Stock ElevenLabs voice ids as defaults, each overridable by env. Lower stability + some style
// gives a warmer, more expressive read (the "some emotion" the product wants); the clinical and
// employer voices are steadier and more neutral.
const VOICES: Record<VoicePersona, VoiceConfig> = {
  intake: {
    voiceId: process.env.ELEVENLABS_VOICE_INTAKE || "EXAVITQu4vr4xnSDxMaL", // warm
    settings: { stability: 0.35, similarity_boost: 0.75, style: 0.6, use_speaker_boost: true },
  },
  advisor: {
    voiceId: process.env.ELEVENLABS_VOICE_ADVISOR || "TX3LPaxmHKxFdv7VOQHJ", // confident
    settings: { stability: 0.45, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true },
  },
  clinical: {
    voiceId: process.env.ELEVENLABS_VOICE_CLINICAL || "pNInz6obpgDQGcFmaJgB", // steady, clinical
    settings: { stability: 0.6, similarity_boost: 0.7, style: 0.3, use_speaker_boost: true },
  },
  employer: {
    voiceId: process.env.ELEVENLABS_VOICE_EMPLOYER || "onwK4e9ZLuTAKqWW03F9", // professional
    settings: { stability: 0.55, similarity_boost: 0.7, style: 0.35, use_speaker_boost: true },
  },
  concierge: {
    voiceId: process.env.ELEVENLABS_VOICE_CONCIERGE || "21m00Tcm4TlvDq8ikWAM", // warm neutral
    settings: { stability: 0.4, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true },
  },
};

/** True when ElevenLabs can be reached (i.e. Orthogonal is configured). */
export function voiceReady(): boolean {
  return orthReady();
}

/** Choose a persona (and therefore a voice) from a concierge reply's meta panel kind. */
export function personaForMeta(kind?: string): VoicePersona {
  switch (kind) {
    case "profile":
      return "intake";
    case "plans":
    case "whatif":
    case "marketplace":
    case "recheck":
      return "advisor";
    case "hospital":
    case "estimate":
    case "billaudit":
    case "appeal":
      return "clinical";
    case "outreach":
      return "employer";
    default:
      return "concierge";
  }
}

function sha1(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex");
}

// The gateway wraps provider responses in { data }. For audio the base64 may be the data itself
// or nested under a common key; tolerate the variants rather than assume one shape.
function pickAudio(data: unknown): string {
  if (typeof data === "string") return data;
  const d = (data ?? {}) as Record<string, unknown>;
  const cand = d.audio_base64 ?? d.audio ?? d.audioBase64 ?? d.result ?? d.data;
  return typeof cand === "string" ? cand : "";
}

function pickText(data: unknown): string {
  if (typeof data === "string") return data;
  const d = (data ?? {}) as Record<string, unknown>;
  const cand = d.text ?? d.transcript ?? d.transcription ?? d.result ?? d.output;
  if (typeof cand === "string") return cand.trim();
  if (cand && typeof cand === "object" && typeof (cand as Record<string, unknown>).text === "string") {
    return String((cand as Record<string, unknown>).text).trim();
  }
  return "";
}

export interface TtsResult {
  audioBase64: string;
  mime: string;
  voiceId: string;
  persona: VoicePersona;
  source: "elevenlabs" | "unconfigured" | "error";
  note?: string;
}

/** Speak `text` in the given persona's voice. Never throws: degrades to an empty, labeled result. */
export async function textToSpeech(text: string, persona: VoicePersona = "concierge"): Promise<TtsResult> {
  const cfg = VOICES[persona] ?? VOICES.concierge;
  const base = { mime: "audio/mpeg", voiceId: cfg.voiceId, persona } as const;

  if (!orthReady()) {
    return { audioBase64: "", ...base, source: "unconfigured", note: "Voice is not configured (ORTHOGONAL_API_KEY missing)." };
  }
  const clean = text.trim().slice(0, 1200); // bound runaway TTS cost on a long reply
  if (!clean) return { audioBase64: "", ...base, source: "error", note: "Empty text." };

  const cacheKey = `covera:tts:${cfg.voiceId}:${TTS_MODEL}:${sha1(JSON.stringify(cfg.settings) + clean)}`;
  try {
    const audioBase64 = await orthCached<string>(cacheKey, 60 * 60 * 24 * 7, async () => {
      // Body per the ElevenLabs TTS contract. output_format is a query param upstream, so it is
      // deliberately not in the body (the gateway rejects unexpected body fields); the default is
      // mp3, matching the audio/mpeg mime above.
      const { data } = await orthRun<unknown>("elevenlabs", `/v1/text-to-speech/${cfg.voiceId}/stream`, {
        text: clean,
        model_id: TTS_MODEL,
        voice_settings: cfg.settings,
      });
      return pickAudio(data);
    });
    if (!audioBase64) return { audioBase64: "", ...base, source: "error", note: "No audio returned." };
    return { audioBase64, ...base, source: "elevenlabs" };
  } catch (e) {
    return { audioBase64: "", ...base, source: "error", note: e instanceof OrthError ? e.message : "tts failed" };
  }
}

export interface SttResult {
  text: string;
  source: "elevenlabs" | "unconfigured" | "error";
  note?: string;
}

/**
 * Transcribe base64-encoded audio. The Orthogonal ElevenLabs STT contract wants the audio bytes in
 * a `file` field (base64) plus a required `model_id`, and rejects `audio_base64`/`mime_type`. Never
 * throws: degrades to an empty, labeled result.
 */
export async function speechToText(audioBase64: string): Promise<SttResult> {
  if (!orthReady()) {
    return { text: "", source: "unconfigured", note: "Transcription is not configured (ORTHOGONAL_API_KEY missing)." };
  }
  if (!audioBase64) return { text: "", source: "error", note: "No audio provided." };
  try {
    const { data } = await orthRun<unknown>("elevenlabs", "/v1/speech-to-text", {
      model_id: STT_MODEL,
      file: audioBase64,
      diarize: false,
    });
    const text = pickText(data);
    if (!text) return { text: "", source: "error", note: "No transcript returned." };
    return { text, source: "elevenlabs" };
  } catch (e) {
    return { text: "", source: "error", note: e instanceof OrthError ? e.message : "stt failed" };
  }
}

/** Free diagnostic: list available voices from the gateway. Cached; used to confirm setup. */
export async function listVoices(): Promise<{ available: boolean; voices: { id: string; name: string }[] }> {
  if (!orthReady()) return { available: false, voices: [] };
  try {
    return await orthCached("covera:11labs:voices", 60 * 60 * 24, async () => {
      const { data } = await orthRun<{ voices?: { voice_id?: string; name?: string }[] }>("elevenlabs", "/v1/voices", {});
      const voices = (data.voices ?? [])
        .filter((v) => v.voice_id)
        .map((v) => ({ id: v.voice_id as string, name: v.name ?? "voice" }));
      return { available: true, voices };
    });
  } catch {
    return { available: false, voices: [] };
  }
}
