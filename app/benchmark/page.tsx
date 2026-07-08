import type { Metadata } from "next";
import { Check as CheckIcon, X as XIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { loadAccuracyReport, loadLlmBenchmark } from "@/lib/benchmark/load";
import type { Check } from "@/lib/benchmark/types";
import { DistributionExplorer } from "@/components/benchmark/distribution-explorer";
import { BundleExplorer } from "@/components/benchmark/bundle-explorer";

export const metadata: Metadata = {
  title: "Covera: Accuracy & model benchmarks",
  description:
    "How accurate is Covera's simulation against published MEPS aggregates and the ACA subsidy formula, and how do candidate LLMs compare on faithfulness, tool use, latency, and cost.",
};

function fmt(c: Check): { actual: string; target: string } {
  if (c.unit === "$") return { actual: `$${c.actual.toLocaleString()}`, target: `$${c.target.toLocaleString()}` };
  if (c.unit === "%") return { actual: `${c.actual}%`, target: `${c.target}%` };
  return { actual: `${c.actual}x`, target: `${c.target}x` };
}

function CheckRow({ c }: { c: Check }) {
  const v = fmt(c);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-5 w-5 place-items-center rounded-full ${c.pass ? "bg-indigo-100 text-indigo-700" : "bg-rose-100 text-rose-600"}`}
        >
          {c.pass ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
        </span>
        <span className="text-sm text-slate-700">{c.label}</span>
      </div>
      <div className="text-right text-sm tabular-nums">
        <span className="font-semibold text-slate-900">{v.actual}</span>
        <span className="text-slate-400"> vs {v.target}</span>
      </div>
    </div>
  );
}

function CheckGroup({ title, checks }: { title: string; checks: Check[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-2">
        {checks.map((c) => (
          <CheckRow key={c.label} c={c} />
        ))}
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  const accuracy = loadAccuracyReport();
  const llm = loadLlmBenchmark();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Badge tone="emerald">Methodology & benchmarks</Badge>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          How accurate is Covera, really?
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          Two honest scorecards. First, how the Monte-Carlo simulation holds up against the published
          MEPS aggregates it claims to reproduce and the ACA subsidy formula. Second, how candidate
          models compare when driving the real agent: on whether they cite real numbers, call the
          right tools, and what they cost.
        </p>

        {/* ---- Simulation accuracy ---- */}
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Simulation accuracy</h2>
            {accuracy && (
              <span className="text-sm text-slate-500">
                {accuracy.summary.passed}/{accuracy.summary.total} checks within tolerance ·{" "}
                {accuracy.populationSize.toLocaleString()} simulated people
              </span>
            )}
          </div>

          {!accuracy ? (
            <NotRun cmd="npm run accuracy" what="the accuracy report" />
          ) : (
            <>
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <CheckGroup title="Mean spend by age band (vs MEPS)" checks={accuracy.ageBandCalibration} />
                <CheckGroup title="Spend concentration (vs MEPS)" checks={accuracy.concentration} />
                <CheckGroup title="ACA subsidy formula" checks={accuracy.subsidy} />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500">
                Read honestly: the engine reproduces adult age-band means, the ACA subsidy math, and
                (after adding a{" "}
                <span className="font-medium text-slate-700">person-year frailty term</span> that
                correlates a year&apos;s care across service lines) the real{" "}
                <span className="font-medium text-slate-700">spend concentration</span> the top few
                percent of people who drive most healthcare cost. That heavy tail is the hard part to
                get right, and it is what the bad-year risk you rank on depends on. Source:{" "}
                {accuracy.source}
              </p>
            </>
          )}
          <div className="mt-6">
            <DistributionExplorer />
          </div>
          <div className="mt-6">
            <BundleExplorer />
          </div>
        </section>

        {/* ---- LLM model benchmark ---- */}
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">LLM model benchmark</h2>
            {llm && (
              <span className="text-sm text-slate-500">
                {llm.suiteSize} questions · judged by {llm.judgeModel}
              </span>
            )}
          </div>

          {!llm ? (
            <NotRun cmd="npm run benchmark" what="the model benchmark (needs ANTHROPIC_API_KEY)" />
          ) : (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Faithfulness</th>
                    <th className="px-4 py-3 font-medium">Tool accuracy</th>
                    <th className="px-4 py-3 font-medium">Quality</th>
                    <th className="px-4 py-3 font-medium">Latency</th>
                    <th className="px-4 py-3 font-medium">Cost / 100 convos</th>
                  </tr>
                </thead>
                <tbody>
                  {llm.results.map((r) => (
                    <tr key={r.model} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.label}</td>
                      <td className="px-4 py-3 tabular-nums">{Math.round(r.faithfulness * 100)}%</td>
                      <td className="px-4 py-3 tabular-nums">{Math.round(r.toolAccuracy * 100)}%</td>
                      <td className="px-4 py-3 tabular-nums">{Math.round(r.quality * 100)}%</td>
                      <td className="px-4 py-3 tabular-nums">{r.latencySec}s</td>
                      <td className="px-4 py-3 tabular-nums">${r.costPer100.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500">
            Faithfulness = share of dollar figures in the reply that match a real simulated number
            (not hallucinated). Tool accuracy = share of questions where the model called the expected
            tool. Quality = LLM-as-judge rubric. Cost uses real token usage × published per-model
            pricing. The harness lives in <code className="text-slate-700">scripts/benchmark/</code>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function NotRun({ cmd, what }: { cmd: string; what: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <p className="text-sm text-slate-600">
        {what.charAt(0).toUpperCase() + what.slice(1)} hasn&apos;t been generated yet. Run{" "}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-800">{cmd}</code> to populate
        this section.
      </p>
    </div>
  );
}
