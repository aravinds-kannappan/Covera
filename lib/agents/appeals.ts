import type { Thread } from "@/lib/agents/types";
import type { PatientProfile } from "@/lib/types";
import { MODELS, getAnthropic, anthropicKeyPresent } from "@/lib/anthropic/client";

// Defend — denial appeal drafter.
//
// KFF found ACA marketplace insurers denied ~19% of in-network claims in 2023, yet fewer
// than 1% of patients ever appeal — even though appeals succeed often. This composes a
// first-draft appeal letter from the patient's own situation. It degrades gracefully to a
// safe template when no API key is set (same guard as the rest of the agent), and never
// invents policy numbers, dates, or clinical facts not provided.

export interface AppealDraft {
  service: string;
  denialReason: string;
  subject: string;
  letter: string;
  /** Always false here — sending an appeal is a deliberate, human-confirmed action. */
  sent: false;
}

function appealSystemPrompt(): string {
  return [
    "You draft a concise, firm, professional health-insurance claim appeal letter for a patient.",
    'Output JSON only: { "subject": string, "letter": string }.',
    "Structure: state the claim/service and the stated denial reason, explain why it should be covered (medical necessity, plan benefits, or in-network status as applicable), and request a written response with appeal rights.",
    "8-14 sentences. Courteous but firm. Never invent member IDs, claim numbers, dates, diagnoses, or facts not provided — leave clearly marked [brackets] for the patient to fill.",
    "Close with 'Sent via Covera on behalf of the member.'",
  ].join("\n");
}

export async function draftAppeal(params: {
  thread: Thread;
  service: string;
  denialReason: string;
  planName?: string;
}): Promise<AppealDraft> {
  const { thread, service, denialReason, planName } = params;
  const profile = thread.profile as PatientProfile;

  const subjectDefault = `Appeal of denied claim — ${service}`;
  let subject = subjectDefault;
  let letter =
    `To the appeals department,\n\n` +
    `I am formally appealing the denial of my claim for ${service}. ` +
    `The stated reason was: "${denialReason}". I believe this service is covered under my plan` +
    `${planName ? ` (${planName})` : ""} and request a full review.\n\n` +
    `Please send a written determination and an explanation of my further appeal rights.\n\n` +
    `Thank you,\n[Member name] · [Member ID] · [Claim number]\nSent via Covera on behalf of the member.`;

  if (anthropicKeyPresent()) {
    const context = [
      `State: ${profile.state}. Age: ${profile.age}.`,
      planName ? `Plan: ${planName}.` : "",
      `Denied service: ${service}.`,
      `Stated denial reason: ${denialReason}.`,
      thread.notes.length ? `Patient context: ${thread.notes.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const msg = await getAnthropic().messages.create({
        model: MODELS.fast,
        max_tokens: 800,
        system: appealSystemPrompt(),
        messages: [{ role: "user", content: context }],
      });
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = JSON.parse(
        text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
      ) as { subject?: string; letter?: string };
      if (parsed.subject) subject = parsed.subject;
      if (parsed.letter) letter = parsed.letter;
    } catch {
      // Keep the safe template above.
    }
  }

  return { service, denialReason, subject, letter, sent: false };
}
