import type { NextRequest } from "next/server";
import { verificationEnabled, sendEmailCode, checkEmailCode } from "@/lib/trust/verify";
import { normalizeId } from "@/lib/store/conversations";

export const runtime = "nodejs";

// Identity verification endpoint. Two actions:
//   { action: "send",  email, subjectId? }        -> emails a one-time code ($0.04)
//   { action: "check", email, code, subjectId? }  -> verifies the code (free); on success the
//                                                     subject is marked verified so Covera may
//                                                     send outreach on their behalf.
// subjectId is the member's thread id (their phone). When absent it is derived from nothing and
// verification is not bound to a member (send-only smoke test). With no ORTHOGONAL_API_KEY this
// returns 503 and the rest of the app is unaffected.

export async function POST(req: NextRequest) {
  if (!verificationEnabled()) {
    return Response.json(
      { error: "Identity verification is not configured (ORTHOGONAL_API_KEY missing)." },
      { status: 503 },
    );
  }

  let body: { action?: string; email?: string; code?: string; subjectId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const subjectId = body.subjectId ? normalizeId(String(body.subjectId)) : undefined;

  if (body.action === "send") {
    const res = await sendEmailCode(email, subjectId);
    return Response.json(res, { status: res.sent ? 200 : 400 });
  }
  if (body.action === "check") {
    const res = await checkEmailCode(email, String(body.code ?? ""), subjectId);
    return Response.json(res, { status: res.verified ? 200 : 400 });
  }
  return Response.json({ error: "action must be 'send' or 'check'" }, { status: 400 });
}
