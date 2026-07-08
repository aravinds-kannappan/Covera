"use client";
import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Loader2, Sparkles, X } from "lucide-react";
import { EMPLOYER_BANDS, SUPPORTED_STATES } from "@/lib/options";
import { usd } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select, TextInput } from "@/components/ui/controls";
import { AgentConsole } from "@/components/mesh/agent-console";

const AFFORDABILITY = 0.0996; // ACA affordability threshold (share of income)

interface BandData {
  key: string;
  label: string;
  repAge: number;
  lowestPremium: number;
  slcsp: number;
}

const DEFAULT_WF: Record<string, { count: number; salary: number }> = {
  u30: { count: 8, salary: 48000 },
  "30s": { count: 12, salary: 68000 },
  "40s": { count: 10, salary: 82000 },
  "50s": { count: 7, salary: 95000 },
  "60p": { count: 4, salary: 98000 },
};

// ICHRA lets an employer vary its contribution by age (within the federal 3:1 age band). An
// age-rated contribution tracks the way premiums themselves rise with age, so it can make
// coverage affordable for older employees far more cheaply than lifting a flat amount for
// everyone. Factors are relative to the youngest band (the slider sets that base).
const AGE_FACTOR: Record<string, number> = {
  u30: 1.0,
  "30s": 1.25,
  "40s": 1.6,
  "50s": 2.2,
  "60p": 3.0,
};
type Curve = "flat" | "age";

