import type { NextRequest } from "next/server";
import { getOrCreateThread, saveThread } from "@/lib/store/conversations";
import { runConcierge } from "@/lib/agents/orchestrator";
import { conciergeReady } from "@/lib/llm/router";

export const runtime = "nodejs";

// Powers the on-page live console AND the voice concierge. The visitor's message is processed by
// the same concierge that handles real texts, but keyed to a session id and returned directly so
// the UI can render the reply bubbles (with their rich meta panels). The voice tab posts
// provider: "baseten" to run the cheap Baseten brain; text callers omit it and stay on Claude.
export async function POST(req: NextRequest) {
  if (!conciergeReady()) {
    return Response.json(
      {
        error:
          "The live demo needs an assistant key: ANTHROPIC_API_KEY, or an Orthogonal key for a Baseten model. The scripted story above still works without it.",
      },
      { status: 503 },
    );
  }

  let body: { sessionId?: string; text?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!sessionId || !text) return Response.json({ error: "Missing message." }, { status: 400 });

  const provider = body.provider === "baseten" ? "baseten" : undefined;
  const thread = await getOrCreateThread(`demo:${sessionId}`, "sandbox");
  const { replies } = await runConcierge(thread, text, { provider });
  await saveThread(thread);

  return Response.json({ replies, status: thread.status });
}
