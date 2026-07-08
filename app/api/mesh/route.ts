import type { NextRequest } from "next/server";
import { conciergeReady } from "@/lib/llm/router";
import { runMeshTurn, type MeshHistoryItem, type MeshRole } from "@/lib/agents/mesh/agent";

export const runtime = "nodejs";

// One cross-agent turn for the hospital or employer desk. The desk agent may consult the patient's
// concierge (via a Coverage Card) and returns its reply plus the consult exchange, so the UI can
// show and voice the hand-off. Runs on the cheap Baseten brain by default (Claude fallback).
export async function POST(req: NextRequest) {
  if (!conciergeReady()) {
    return Response.json(
      {
        error:
          "The desk agent needs an assistant key: ANTHROPIC_API_KEY, or an Orthogonal key for a Baseten model.",
      },
      { status: 503 },
    );
  }

  let body: {
    role?: string;
    history?: MeshHistoryItem[];
    text?: string;
    state?: string;
    cardToken?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const role: MeshRole = body.role === "employer" ? "employer" : "hospital";
  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "Missing message." }, { status: 400 });

  const res = await runMeshTurn({
    role,
    history: Array.isArray(body.history) ? body.history : [],
    text,
    state: typeof body.state === "string" ? body.state : undefined,
    cardToken: typeof body.cardToken === "string" ? body.cardToken : undefined,
    provider: "baseten",
  });

  return Response.json(res);
}
