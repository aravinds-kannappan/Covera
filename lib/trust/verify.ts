import { orthReady, orthRun, OrthError } from "@/lib/orthogonal/client";
import { kvGet, kvSet } from "@/lib/store/redis";

// Identity verification before Covera acts on a member's behalf. Insurance outreach is
// sensitive: drafting is always free and safe, but actually SENDING a message to an employer's
// HR or a hospital about a specific person should follow a lightweight proof that the member
// controls the contact. This module does email verification (Didit): send a one-time code
// ($0.04), then check it (free). Once checked, the member (keyed by their thread id) is marked
// verified so the outreach send gate opens.
//
// Phone OTP ($0.30), database validation ($0.31), and AML screening ($0.36) are intentionally
// left as disabled scaffolds at the bottom of this file. Per the current plan they are not
// wired, to keep cost minimal. Turning them on is a deliberate, isolated change.

/** True when identity verification can actually run (Orthogonal key present). */
export function verificationEnabled(): boolean {
  return orthReady();
}

const verifiedKey = (subjectId: string) => `covera:verified:${subjectId}`;

/** Has this subject (usually a thread id / phone) completed identity verification? */
export async function isContactVerified(subjectId: string): Promise<boolean> {
  if (!subjectId) return false;
  return (await kvGet(verifiedKey(subjectId))) === "1";
}

async function markContactVerified(subjectId: string): Promise<void> {
  await kvSet(verifiedKey(subjectId), "1", 60 * 60 * 24 * 180); // 180 days
}

export interface SendCodeResult {
  sent: boolean;
  note?: string;
}

/**
 * Send a one-time verification code to an email. `subjectId` (a thread id / phone) is passed
 * as vendor_data so the later check can bind the verification to this member. Bills $0.04.
 */
export async function sendEmailCode(email: string, subjectId?: string): Promise<SendCodeResult> {
  if (!verificationEnabled()) return { sent: false, note: "Verification is not configured." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { sent: false, note: "A valid email is required." };
  try {
    await orthRun("didit", "/v3/email/send", {
      email,
      ...(subjectId ? { vendor_data: subjectId } : {}),
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, note: e instanceof OrthError ? e.message : "send failed" };
  }
}

export interface CheckCodeResult {
  verified: boolean;
  note?: string;
}

/**
 * Check an email verification code. On success, mark `subjectId` verified so outreach can be
 * sent on the member's behalf. This check itself is free.
 */
export async function checkEmailCode(
  email: string,
  code: string,
  subjectId?: string,
): Promise<CheckCodeResult> {
  if (!verificationEnabled()) return { verified: false, note: "Verification is not configured." };
  try {
    const { data } = await orthRun<{ status?: string; verified?: boolean }>(
      "didit",
      "/v3/email/check",
      { email, code },
    );
    const ok = data.verified === true || String(data.status ?? "").toLowerCase() === "approved" || String(data.status ?? "").toLowerCase() === "verified";
    if (ok && subjectId) await markContactVerified(subjectId);
    return { verified: ok, note: ok ? undefined : "Code did not match." };
  } catch (e) {
    return { verified: false, note: e instanceof OrthError ? e.message : "check failed" };
  }
}

// --- Disabled scaffolds (not wired; documented cost) ------------------------
// These exist so the higher-assurance paths are one small, deliberate change away. They are
// NOT called anywhere and bill nothing.
//
//   Phone OTP:            orthRun("didit", "/v3/phone/send", { phone_number })   // $0.30
//                         orthRun("didit", "/v3/phone/check", { phone_number, code })
//   Database validation:  orthRun("didit", "/v3/database-validation", { ...pii }) // $0.31
//   AML screening:        orthRun("didit", "/v3/aml", { entity_type, ...q })      // $0.36
