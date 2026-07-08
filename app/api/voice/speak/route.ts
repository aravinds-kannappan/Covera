import type { NextRequest } from "next/server";
import { textToSpeech, personaForMeta, type VoicePersona } from "@/lib/voice/elevenlabs";

export const runtime = "nodejs";

const PERSONAS: VoicePersona[] = ["intake", "advisor", "clinical", "employer", "concierge"];

// Speak a piece of agent text aloud. Used by the voice concierge (auto-play the reply) and the
// reusable speaker button on plan/bill panels. The paid ElevenLabs call ($0.08) only fires here
// on an explicit user action; with no ORTHOGONAL_API_KEY it returns source "unconfigured" and
// the client falls back to the browser's built-in speech. Pass `persona` to pick a voice
// directly, or `metaKind` (a concierge panel kind) to map it to the matching agent voice.
export async function POST(req: NextRequest) {
  let body: { text?: string; persona?: string; metaKind?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  const persona: VoicePersona =
    body.persona && PERSONAS.includes(body.persona as VoicePersona)
      ? (body.persona as VoicePersona)
      : personaForMeta(body.metaKind);

  const res = await textToSpeech(text, persona);
  return Response.json(res);
}
