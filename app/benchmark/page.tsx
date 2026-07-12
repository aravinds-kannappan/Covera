import type { Metadata } from "next";
import { Check as CheckIcon, X as XIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { loadAccuracyReport, loadCalibrationReport, loadSafetyReport } from "@/lib/benchmark/load";
import type { Check, CalibrationMetric } from "@/lib/benchmark/types";
import { DistributionExplorer } from "@/components/benchmark/distribution-explorer";
import { BundleExplorer } from "@/components/benchmark/bundle-explorer";
import { LiveEval } from "@/components/benchmark/live-eval";

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

function metricStr(m: CalibrationMetric, field: "simulated" | "real"): string {
  const v = m[field];
  return m.unit === "$" ? `$${v.toLocaleString()}` : `${v}%`;
}

function CalibrationRow({ m }: { m: CalibrationMetric }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-5 w-5 place-items-center rounded-full ${m.pass ? "bg-indigo-100 text-indigo-700" : "bg-rose-100 text-rose-600"}`}
        >
          {m.pass ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
        </span>
        <span className="text-sm text-slate-700">{m.label}</span>
      </div>
      <div className="text-right text-sm tabular-nums">
        <span className="font-semibold text-slate-900">{metricStr(m, "simulated")}</span>
        <span className="text-slate-400"> vs {metricStr(m, "real")}</span>
        <span className="ml-2 text-xs text-slate-400">{(m.pctError * 100).toFixed(0)}% off</span>
      </div>
    </div>
  );
}

function CalibrationGroup({ title, subtitle, metrics }: { title: string; subtitle: string; metrics: CalibrationMetric[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-2">
        {metrics.map((m) => (
          <CalibrationRow key={m.label} m={m} />
        ))}
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  const accuracy = loadAccuracyReport();
  const safety = loadSafetyReport();
  const calibration = loadCalibrationReport();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Badge tone="emerald">Methodology & benchmarks</Badge>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          How accurate is Covera, really?
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          Four scorecards, each measured against real data. Whether the cost model, trained on past
          years, predicts a year it has never seen. How the simulation holds up against published MEPS
          aggregates and the ACA subsidy formula. Whether the recommendation stays safe when a model is
          in the loop. And how the model itself performs, scored live by a judge agent.
        </p>

        {/* ---- Held-out validation (the trust headline) ---- */}
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-slate-900">
              Held-out validation
            </h2>
            {calibration && (
              <span className="text-sm text-slate-500">
                held-out error {(calibration.summary.holdoutMape * 100).toFixed(1)}% · train error{" "}
                {(calibration.summary.trainMape * 100).toFixed(1)}% · {calibration.summary.passed}/
                {calibration.summary.total} within tolerance
              </span>
            )}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            The cost model&apos;s parameters are <span className="font-medium text-slate-700">fit</span>{" "}
            to real MEPS microdata from {calibration ? calibration.trainSplit : "2021 + 2022"}, then
            scored against the <span className="font-medium text-slate-700">held-out</span>{" "}
            {calibration ? calibration.holdoutSplit : "2023"} year it never saw during fitting. This is
            the honest test: a model can always be tuned to match the numbers it was tuned on, so the
            question that matters is whether it predicts a year it has not seen. It does, within single
            digits, and the held-out error is close to the training error, which is what tells you it is
            not overfit.
          </p>

          {!calibration ? (
            <NotRun cmd="npm run calibrate" what="the held-out calibration report" />
          ) : (
            <>
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <CalibrationGroup
                  title="Held-out 2023 (never seen during fitting)"
                  subtitle={`Simulated from params fit on ${calibration.trainSplit}, scored vs real ${calibration.holdoutSplit}.`}
                  metrics={calibration.holdout}
                />
                <CalibrationGroup
                  title="Train fit (reference)"
                  subtitle={`How well the fitted params reproduce their own ${calibration.trainSplit} source.`}
                  metrics={calibration.train}
                />
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500">
                Each row is the simulated figure vs the real MEPS figure. The model reproduces mean spend
                by age band and the concentration of spending (the top few percent of people who drive
                most cost) on a completely unseen year. Source: {calibration.source}
              </p>
            </>
          )}
        </section>

        {/* ---- Alignment & Safety ---- */}
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-slate-900">Alignment &amp; safety</h2>
            {safety && (
              <span className="text-sm text-slate-500">
                {safety.summary.passed}/{safety.summary.total} checks pass ·{" "}
                {safety.populationSize.toLocaleString()} patients + a red-team
              </span>
            )}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            Covera&apos;s recommendation is not a bare argmin. It runs through a deterministic
            actor/critic/memory governance layer, and the critic is a hard safety backstop: it will not
            let an unsafe plan be the headline, even when it is the cheapest. This scorecard measures
            that guarantee over a synthetic population and against an adversarial red-team, with no model
            in the loop, so every figure is reproducible.
          </p>

          {!safety ? (
            <NotRun cmd="npm run safety" what="the safety scorecard" />
          ) : (
            <>
              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <CheckGroup title="Governed selection (the critic)" checks={safety.governance} />
                <CheckGroup title="Risk-adjusted advice" checks={safety.alignment} />
                <CheckGroup title="Reproducible &amp; consistent" checks={safety.determinism} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <p className="text-sm leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-700">Why it matters.</span> An LLM that
                  recommends insurance can quietly steer someone onto a plan that drops their medication
                  or leaves them exposed to a catastrophic year. Covera puts a deterministic critic
                  between the model and the recommendation: dropped drugs or doctors, an unmet HSA
                  requirement, and a brutal bad year for a risk-averse patient are all hard vetoes. The
                  red-team hands the critic those exact unsafe picks and confirms it blocks every one.
                </p>
                <p className="text-sm leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-700">The nuance.</span> Organic critic
                  vetoes over the population were {safety.vetoesIssued}: the risk-adjusted objective
                  already avoids unsafe headlines, so the critic rarely has to fire. That is the point of
                  the two-layer design, and the adversarial suite is what proves the backstop still works
                  when it must. No LLM judged anything here. Source: {safety.source}
                </p>
              </div>
            </>
          )}
        </section>

        {/* ---- Simulation accuracy ---- */}
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-slate-900">Simulation accuracy</h2>
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
                The engine reproduces the age-band means, the ACA subsidy math, and
                (via a{" "}
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

        {/* ---- Model quality, judged live ---- */}
        <section className="mt-14">
          <h2 className="font-serif text-2xl font-medium tracking-tight text-slate-900">
            Model quality, judged live
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            Faithfulness is the share of dollar figures in a reply that match a real simulated number
            instead of a hallucination. Tool accuracy is whether the model reached for the right tool.
            The rest is scored by a separate judge agent. Press run to evaluate the current model
            against the suite. Each question runs on its own, so you watch the results come in.
          </p>
          <LiveEval />
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
