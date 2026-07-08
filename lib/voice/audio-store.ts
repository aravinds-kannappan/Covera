import crypto from "node:crypto";
import { kvGet, kvSet } from "@/lib/store/redis";

// A tiny, short-lived store for a recorded voice clip. ElevenLabs speech-to-text through the
// Orthogonal gateway cannot take a multipart file from a JSON string; it needs a URL it can fetch
// (source_url). So we stash the clip here under an unguessable id for a few minutes, serve it from
// /api/voice/audio/[id], and hand ElevenLabs that URL. Uses the same KV as everything else (Upstash
// when configured, in-process Map otherwise). The clip is the user's own recording, reachable only
// via an unguessable id and only long enough to be transcribed once.

const TTL_SECONDS = 300;
const key = (id: string) => `covera:audio:${id}`;

export async function putAudio(base64: string, mime: string): Promise<string> {
  const id = crypto.randomBytes(12).toString("hex");
  await kvSet(key(id), JSON.stringify({ base64, mime }), TTL_SECONDS);
  return id;
}

export async function getAudio(id: string): Promise<{ base64: string; mime: string } | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const raw = await kvGet(key(id));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { base64?: string; mime?: string };
    if (!v.base64) return null;
    return { base64: v.base64, mime: v.mime || "audio/webm" };
  } catch {
    return null;
  }
}
