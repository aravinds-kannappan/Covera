import { anthropicKeyPresent } from "@/lib/anthropic/client";
import { anthropicTurn } from "./anthropic";
import { basetenReady, basetenTurn } from "./baseten";
import type { Provider, TurnRequest, TurnResult } from "./types";

// The one place callers ask for a model turn. It chooses a provider (honoring a preference and
// what is actually configured), and it fails soft: a Baseten hiccup falls back to Claude when a
// key is present, so a flaky gateway never takes the concierge down.

export type { Provider, TurnRequest, TurnResult } from "./types";

/** Resolve the concrete provider from a preference and what's configured. */
export function resolveProvider(pref?: Provider): Provider {
  if (pref === "baseten") return basetenReady() ? "baseten" : "anthropic";
  return "anthropic";
}

/** True when any brain can answer: Claude (Sonnet 5 / Haiku) or a Baseten model. */
export function conciergeReady(): boolean {
  return anthropicKeyPresent() || basetenReady();
}

export async function runAgentTurn(req: TurnRequest, pref?: Provider): Promise<TurnResult> {
  const provider = resolveProvider(pref);
  if (provider === "baseten") {
    try {
      return await basetenTurn(req);
    } catch (e) {
      // Baseten/gateway error: degrade to Claude if we can, otherwise surface it.
      if (anthropicKeyPresent()) return anthropicTurn(req);
      throw e;
    }
  }
  return anthropicTurn(req);
}
