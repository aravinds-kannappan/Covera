import type { NextRequest } from "next/server";
import { speechToText } from "@/lib/voice/elevenlabs";
import { putAudio } from "@/lib/voice/audio-store";

export const runtime = "nodejs";

// Transcribe a short voice clip the browser recorded. ElevenLabs STT needs a URL it can fetch, so
// we stash the clip (lib/voice/audio-store) and pass its public URL as source_url. The paid call
// ($0.03) only fires on an explicit tap. With no ORTHOGONAL_API_KEY it returns "unconfigured" and
// the client falls back to the browser's Web Speech API.
//
// The URL is the app's own origin, derived from the request. ElevenLabs must be able to reach it,
// so cloud STT works on a deployed (public) host, not on localhost (local dev uses the fallback).
export async function POST(req: NextRequest) {
  let body: { audioBase64?: string; mime?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const audioBase64 = String(body.audioBase64 ?? "");
  if (!audioBase64) return Response.json({ error: "audioBase64 is required" }, { status: 400 });
  const mime = typeof body.mime === "string" && body.mime ? body.mime : "audio/webm";

  const id = await putAudio(audioBase64, mime);
  const sourceUrl = `${publicOrigin(req)}/api/voice/audio/${id}`;

  const res = await speechToText(sourceUrl);
  return Response.json(res);
}

function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}
