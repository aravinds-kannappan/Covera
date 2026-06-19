// A tiny key/value store for conversation threads. Uses Upstash Redis over its REST
// API (no TCP connection pool, so it's safe on serverless / Vercel) when configured,
// and falls back to an in-process Map otherwise. The Map is per-instance and resets on
// cold start — acceptable for local dev and the sandbox demo, but set the Upstash env
// vars for anything that needs to survive across requests.

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function redisConfigured(): boolean {
  return !!REST_URL && !!REST_TOKEN;
}

// --- In-memory fallback (module-level so it survives within a warm instance) ---
const mem = new Map<string, { value: string; expiresAt: number | null }>();

function memGet(key: string): string | null {
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.expiresAt != null && Date.now() > hit.expiresAt) {
    mem.delete(key);
    return null;
  }
  return hit.value;
}

// --- Upstash REST helper ---
async function command<T>(args: (string | number)[]): Promise<T> {
  const res = await fetch(REST_URL!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${REST_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const data = (await res.json()) as { result: T };
  return data.result;
}

export async function kvGet(key: string): Promise<string | null> {
  if (!redisConfigured()) return memGet(key);
  return command<string | null>(["GET", key]);
}

/** Set a value with an optional TTL in seconds. */
export async function kvSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  if (!redisConfigured()) {
    mem.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
    return;
  }
  if (ttlSeconds) await command(["SET", key, value, "EX", ttlSeconds]);
  else await command(["SET", key, value]);
}

