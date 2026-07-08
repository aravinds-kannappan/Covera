import type { NextRequest } from "next/server";
import type { DocumentKind } from "@/lib/documents/types";
import { documentExtractor } from "@/lib/documents/extract";
import { scrapeGraphExtractUrl, scrapeGraphReady } from "@/lib/documents/scrapegraph";
import {
  auditDocument,
  deniedLines,
  employerPlanToPlan,
  extractedAccumulators,
} from "@/lib/documents/apply";

export const runtime = "nodejs";

const KINDS: DocumentKind[] = ["eob", "medicalBill", "employerPlan", "prescriptionList", "claimHistory"];

// Upload endpoint: takes a document kind and its extracted text, returns structured fields
// plus whatever the engine can immediately do with them (audit a bill/EOB, surface denied
// lines to appeal, turn an employer plan into a scoreable Plan, or expose year-to-date
// accumulators that refine the estimate). A PDF/OCR front end would post the text here; the
// contract does not change. Everything is labeled with its extraction confidence.

export async function POST(req: NextRequest) {
  let body: { kind?: string; text?: string; url?: string };
  try {
    body = (await req.json()) as { kind?: string; text?: string; url?: string };
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const kind = body.kind as DocumentKind;
  if (!KINDS.includes(kind)) {
    return Response.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
  }
  const text = String(body.text ?? "");
  const url = String(body.url ?? "").trim();

  // When the caller supplies a link and ScrapeGraphAI is configured, extract straight from the
  // page. Otherwise use the local text/PDF extractor. Both return an identical DocumentParse,
  // so everything downstream is unchanged.
  const parse =
    url && scrapeGraphReady()
      ? await scrapeGraphExtractUrl(kind, url)
      : await documentExtractor.extract(kind, text);

  // Best next action for each document type, using the extracted structure.
  let audit = null;
  let denied = null;
  let employerPlan = null;
  const accumulators = extractedAccumulators(parse.data);

  if (parse.data.kind === "eob" || parse.data.kind === "medicalBill") {
    audit = auditDocument(parse.data);
  }
  if (parse.data.kind === "eob") {
    const dl = deniedLines(parse.data);
    if (dl.length) denied = dl;
  }
  if (parse.data.kind === "employerPlan") {
    employerPlan = employerPlanToPlan(parse.data);
  }

  return Response.json({
    parse,
    audit,
    deniedLines: denied,
    employerPlan,
    accumulators,
    guidance:
      "Structured from your document with the confidence shown. Verify key fields before acting; this is decision support, not advice.",
  });
}
