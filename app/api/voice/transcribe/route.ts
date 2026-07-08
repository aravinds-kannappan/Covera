import type { NextRequest } from "next/server";
import { speechToText } from "@/lib/voice/elevenlabs";

export const runtime = "nodejs";

// Transcribe a short voice clip the patient recorded in the browser. The paid ElevenLabs STT
// call ($0.03) only fires on an explicit user action (they pressed record and released); with no
// ORTHOGONAL_API_KEY it returns source "unconfigured" and the client falls back to the browser's
// Web Speech API.
export async function POST(req: NextRequest) {
  let body: { audioBase64?: string; mime?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const audioBase64 = String(body.audioBase64 ?? "");
  if (!audioBase64) return Response.json({ error: "audioBase64 is required" }, { status: 400 });

  const res = await speechToText(audioBase64);
  return Response.json(res);
}
