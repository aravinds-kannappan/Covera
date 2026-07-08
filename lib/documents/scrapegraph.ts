import type { DocumentKind, DocumentParse } from "@/lib/documents/types";
import { SERVICE_KEYS } from "@/lib/types";
import { SCHEMA_HINT, sanitizeExtracted } from "@/lib/documents/extract";
import { orthReady, orthRun, orthCached, OrthError } from "@/lib/orthogonal/client";
import crypto from "node:crypto";

// A second document extractor path, for when the source is a URL rather than pasted text or a
// PDF the browser already read. Examples: an employer benefits page, a hospital price
// transparency page, a public plan summary. ScrapeGraphAI fetches the page and runs LLM-driven
// extraction against the SAME per-kind schema the local extractor uses, so downstream code
// (apply-to-sim, bill audit, appeals) consumes an identical DocumentParse and cannot tell the
// difference. The pasted-text / PDF path is unchanged and still runs on Anthropic.
//
// Cost: $0.025 per extract, only when a user supplies a link. Results are cached by URL+kind
// so re-opening the same page does not re-bill. With no ORTHOGONAL_API_KEY this reports
// not-ready and the route falls back to the text extractor.

export function scrapeGraphReady(): boolean {
  return orthReady();
}

function extractionPrompt(kind: DocumentKind): string {
  return [
    `Extract structured data from this health-insurance ${kind} page.`,
    "Return ONLY a JSON object matching this shape (omit any field you cannot read; never invent values):",
    SCHEMA_HINT[kind],
    `serviceKey, when used, must be one of: ${SERVICE_KEYS.join(", ")}.`,
    "All money values are plain numbers (no $ or commas). Dates as ISO strings when present.",
  ].join("\n");
}

/** Pull the extracted object out of ScrapeGraphAI's response shape, tolerating variants. */
function pickResult(data: unknown): Record<string, unknown> {
  const d = (data ?? {}) as Record<string, unknown>;
  const candidate = d.result ?? d.output ?? d.data ?? d.json ?? d;
  return (candidate && typeof candidate === "object" ? candidate : {}) as Record<string, unknown>;
}

/**
 * Extract a document straight from a URL via ScrapeGraphAI. Returns the same DocumentParse the
 * local extractor returns, labeled honestly as a ScrapeGraphAI extraction. Never throws for a
 * provider/network problem: it returns a low-confidence, clearly-warned empty parse instead,
 * so a bad link degrades gracefully.
 */
export async function scrapeGraphExtractUrl(kind: DocumentKind, url: string): Promise<DocumentParse> {
  const warnings: string[] = [];
  const method = "ScrapeGraphAI extraction (url)";

  if (!orthReady()) {
    warnings.push("Link extraction is not configured (ORTHOGONAL_API_KEY missing).");
    return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0, method: "unconfigured", warnings };
  }
  if (!/^https?:\/\//i.test(url)) {
    warnings.push("A valid http(s) URL is required.");
    return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0, method, warnings };
  }

  const cacheKey = `covera:scrapegraph:${kind}:${crypto.createHash("sha1").update(url).digest("hex")}`;
  try {
    const raw = await orthCached<Record<string, unknown>>(cacheKey, 60 * 60 * 24, async () => {
      const { data } = await orthRun("scrapegraphai", "/api/extract", {
        url,
        prompt: extractionPrompt(kind),
      });
      return pickResult(data);
    });

    const parsedData = sanitizeExtracted(kind, raw, warnings);
    const filled = "lines" in parsedData
      ? parsedData.lines.length
      : "prescriptions" in parsedData
        ? parsedData.prescriptions.length
        : 5;
    const confidence = Math.max(0.2, Math.min(0.9, filled === 0 ? 0.2 : 0.6 + Math.min(0.3, filled * 0.05)));
    return { kind, data: parsedData, confidence, method, warnings };
  } catch (e) {
    const detail = e instanceof OrthError ? e.message : "extraction failed";
    warnings.push(`Could not read that link (${detail}). Paste the text instead.`);
    return { kind, data: sanitizeExtracted(kind, {}, warnings), confidence: 0, method, warnings };
  }
}
