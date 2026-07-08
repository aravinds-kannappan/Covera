import type { NextRequest } from "next/server";
import { speechToText } from "@/lib/voice/elevenlabs";
import { putAudio } from "@/lib/voice/audio-store";

export const runtime = "nodejs";

// Transcribe a short voice clip the browser recorded. ElevenLabs STT needs a URL it can fetch, so
// we stash the clip (lib/voice/audio-store) and pass its public URL as source_url. The paid call
// ($0.03) only fires on an explicit tap; with no ORTHOGONAL_API_KEY it returns "unconfigured" and
// the client falls back to the browser's Web Speech API.
//
// NOTE: ElevenLabs must be able to reach the URL, so cloud STT works on a deployed (public) origin,
// not on localhost (local dev uses the browser fallback). Set PUBLIC_BASE_URL to override the
// derived origin if the request host is not publicly reachable.
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
  const configured = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : req.nextUrl.origin;
}
