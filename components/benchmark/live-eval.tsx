"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, Play, X } from "lucide-react";
import type { LiveEvalResult } from "@/lib/benchmark/live";
import { cn } from "@/lib/utils";

interface SuiteQ {
  text: string;
  expectTool: string | null;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

// Runs the Agents-as-Judge evaluation live, one question at a time, and fills in the real results
// as they come back. An agent answers each patient question with Covera's real tools; a judge agent
// then scores that answer against the real tool outputs.
export function LiveEval() {
  const [questions, setQuestions] = useState<SuiteQ[]>([]);
  const [ready, setReady] = useState(true);
  const [results, setResults] = useState<Record<number, LiveEvalResult>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/benchmark/run")
      .then((r) => r.json())
      .then((d) => {
        setQuestions(d.questions ?? []);
        setReady(Boolean(d.ready));
      })
      .catch(() => setError("Could not load the evaluation suite."));
  }, []);

  async function run() {
    if (running || questions.length === 0) return;
    setError(null);
    setResults({});
    setRunning(true);
    for (let i = 0; i < questions.length; i++) {
      setActiveIndex(i);
      try {
        const res = await fetch("/api/benchmark/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ index: i }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Evaluation failed.");
          break;
        }
        setResults((prev) => ({ ...prev, [i]: data as LiveEvalResult }));
      } catch {
        setError("Network error during evaluation.");
        break;
      }
    }
    setActiveIndex(null);
    setRunning(false);
  }

  const done = Object.values(results);
  const scored = done.filter((r) => r.expectTool);
  const agg =
    done.length > 0
      ? {
          overall: avg(done.map((r) => r.judge.overall)),
          faithfulness: avg(done.map((r) => r.judge.faithfulness)),
          toolAcc: scored.length ? Math.round((scored.filter((r) => r.toolHit === true).length / scored.length) * 100) : 100,
          latency: (avg(done.map((r) => r.ms)) / 1000).toFixed(1),
          model: done[0]?.model,
          judge: done[0]?.judgeModel,
        }
      : null;

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono text-[10px] text-indigo-600">Agents as judge</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            An agent answers each patient question using Covera&apos;s real tools. A judge agent then
            scores that answer against the real tool outputs. Runs live against the current model, so
            the numbers are produced fresh, not read from a file.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || !ready || questions.length === 0}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Running…" : done.length ? "Run again" : "Run the evaluation"}
        </button>
      </div>

      {!ready && (
        <p className="mt-3 text-sm text-slate-500">
          This runs on a real model, so it needs a key (`ANTHROPIC_API_KEY`, or an Orthogonal key for
          a Baseten model). It is a live, paid run and only fires when you click.
        </p>
      )}

      {agg && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Overall" value={`${agg.overall}`} />
          <Stat label="Faithfulness" value={`${agg.faithfulness}`} />
          <Stat label="Tool accuracy" value={`${agg.toolAcc}%`} />
          <Stat label="Median latency" value={`${agg.latency}s`} />
        </div>
      )}
      {agg && (
        <p className="mt-2 label-mono text-[10px] text-slate-400">
          answered by {agg.model} · judged by {agg.judge}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {questions.map((q, i) => (
          <QuestionRow key={i} q={q} result={results[i]} loading={activeIndex === i} />
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="label-mono text-[10px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function QuestionRow({ q, result, loading }: { q: SuiteQ; result?: LiveEvalResult; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{q.text}</p>
        {loading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-500" />
        ) : result ? (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-indigo-700">
            {result.judge.overall}
          </span>
        ) : (
          <span className="label-mono mt-0.5 shrink-0 text-[10px] text-slate-300">queued</span>
        )}
      </div>

      {result && (
        <div className="mt-3 space-y-3">
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-snug text-slate-700">{result.answer}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            {q.expectTool && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  result.toolHit ? "bg-indigo-50 text-indigo-700" : "bg-rose-50 text-rose-600",
                )}
              >
                {result.toolHit ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {q.expectTool}
              </span>
            )}
            {result.toolsCalled
              .filter((t) => t !== q.expectTool)
              .map((t, k) => (
                <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {t}
                </span>
              ))}
            <span className="label-mono text-[10px] text-slate-400">
              {result.supportedFigures}/{result.citedFigures} figures grounded in real numbers
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <Mini label="Faithful" value={result.judge.faithfulness} />
            <Mini label="Tool use" value={result.judge.toolUse} />
            <Mini label="Helpful" value={result.judge.helpfulness} />
          </div>
          {result.judge.rationale && <p className="text-xs italic text-slate-500">Judge: {result.judge.rationale}</p>}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <p className="label-mono text-[9px] text-slate-400">{label}</p>
      <p className="tabular-nums font-semibold text-slate-800">{value}</p>
    </div>
  );
}
