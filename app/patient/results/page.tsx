"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Loader2,
  Pencil,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { useCovera } from "@/lib/store";
import { postOptimize } from "@/lib/api";
import { usd } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { WhatIfPanel } from "@/components/patient/whatif-panel";
import { PlanCard } from "@/components/patient/plan-card";
import { TrustPanel } from "@/components/patient/trust-panel";
import { FrontierChart } from "@/components/charts/frontier-chart";
import { Assistant } from "@/components/patient/assistant";

export default function ResultsPage() {
  const router = useRouter();
  const profile = useCovera((s) => s.profile);
  const result = useCovera((s) => s.result);
  const patchProfile = useCovera((s) => s.patchProfile);
  const setResult = useCovera((s) => s.setResult);
  const selectPlan = useCovera((s) => s.selectPlan);

  const [mounted, setMounted] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => setMounted(true), []);

  const key = profile ? JSON.stringify(profile) : "";
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setRecalc(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await postOptimize(profile);
        if (!cancelled) {
          setResult(res);
          setExpandedId((cur) => cur ?? res.ranked[0]?.plan.id ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setRecalc(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ranked = result?.ranked ?? [];
  const shortlist = result?.shortlist ?? [];
  const scale = useMemo(() => {
    if (ranked.length === 0) return { min: 0, max: 1 };
    return {
      min: Math.min(...ranked.map((r) => r.sim.p10)),
      max: Math.max(...ranked.map((r) => r.sim.p90)),
    };
  }, [ranked]);

  // Default view: the curated, de-duplicated set of genuinely different plans. "See all"
  // falls back to the full analyzed ranking, tagging any plan that also earned a role.
  const tagById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of shortlist) if (c.tag) m.set(c.ranked.plan.id, c.tag);
    return m;
  }, [shortlist]);
  const displayList = showAll
    ? ranked.map((r) => ({ ranked: r, tag: tagById.get(r.plan.id) }))
    : shortlist;
  const hasMore = ranked.length > shortlist.length;

  if (!mounted) return <LoadingShell />;
  if (!profile) {
    router.replace("/patient");
    return <LoadingShell />;
  }

  const top = ranked[0];
  const maxExpected = Math.max(...ranked.map((r) => r.sim.expectedTotal), 0);
  const savings = top ? maxExpected - top.sim.expectedTotal : 0;

  const makeCard = (planId: string) => {
    selectPlan(planId);
    router.push("/patient/card");
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <Link
            href="/patient"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Edit my details
          </Link>
          {result && (
            <span className="text-xs text-slate-400">
              {result.consideredCount} real plans · {result.scenarioCount.toLocaleString()} simulated years each
            </span>
          )}
        </div>

        {/* Recommendation hero */}
        {top ? (
          <div className="mt-4 overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <Badge tone="emerald">
                  <ShieldCheck className="h-3.5 w-3.5" /> Your best match
                </Badge>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {top.plan.marketingName}
                </h1>
                <p className="mt-1 text-slate-600">
                  {top.plan.issuer} · {top.plan.metal} · {top.plan.planType}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                  Lowest risk-adjusted cost across {result?.scenarioCount.toLocaleString()}{" "}
                  simulated years: about{" "}
                  <span className="font-semibold text-slate-900">
                    {usd(top.sim.expectedTotal)}
                  </span>{" "}
                  in a typical year, and no worse than{" "}
                  <span className="font-semibold text-slate-900">
                    {usd(top.sim.p90)}
                  </span>{" "}
                  even if the year goes badly.
                </p>
              </div>
              <div className="shrink-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs text-slate-400">Expected total / year</p>
                <p className="text-4xl font-bold tracking-tight text-emerald-700">
                  {usd(top.sim.expectedTotal)}
                </p>
                <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                  <p>{usd(top.sim.annualPremium)} premium after subsidy</p>
                  <p>{usd(top.sim.expectedOOP)} expected care costs</p>
                  {savings > 0 && (
                    <p className="flex items-center gap-1 font-medium text-emerald-700">
                      <TrendingDown className="h-3.5 w-3.5" /> saves ~{usd(savings)} vs the costliest option
                    </p>
                  )}
                </div>
              </div>
            </div>

            {result && <StatStrip result={result} />}
          </div>
        ) : (
          <div className="mt-10 grid place-items-center py-20 text-slate-400">
            {error ? (
              <p className="text-rose-500">{error}</p>
            ) : (
              <Loader2 className="h-8 w-8 animate-spin" />
            )}
          </div>
        )}

        {result?.explain && (
          <div className="mt-6">
            <TrustPanel explain={result.explain} />
          </div>
        )}

        {result && top && (
          <div className="mt-6">
            <Assistant profile={profile} result={result} />
          </div>
        )}

        {/* Body */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="lg:sticky lg:top-20 lg:h-fit">
            <WhatIfPanel
              profile={profile}
              onPatch={patchProfile}
              recalculating={recalc}
            />
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              {!showAll && shortlist.length > 0 && (
                <p className="text-xs text-slate-500">
                  {shortlist.length} distinct picks, curated from {ranked.length} close
                  contenders so you compare real choices, not near-identical plans.
                </p>
              )}
              {displayList.map((item, i) => (
                <PlanCard
                  key={item.ranked.plan.id}
                  ranked={item.ranked}
                  rank={i + 1}
                  scale={scale}
                  expanded={expandedId === item.ranked.plan.id}
                  onToggle={() =>
                    setExpandedId((cur) =>
                      cur === item.ranked.plan.id ? null : item.ranked.plan.id,
                    )
                  }
                  tag={item.tag}
                  onMakeCard={() => makeCard(item.ranked.plan.id)}
                />
              ))}
              {hasMore && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  {showAll
                    ? "Show the curated shortlist"
                    : `See all ${ranked.length} plans considered`}
                </button>
              )}
            </div>

            {result && result.frontier.length > 2 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">
                  Cost vs. risk: the efficient frontier
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Each dot is a plan. Lower-left is better: cheaper on average and
                  safer in a bad year. Tap a dot to open that plan.
                </p>
                <div className="mt-3">
                  <FrontierChart
                    points={result.frontier}
                    recommendedId={top?.plan.id}
                    selectedId={expandedId}
                    onSelect={(id) => setExpandedId(id)}
                  />
                </div>
              </div>
            )}

            <Provenance />
          </div>
        </div>
      </main>
    </>
  );
}

