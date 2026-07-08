import type { NextRequest } from "next/server";
import { getAudio } from "@/lib/voice/audio-store";

export const runtime = "nodejs";

// Serves a recorded voice clip so ElevenLabs speech-to-text can fetch it as a source_url. The id is
// an unguessable 24-hex token with a few-minute TTL; the clip is the user's own recording.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audio = await getAudio(id);
  if (!audio) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(audio.base64, "base64");
  return new Response(bytes, {
    headers: {
      "content-type": audio.mime,
      "content-length": String(bytes.length),
      "cache-control": "no-store",
    },
  });
}
