// The single seam to Orthogonal's Run API. Every Orthogonal-backed capability (AgentPhone
// SMS, ScrapeGraphAI extraction, Tavily search, Didit verification, ScrapeGraphAI monitors)
// goes through this one helper, so there is exactly one place that holds the key, enforces
// the spend cap, and speaks the gateway protocol.
//
// It mirrors the rest of Covera: native fetch (no SDK, to keep the Vercel bundle slim), and
// graceful degradation. With no ORTHOGONAL_API_KEY every dependent feature reports not-ready
// and the app behaves exactly as before. Nothing here fires on page load or during a build:
// a paid call only happens when a caller explicitly invokes orthRun for a user action.

import { kvGet, kvSet } from "@/lib/store/redis";

const GATEWAY = "https://api.orth.sh/v1/run";
const API_KEY = process.env.ORTHOGONAL_API_KEY;

/** True when the Orthogonal gateway has a key and can make real calls. */
export function orthReady(): boolean {
  return !!API_KEY;
}

export type OrthErrorKind = "unconfigured" | "cap" | "http" | "network";

export class OrthError extends Error {
  kind: OrthErrorKind;
  status?: number;
  constructor(message: string, kind: OrthErrorKind, status?: number) {
    super(message);
    this.name = "OrthError";
    this.kind = kind;
    this.status = status;
  }
}

export interface OrthResult<T> {
  data: T;
  /** USD actually billed for this call, per the gateway response. 0 when unknown. */
  price: number;
}

function parsePrice(p: unknown): number {
  if (typeof p === "number") return Number.isFinite(p) ? p : 0;
  if (typeof p === "string") {
    const n = Number(p.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// --- Soft spend cap ---------------------------------------------------------
// ORTH_MAX_SPEND_USD is an optional ceiling. It is a soft guard (get-then-set, not a true
// atomic counter) which is plenty for keeping demo/dev spend bounded. When the recorded
// total reaches the cap, further paid calls are refused with an OrthError before any spend.

const SPEND_KEY = "covera:orth:spend";

function spendCapUSD(): number | null {
  const raw = process.env.ORTH_MAX_SPEND_USD;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function spentSoFar(): Promise<number> {
  const raw = await kvGet(SPEND_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function recordSpend(delta: number): Promise<void> {
  if (delta <= 0) return;
  const next = (await spentSoFar()) + delta;
  // 90 day window; the cap is about bounding a demo, not exact accounting.
  await kvSet(SPEND_KEY, next.toFixed(4), 60 * 60 * 24 * 90);
}

/** How much has been spent through the gateway so far (for a status panel / diagnostics). */
export async function orthSpendToDate(): Promise<{ spent: number; cap: number | null }> {
  return { spent: await spentSoFar(), cap: spendCapUSD() };
}

/**
 * Call an Orthogonal marketplace endpoint. `api` is the provider slug (e.g. "tavily"),
 * `path` its endpoint (e.g. "/search"), `body` the endpoint's parameters. Returns the
 * provider's response plus the price billed. Throws OrthError (never a bare fetch error)
 * so callers can degrade cleanly.
 */
export async function orthRun<T = unknown>(
  api: string,
  path: string,
  body: Record<string, unknown> = {},
): Promise<OrthResult<T>> {
  if (!API_KEY) {
    throw new OrthError("Orthogonal is not configured (ORTHOGONAL_API_KEY missing).", "unconfigured");
  }

  const cap = spendCapUSD();
  if (cap != null) {
    const spent = await spentSoFar();
    if (spent >= cap) {
      throw new OrthError(
        `Orthogonal spend cap reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}).`,
        "cap",
      );
    }
  }

  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ api, path, body }),
      cache: "no-store",
    });
  } catch (e) {
    throw new OrthError(e instanceof Error ? e.message : "network error", "network");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OrthError(`Orthogonal ${api}${path} failed (${res.status}): ${detail}`, "http", res.status);
  }

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    price?: unknown;
    data?: T;
    error?: string;
  };
  if (json.success === false) {
    throw new OrthError(`Orthogonal ${api}${path}: ${json.error ?? "call failed"}`, "http", res.status);
  }

  const price = parsePrice(json.price);
  if (cap != null && price > 0) await recordSpend(price);

  return { data: (json.data ?? (json as unknown)) as T, price };
}

/**
 * Run `fn`, but reuse a cached result under `cacheKey` for `ttlSeconds` first. Keeps repeat
 * queries (same Tavily question, same page extract) from re-billing. Uses the same KV store
 * as conversations: Upstash when configured, in-process Map otherwise.
 */
export async function orthCached<T>(
  cacheKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await kvGet(cacheKey);
  if (hit) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // fall through and recompute
    }
  }
  const value = await fn();
  await kvSet(cacheKey, JSON.stringify(value), ttlSeconds);
  return value;
}
