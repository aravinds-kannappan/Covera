import crypto from "node:crypto";
import { orthReady, orthRun, orthCached, OrthError } from "@/lib/orthogonal/client";

// Live web search for the concierge, via Tavily. Covera's rankings and estimates always come
// from the deterministic simulation over real CMS plans; this fills the OTHER kind of gap:
// current, external coverage/formulary/policy facts that are not in the plan dataset (does a
// carrier cover a specific drug in a state, a prior-auth rule, a mid-year policy change).
// Results are clearly labeled as coming from a live web search so the concierge never blends
// them with simulated figures.
//
// Cost: $0.01 per search (basic depth, 3 results), cached by query so repeats do not re-bill.
// With no ORTHOGONAL_API_KEY it returns { available: false } and the concierge says it cannot
// look that up right now.

export interface WebSearchResult {
  available: boolean;
  answer?: string;
  sources?: { title: string; url: string }[];
  note?: string;
}

interface TavilyResponse {
  answer?: string;
  results?: { title?: string; url?: string }[];
}

export async function webSearch(query: string): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { available: false, note: "Empty query." };
  if (!orthReady()) {
    return { available: false, note: "Live web search is not configured (ORTHOGONAL_API_KEY missing)." };
  }

  const cacheKey = `covera:tavily:${crypto.createHash("sha1").update(q.toLowerCase()).digest("hex")}`;
  try {
    return await orthCached<WebSearchResult>(cacheKey, 60 * 60 * 6, async () => {
      const { data } = await orthRun<TavilyResponse>("tavily", "/search", {
        query: q,
        search_depth: "basic", // cheapest tier: 1 credit ($0.01)
        include_answer: true,
        max_results: 3,
      });
      const sources = (data.results ?? [])
        .filter((r) => r.url)
        .slice(0, 3)
        .map((r) => ({ title: r.title ?? r.url ?? "source", url: r.url as string }));
      return {
        available: true,
        answer: data.answer ?? "No direct answer was found.",
        sources,
      };
    });
  } catch (e) {
    const detail = e instanceof OrthError ? e.message : "search failed";
    return { available: false, note: `Web search failed (${detail}).` };
  }
}
