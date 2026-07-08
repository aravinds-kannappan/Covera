import type { Thread, OutreachMeta } from "@/lib/agents/types";
import type { PatientProfile } from "@/lib/types";
import { MODELS, getAnthropic } from "@/lib/anthropic/client";
import { sendEmail, emailConfigured } from "@/lib/outreach/email";
import { verificationEnabled, isContactVerified } from "@/lib/trust/verify";

// The Outreach sub-agent. Once a patient finalizes a plan, the concierge can ask this
// agent to compose a professional message to the employer's HR or to a hospital/provider
//: e.g. confirming an employer would accept a marketplace plan, or asking a hospital
// whether a procedure is in-network and what it will cost. It returns a draft; it only
// actually sends when email is configured AND the caller opts to send.

function outreachSystemPrompt(target: "employer" | "hospital"): string {
  const audience =
    target === "employer"
      ? "the patient's employer Human Resources / benefits contact"
      : "a hospital or provider's billing / patient-services desk";
  return [
    `You draft a short, professional message from a patient (or their coverage assistant on their behalf) to ${audience}.`,
    "Output JSON only: { \"subject\": string, \"body\": string }.",
    "The body should be 4-8 sentences, courteous, specific, and end with a clear ask and a request to reply.",
    "Never invent contact names, policy numbers, or facts not provided. Refer to figures only if given.",
    "Never use em dashes; use a period, a colon, or parentheses instead.",
    "Sign as 'Sent via Covera on behalf of the member.'",
  ].join("\n");
}

export async function draftOutreach(params: {
  thread: Thread;
  target: "employer" | "hospital";
  to?: string | null;
  note?: string;
  planName?: string;
  send?: boolean;
}): Promise<OutreachMeta> {
  const { thread, target, to = null, note, planName, send } = params;
  const profile = thread.profile as PatientProfile;

  const context = [
    `Patient state: ${profile.state}. Age: ${profile.age}.`,
    planName ? `Finalized plan: ${planName}.` : "",
    note ? `Patient's note / request: ${note}` : "",
    target === "employer"
      ? "Goal: ask whether the employer can support / reimburse this individual marketplace plan (e.g. via ICHRA), or coordinate enrollment."
      : "Goal: confirm the plan is in-network and ask for a written cost estimate for the patient's expected care.",
  ]
    .filter(Boolean)
    .join("\n");

  let subject = target === "employer" ? "Question about my health coverage" : "In-network & cost estimate request";
  let body =
    "Hello,\n\nI'm reaching out about my health coverage and would appreciate your help. Please let me know the best next step.\n\nThank you,\nSent via Covera on behalf of the member.";

  try {
    const msg = await getAnthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 600,
      system: outreachSystemPrompt(target),
      messages: [{ role: "user", content: context }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      subject?: string;
      body?: string;
    };
    if (parsed.subject) subject = parsed.subject;
    if (parsed.body) body = parsed.body;
  } catch {
    // Fall back to the safe default draft above.
  }

  let sent = false;
  let deliveryNote: string | undefined;
  if (send && to && emailConfigured()) {
    // Identity gate: when verification is enabled, only send on behalf of a member whose
    // identity was verified. When verification is not configured, behavior is unchanged.
    if (verificationEnabled() && !(await isContactVerified(thread.id))) {
      deliveryNote =
        "Held back: the member's identity is not verified yet. Verify an email at /api/verify before sending on their behalf.";
    } else {
      const res = await sendEmail({ to, subject, body });
      sent = res.sent;
      if (!res.sent && res.error) deliveryNote = res.error;
    }
  }

  return { target, to, subject, body, sent, note: deliveryNote };
}