export default function EmployerPage() {
  const [state, setState] = useState("TX");
  const [contribution, setContribution] = useState(400);
  const [curve, setCurve] = useState<Curve>("flat");
  const [groupMonthly, setGroupMonthly] = useState(650);
  const [wf, setWf] = useState(DEFAULT_WF);
  const [bands, setBands] = useState<BandData[] | null>(null);
  const [loading, setLoading] = useState(true);

  // The employer's contribution for one band at a given base (youngest-band) amount.
  const contribAt = (base: number, key: string) =>
    curve === "flat" ? base : Math.round(base * (AGE_FACTOR[key] ?? 1));

  useEffect(() => {
    setLoading(true);
    fetch("/api/employer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    })
      .then((r) => r.json())
      .then((d) => setBands(d.bands ?? null))
      .finally(() => setLoading(false));
  }, [state]);

  const rows = useMemo(() => {
    if (!bands) return [];
    return bands.map((b) => {
      const { count, salary } = wf[b.key] ?? { count: 0, salary: 60000 };
      const contrib = contribAt(contribution, b.key);
      const net = Math.max(0, b.lowestPremium - contrib);
      const employeeShare = Math.max(0, b.slcsp - contrib);
      const affordable = employeeShare <= AFFORDABILITY * (salary / 12);
      return { ...b, count, salary, contrib, net, affordable };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, wf, contribution, curve]);

  const totals = useMemo(() => {
    const head = rows.reduce((s, r) => s + r.count, 0);
    const employerAnnual = rows.reduce((s, r) => s + r.contrib * r.count, 0) * 12;
    const avgNet = head ? rows.reduce((s, r) => s + r.count * r.net, 0) / head : 0;
    const affordableHead = rows.reduce((s, r) => s + (r.affordable ? r.count : 0), 0);
    return { head, employerAnnual, avgNet, pctAffordable: head ? affordableHead / head : 0 };
  }, [rows]);

  // Smallest base contribution that makes coverage affordable for everyone, given the curve.
  const optimal = useMemo(() => {
    if (!bands) return null;
    const maxNeeded = Math.max(...bands.map((b) => b.slcsp));
    for (let base = 0; base <= maxNeeded; base += 10) {
      const ok = bands.every((b) => {
        const { count, salary } = wf[b.key] ?? { count: 0, salary: 60000 };
        return count === 0 || b.slcsp - contribAt(base, b.key) <= AFFORDABILITY * (salary / 12);
      });
      if (ok) {
        const annual =
          bands.reduce((s, b) => s + contribAt(base, b.key) * (wf[b.key]?.count ?? 0), 0) * 12;
        return { contribution: base, annual };
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, wf, curve]);

  // ICHRA vs the employer's current group plan.
  const groupCompare = useMemo(() => {
    if (groupMonthly <= 0 || totals.head === 0) return null;
    const groupAnnual = groupMonthly * totals.head * 12;
    const savings = groupAnnual - totals.employerAnnual;
    return { groupAnnual, savings };
  }, [groupMonthly, totals.head, totals.employerAnnual]);

  const maxPrem = Math.max(...(bands ?? []).map((b) => b.lowestPremium), 1);
  const setWfField = (key: string, field: "count" | "salary", value: number) =>
    setWf((w) => ({ ...w, [key]: { ...w[key], [field]: value } }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Badge tone="sky">
          <Building2 className="h-3.5 w-3.5" /> For employers
        </Badge>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          Make every benefit dollar count
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          Fund an <strong>ICHRA</strong> and give employees tax-free dollars to buy
          their own plan instead of one group plan. Model your contribution against
          real marketplace prices and see who gets affordable coverage. Every employee
          gets Covera year-round: a plan they text for, real cost estimates, a bill
          auditor, and an annual re-check.
        </p>

        <section className="mt-8">
          <Badge tone="emerald">Talk to the desk</Badge>
          <h2 className="mt-3 font-serif text-2xl font-medium tracking-tight text-slate-900">
            Ask the benefits desk out loud.
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            HR can just talk to it. It consults the concierge on an employee&apos;s behalf to show
            what they&apos;d really pay on the marketplace, net of the subsidy they&apos;d qualify for.
          </p>
          <div className="mt-5 max-w-xl">
            <AgentConsole role="employer" state={state} persona="employer" />
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {/* Contribution slider */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {curve === "flat" ? "Monthly ICHRA contribution" : "Base contribution (youngest band)"}
                  </p>
                  <p className="text-3xl font-bold text-slate-900">
                    {usd(contribution)}
                    <span className="text-base font-normal text-slate-400">/employee/mo</span>
                  </p>
                </div>
                <Field label="State" className="w-40">
                  <Select value={state} onChange={(e) => setState(e.target.value)}>
                    {SUPPORTED_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <input
                type="range"
                min={0}
                max={1200}
                step={10}
                value={contribution}
                onChange={(e) => setContribution(Number(e.target.value))}
                className="mt-4 w-full accent-indigo-600"
              />
              <div className="mt-4 flex items-center gap-2">
                {(["flat", "age"] as Curve[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurve(c)}
                    className={
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all " +
                      (curve === c
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")
                    }
                  >
                    {c === "flat" ? "Flat for everyone" : "Age-rated (up to 3×)"}
                  </button>
                ))}
              </div>
              {curve === "age" && (
                <p className="mt-2 text-xs text-slate-400">
                  Older employees get proportionally more, tracking how premiums rise with age.
                  Often reaches full affordability for less total spend than a flat raise.
                </p>
              )}
            </div>

            {/* Workforce + bars */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Your workforce</h2>
              <p className="mt-1 text-xs text-slate-500">
                Enter headcount and average salary per age band. Premiums are real
                lowest-cost plans for {state}.
              </p>
              {loading || !bands ? (
                <div className="grid place-items-center py-12 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {rows.map((r) => (
                    <div key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-20 text-sm font-medium text-slate-700">
                            {r.label}
                          </span>
                          <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                            <div
                              className="absolute inset-y-0 left-0 bg-indigo-500/80"
                              style={{
                                width: `${(Math.min(r.contrib, r.lowestPremium) / maxPrem) * 100}%`,
                              }}
                            />
                            <div
                              className="absolute inset-y-0 bg-slate-400"
                              style={{
                                left: `${(Math.min(r.contrib, r.lowestPremium) / maxPrem) * 100}%`,
                                width: `${(r.net / maxPrem) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="w-24 text-right text-sm text-slate-600">
                            {r.net === 0 ? "fully covered" : `${usd(r.net)}/mo`}
                          </span>
                          {r.affordable ? (
                            <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                          ) : (
                            <X className="h-4 w-4 shrink-0 text-rose-500" />
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0}
                          value={r.count}
                          onChange={(e) => setWfField(r.key, "count", Number(e.target.value))}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          title="Headcount"
                        />
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={r.salary}
                          onChange={(e) => setWfField(r.key, "salary", Number(e.target.value))}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          title="Avg salary"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center gap-4 pt-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500/80" /> employer covers
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> employee pays
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: outcomes */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Stat label="Employer cost / year" value={usd(totals.employerAnnual)} />
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Stat
                  label="Workforce with affordable coverage"
                  value={`${Math.round(totals.pctAffordable * 100)}%`}
                  tone={totals.pctAffordable >= 0.999 ? "emerald" : "amber"}
                />
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Stat label="Avg employee premium" value={`${usd(totals.avgNet)}/mo`} />
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Stat label="Employees modeled" value={String(totals.head)} />
              </div>
            </div>

            {optimal && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-indigo-800">
                  <Sparkles className="h-4 w-4" /> Cost-minimizing contribution
                </p>
                <p className="mt-2 text-sm text-indigo-900">
                  {usd(optimal.contribution)}/mo makes coverage affordable for
                  everyone: about {usd(optimal.annual)}/yr.
                </p>
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setContribution(optimal.contribution)}
                >
                  Use {usd(optimal.contribution)}/mo
                </Button>
              </div>
            )}

            {/* ICHRA vs current group plan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Compare to your group plan</p>
              <p className="mt-1 text-xs text-slate-500">
                What you pay per employee per month for group coverage today.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-slate-400">$</span>
                <input
                  type="number"
                  min={0}
                  step={25}
                  value={groupMonthly}
                  onChange={(e) => setGroupMonthly(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                />
                <span className="text-xs text-slate-400">/emp/mo</span>
              </div>
              {groupCompare && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-400">
                    Group plan: {usd(groupCompare.groupAnnual)}/yr · ICHRA: {usd(totals.employerAnnual)}/yr
                  </p>
                  <p
                    className={
                      "mt-1 text-lg font-bold " +
                      (groupCompare.savings >= 0 ? "text-indigo-700" : "text-rose-600")
                    }
                  >
                    {groupCompare.savings >= 0 ? "Save " : "Costs "}
                    {usd(Math.abs(groupCompare.savings))}/yr
                    <span className="text-xs font-normal text-slate-400"> {groupCompare.savings >= 0 ? "with ICHRA" : "more than group"}</span>
                  </p>
                </div>
              )}
            </div>

            <p className="px-1 text-xs text-slate-400">
              Affordability uses the ACA threshold ({Math.round(AFFORDABILITY * 1000) / 10}% of
              income) against the second-lowest silver plan. Premiums from CMS
              PY2026 Public Use Files; headcounts and salaries are your inputs.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "amber";
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p
        className={
          "text-2xl font-bold " +
          (tone === "emerald"
            ? "text-indigo-700"
            : tone === "amber"
              ? "text-amber-600"
              : "text-slate-900")
        }
      >
        {value}
      </p>
    </div>
  );
}
