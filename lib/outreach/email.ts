// Optional real delivery for outreach drafts, via Resend's REST API (no SDK, to keep the
// dependency footprint slim). When RESEND_API_KEY / OUTREACH_FROM_EMAIL are unset, the
// caller still has a fully composed draft to show and text — it just isn't sent.

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.OUTREACH_FROM_EMAIL;

export function emailConfigured(): boolean {
  return !!API_KEY && !!FROM;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!emailConfigured()) return { sent: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: params.to,
        subject: params.subject,
        text: params.body,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${detail}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
