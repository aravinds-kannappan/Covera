import type { Thread, ConvoMessage } from "@/lib/agents/types";
import { defaultProfile } from "@/lib/profile-defaults";
import { kvGet, kvSet } from "@/lib/store/redis";

const THREAD_TTL = 60 * 60 * 24 * 30; // 30 days
const threadKey = (id: string) => `covera:thread:${id}`;

/** Normalize a US phone number to a stable E.164-ish key, or return the raw id. */
export function normalizeId(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return trimmed; // demo session ids pass through unchanged
}

export async function getThread(id: string): Promise<Thread | null> {
  const raw = await kvGet(threadKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Thread;
  } catch {
    return null;
  }
}

export async function saveThread(thread: Thread): Promise<void> {
  thread.updatedAt = Date.now();
  await kvSet(threadKey(thread.id), JSON.stringify(thread), THREAD_TTL);
}

export function newThread(id: string, channel: Thread["channel"]): Thread {
  const now = Date.now();
  return {
    id,
    channel,
    // Start from the same defaults the web app uses so the simulation always has a
    // runnable profile; intake fills in the patient-specific fields over a few texts.
    profile: { ...defaultProfile() },
    messages: [],
    selectedPlanId: null,
    status: "intake",
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreateThread(
  id: string,
  channel: Thread["channel"],
): Promise<Thread> {
  return (await getThread(id)) ?? newThread(id, channel);
}

export function appendMessage(thread: Thread, msg: ConvoMessage): void {
  thread.messages.push(msg);
  // Keep memory bounded; the model only needs recent turns plus the persisted profile.
  if (thread.messages.length > 60) thread.messages = thread.messages.slice(-60);
}
