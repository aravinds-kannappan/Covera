"use client";
import { useRef, useState } from "react";
import { Upload, FileText, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { extractFileText } from "@/lib/documents/pdf-text";
import { usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/controls";

// The actual upload surface. Drop a PDF (EOB, bill, employer plan summary, med list, claim
// history) or paste its text; the text is extracted in the browser, sent to /api/documents for
// structuring, and the result is turned into something useful: a bill audit, appeal candidates,
// a comparable employer plan, or year-to-date accumulators. Everything is labeled with its
// extraction confidence, and it degrades to a clear message when no extractor key is configured.

const KINDS = [
  { key: "medicalBill", label: "Medical bill" },
  { key: "eob", label: "Explanation of Benefits (EOB)" },
  { key: "employerPlan", label: "Employer plan summary" },
  { key: "prescriptionList", label: "Prescription list" },
  { key: "claimHistory", label: "Prior claim history" },
] as const;

type Kind = (typeof KINDS)[number]["key"];

interface Result {
  parse: { kind: Kind; data: Record<string, unknown>; confidence: number; method: string; warnings: string[] };
  audit: { totalBilled: number; potentialOvercharge: number; lines: { description: string; billed: number; referenceAllowed: number | null; flags: string[] }[]; flags: string[] } | null;
  deniedLines: { description: string; denialReason?: string }[] | null;
  employerPlan: { marketingName: string; deductible: number; oopMax: number } | null;
  accumulators: { deductibleMetToDate?: number; oopMetToDate?: number } | null;
}

export function DocumentUploader() {
  const [kind, setKind] = useState<Kind>("medicalBill");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setReading(true);
    setFileName(file.name);
    try {
      setText(await extractFileText(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
      setText("");
    } finally {
      setReading(false);
    }
  }

  async function analyze() {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, text }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data as Result);
    } catch {
      setError("Something went wrong analyzing the document.");
    } finally {
      setAnalyzing(false);
    }
  }

  const conf = result ? Math.round(result.parse.confidence * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Upload className="h-4 w-4 text-violet-600" /> Upload a document
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Drop a PDF of a bill, EOB, employer plan, med list, or claim history (or paste its text).
        We read it in your browser and structure it, then do something useful with it.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr]">
        <Field label="Document type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">File</label>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 hover:border-violet-400 hover:bg-violet-50/40"
          >
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {fileName || "Choose a PDF or text file…"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.csv,.md,text/plain,application/pdf"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <textarea
        className="mt-3 h-28 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm"
        placeholder="…or paste the document text here"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={analyze} disabled={!text.trim() || analyzing}>
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Analyze document
        </Button>
        {text && <span className="text-xs text-slate-400">{text.length.toLocaleString()} characters ready</span>}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Extraction confidence</span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
              <span
                className={`block h-1.5 rounded-full ${conf >= 60 ? "bg-emerald-500" : conf > 0 ? "bg-amber-500" : "bg-slate-300"}`}
                style={{ width: `${conf}%` }}
              />
            </span>
            <span>{conf}%</span>
            <span className="text-slate-400">· {result.parse.method}</span>
          </div>

          {result.parse.warnings.length > 0 && (
            <ul className="space-y-1">
              {result.parse.warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-700">• {w}</li>
              ))}
            </ul>
          )}

          {/* Bill / EOB audit */}
          {result.audit && (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">Bill audit</span>
                <span className={`text-sm font-bold ${result.audit.potentialOvercharge > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  {result.audit.potentialOvercharge > 0 ? `${usd(result.audit.potentialOvercharge)} to question` : "no obvious overcharge"}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {result.audit.lines.filter((l) => l.flags.length > 0).map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">{l.description}</span>
                    <span className="flex items-center gap-1.5">
                      {l.referenceAllowed != null && <span className="text-slate-400">typical ~{usd(l.referenceAllowed)}</span>}
                      {l.flags.includes("overcharge") && <Badge tone="rose">overcharge</Badge>}
                      {l.flags.includes("possible duplicate") && <Badge tone="amber">duplicate?</Badge>}
                      <span className="font-medium tabular-nums text-slate-800">{usd(l.billed)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Denied lines -> appeal candidates */}
          {result.deniedLines && result.deniedLines.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Appeal candidates</p>
              <ul className="mt-1 space-y-1">
                {result.deniedLines.map((l, i) => (
                  <li key={i} className="text-xs text-amber-800">
                    • {l.description}{l.denialReason ? ` — denied: ${l.denialReason}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700">
                Text Covera to draft an appeal letter for any of these (denials are overturned far
                more often than people expect).
              </p>
            </div>
          )}

          {/* Employer plan -> comparable plan */}
          {result.employerPlan && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Parsed <span className="font-medium">{result.employerPlan.marketingName}</span>: deductible{" "}
              {usd(result.employerPlan.deductible)}, OOP max {usd(result.employerPlan.oopMax)}. Ready to
              compare against the marketplace.
            </div>
          )}

          {/* Accumulators */}
          {result.accumulators && (
            <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              Year to date: {result.accumulators.deductibleMetToDate != null && <>deductible met {usd(result.accumulators.deductibleMetToDate)} </>}
              {result.accumulators.oopMetToDate != null && <>· out-of-pocket met {usd(result.accumulators.oopMetToDate)}</>}. This
              sharpens your cost estimate for the rest of the year.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
