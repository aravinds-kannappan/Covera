import type { NextRequest } from "next/server";
import { anthropicKeyPresent } from "@/lib/anthropic/client";
import { extractProfilePatch } from "@/lib/agents/intake";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!anthropicKeyPresent()) {
    return Response.json(
      { error: "The assistant needs an ANTHROPIC_API_KEY to be configured." },
      { status: 503 },
    );
  }
  let text = "";
  try {
    text = String((await req.json()).text ?? "");
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!text.trim()) return Response.json({ patch: {} });

  try {
    return Response.json({ patch: await extractProfilePatch(text) });
  } catch (e) {
    const status = e instanceof Error && "status" in e ? (e as { status: number }).status : 500;
    return Response.json(
      { error: "Could not read that. Try the form, or rephrase." },
      { status: status === 401 ? 503 : 500 },
    );
  }
}
