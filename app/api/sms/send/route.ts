import type { NextRequest } from "next/server";
import { getOrCreateThread, saveThread } from "@/lib/store/conversations";
import { runConcierge } from "@/lib/agents/orchestrator";
import { anthropicKeyPresent } from "@/lib/anthropic/client";

export const runtime = "nodejs";

// Powers the on-page live console. The visitor's message is processed by the same
// concierge that handles real texts, but keyed to a sandbox session id and returned
// directly so the UI can render the reply bubbles (with their rich meta panels).
export async function POST(req: NextRequest) {
  if (!anthropicKeyPresent()) {
    return Response.json(
      { error: "The live demo needs an ANTHROPIC_API_KEY. The scripted story above still works without it." },
      { status: 503 },
    );
  }

  let body: { sessionId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const text = String(body.text ?? "").trim();
  if (!sessionId || !text) return Response.json({ error: "Missing message." }, { status: 400 });

  const thread = await getOrCreateThread(`demo:${sessionId}`, "sandbox");
  const { replies } = await runConcierge(thread, text);
  await saveThread(thread);

  return Response.json({ replies, status: thread.status });
}
