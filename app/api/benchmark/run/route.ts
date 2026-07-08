import type { NextRequest } from "next/server";
import { conciergeReady } from "@/lib/llm/router";
import { evaluateQuestion, SUITE_META, SUITE_SIZE } from "@/lib/benchmark/live";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET returns the question suite (so the page can list it before running). POST evaluates one
// question: an agent answers it with the real Covera tools, then a judge agent scores that answer.
// This is a live, paid run (LLM calls), so it only fires on an explicit click, one question at a
// time to stay well inside the serverless time limit.

export async function GET() {
  return Response.json({ size: SUITE_SIZE, questions: SUITE_META, ready: conciergeReady() });
}

export async function POST(req: NextRequest) {
  if (!conciergeReady()) {
    return Response.json(
      { error: "The evaluation needs a model key: ANTHROPIC_API_KEY, or an Orthogonal key for a Baseten model." },
      { status: 503 },
    );
  }

  let body: { index?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= SUITE_SIZE) {
    return Response.json({ error: "index out of range" }, { status: 400 });
  }

  try {
    const result = await evaluateQuestion(index, "baseten");
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "evaluation failed" }, { status: 500 });
  }
}
