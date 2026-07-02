"use client";
import { ChevronDown, CreditCard, MessageCircle, Sparkles } from "lucide-react";
import type { RankedPlan, ServiceKey } from "@/lib/types";
import { SERVICE_LABELS } from "@/lib/types";
import { cn, pct, usd } from "@/lib/utils";
import { describeCostShare, METAL_TONE } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RangeBar } from "@/components/charts/range-bar";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { CostCdf } from "@/components/charts/cost-cdf";
import { DriversBar } from "@/components/charts/drivers-bar";

const DETAIL_SERVICES: ServiceKey[] = [
  "primaryCare",
  "specialist",
  "emergencyRoom",
  "inpatient",
  "imagingAdvanced",
  "genericDrugs",
  "preferredBrandDrugs",
  "specialtyDrugs",
];

export function PlanCard({
  ranked,
  rank,
  scale,
  expanded,
  onToggle,
  tag,
  onMakeCard,
  onAsk,
}: {
  ranked: RankedPlan;
  rank: number;
  scale: { min: number; max: number };
  expanded: boolean;
  onToggle: () => void;
  tag?: string;
  onMakeCard?: () => void;
  onAsk?: () => void;
}) {
  const { plan, sim } = ranked;
  const drivers = Object.entries(sim.oopByService)
    .map(([service, oop]) => ({ service: service as ServiceKey, oop: oop! }))
    .sort((a, b) => b.oop - a.oop)
    .slice(0, 5);
  // Near-certain outcome: the spread is negligible (a patient who maxes out almost every year).
  const certain = sim.p90 - sim.p10 < Math.max(1, 0.015 * Math.max(1, sim.median));

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white shadow-sm transition-all",
        rank === 1 ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200",
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-4 p-5 text-left"
      >
        <div
          className={cn(
            "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold",
            rank === 1 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500",
          )}
        >
          {rank}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={METAL_TONE[plan.metal]}>{plan.metal}</Badge>
            {plan.hsaEligible && <Badge tone="sky">HSA</Badge>}
            {tag && (
              <Badge tone="emerald">
                <Sparkles className="h-3 w-3" /> {tag}
              </Badge>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-base font-semibold text-slate-900">
            {plan.marketingName}
          </h3>
          <p className="truncate text-sm text-slate-500">
            {plan.issuer} · {plan.planType} · {usd(plan.deductible)} deductible
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-400">Expected / yr</p>
          <p className="text-xl font-bold text-slate-900">{usd(sim.expectedTotal)}</p>
          <p className="text-xs text-slate-500">
            {usd(sim.annualPremium)} premium + {usd(sim.expectedOOP)} care
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      <div className="px-5 pb-4">
        <RangeBar
          p10={sim.p10}
          expected={sim.expectedTotal}
          p90={sim.p90}
          min={scale.min}
          max={scale.max}
        />
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Your all-in cost across {sim.histogram.reduce((a, b) => a + b.count, 0).toLocaleString()} simulated years
              </p>
              {certain ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This plan is close to a <strong>fixed {usd(sim.expectedTotal)}/yr</strong> for
                  you. Your care reaches the {usd(plan.oopMax)} out-of-pocket max in{" "}
                  {pct(sim.probHitOOPMax)} of simulated years, so there is little bad-year
                  variance: it is a near-certain cost, not a gamble.
                </div>
              ) : null}
              <DistributionChart sim={sim} />

              <p className="mb-1 mt-4 text-sm font-semibold text-slate-700">
                Chance your year stays under a given cost
              </p>
              <CostCdf sim={sim} />

              <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                {[
                  { k: "Typical (P10)", v: usd(sim.p10), c: "text-emerald-600" },
                  { k: "Median", v: usd(sim.median), c: "text-slate-900" },
                  { k: "Bad year (P90)", v: usd(sim.p90), c: "text-rose-600" },
                  { k: "Avg bad year", v: usd(sim.cvar90 ?? sim.p90), c: "text-amber-600" },
                  { k: "Hit OOP max", v: pct(sim.probHitOOPMax), c: "text-slate-900" },
                ].map((s) => (
                  <div key={s.k} className="rounded-lg bg-slate-50 px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">
                      {s.k}
                    </p>
                    <p className={cn("text-sm font-semibold", s.c)}>{s.v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                What drives your cost
              </p>
              <DriversBar drivers={drivers} />
              <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">
                What you pay, by service
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {DETAIL_SERVICES.map((s) => (
                  <div key={s} className="flex justify-between border-b border-slate-100 py-1">
                    <span className="text-slate-500">{SERVICE_LABELS[s]}</span>
                    <span className="font-medium text-slate-700">
                      {describeCostShare(plan.costShares[s])}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Out-of-pocket max</span>
                  <span className="font-medium text-slate-700">{usd(plan.oopMax)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {onMakeCard && (
              <Button size="sm" onClick={onMakeCard}>
                <CreditCard className="h-4 w-4" /> Make this my Coverage Card
              </Button>
            )}
            {onAsk && (
              <Button size="sm" variant="outline" onClick={onAsk}>
                <MessageCircle className="h-4 w-4" /> Ask about this plan
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