function StatStrip({ result }: { result: NonNullable<ReturnType<typeof useCovera.getState>["result"]> }) {
  const items = [
    {
      label: "Premium subsidy",
      value: `${usd(result.subsidy.aptcMonthly)}/mo`,
      hint: `${Math.round(result.subsidy.fplRatio * 100)}% of poverty level`,
    },
    {
      label: "Your modeled spend",
      value: usd(result.spendVsAverage.simulatedMean),
      hint: `avg for your age: ${usd(result.spendVsAverage.mepsAverage)}`,
    },
    {
      label: "Plans simulated",
      value: result.consideredCount.toLocaleString(),
      hint: `${result.shortlist.length} distinct picks shown`,
    },
    {
      label: "Benchmark (SLCSP)",
      value: `${usd(result.subsidy.slcspMonthly)}/mo`,
      hint: "2nd-lowest silver plan",
    },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 border-t border-emerald-100 pt-5 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-xs text-slate-400">{it.label}</p>
          <p className="text-lg font-semibold text-slate-900">{it.value}</p>
          <p className="text-xs text-slate-500">{it.hint}</p>
        </div>
      ))}
    </div>
  );
}

function Provenance() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Database className="h-4 w-4 text-slate-400" /> Where these numbers come from
      </h3>
      <ul className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-3">
        <li>
          <span className="font-medium text-slate-700">Plans &amp; prices</span>
          <br />
          CMS Exchange Public Use Files (PY2026)
        </li>
        <li>
          <span className="font-medium text-slate-700">Care patterns</span>
          <br />
          AHRQ Medical Expenditure Panel Survey
        </li>
        <li>
          <span className="font-medium text-slate-700">Subsidy</span>
          <br />
          ACA APTC via second-lowest silver benchmark
        </li>
      </ul>
      <p className="mt-3 text-xs text-slate-400">
        Estimates model your inputs against real plan rules. Confirm specifics
        with the issuer before enrolling.
      </p>
    </div>
  );
}

function LoadingShell() {
  return (
    <>
      <SiteHeader />
      <div className="grid place-items-center py-32 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    </>
  );
}
