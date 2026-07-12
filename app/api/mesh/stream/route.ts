import type { NextRequest } from "next/server";
import { conciergeReady } from "@/lib/llm/router";
import { runMeshTurn, type MeshHistoryItem, type MeshRole } from "@/lib/agents/mesh/agent";
import type { AgentEvent } from "@/lib/agents/runtime";

export const runtime = "nodejs";

// Streaming version of /api/mesh. Same cross-agent desk turn, but it emits every step of the
// exchange over Server-Sent Events as it happens: the desk agent thinking, calling the patient's
// concierge, the concierge answering, then the final reply. The console renders the consult
// hand-off live instead of waiting for the whole round trip, which is what makes the agent-to-agent
// communication feel seamless. Stays on the Node runtime (Vercel supports streaming there); state
// stays bounded because each turn only carries the short on-page history.
export async function POST(req: NextRequest) {
  if (!conciergeReady()) {
    return Response.json(
      { error: "The desk agent needs an assistant key: ANTHROPIC_API_KEY, or an Orthogonal key for a Baseten model." },
      { status: 503 },
    );
  }

  let body: { role?: string; history?: MeshHistoryItem[]; text?: string; state?: string; cardToken?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const role: MeshRole = body.role === "employer" ? "employer" : "hospital";
  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "Missing message." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const res = await runMeshTurn({
          role,
          history: Array.isArray(body.history) ? body.history : [],
          text,
          state: typeof body.state === "string" ? body.state : undefined,
          cardToken: typeof body.cardToken === "string" ? body.cardToken : undefined,
          provider: "baseten",
          onEvent: (event: AgentEvent) => send({ type: "event", event }),
        });
        send({ type: "done", text: res.text, consults: res.consults, meta: res.meta });
      } catch {
        send({ type: "error", error: "The desk agent is unavailable right now." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
