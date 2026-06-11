"use client";
import { useEffect, useMemo, useState } from "react";
import { Lock, Stethoscope } from "lucide-react";
import type { CoverageCard } from "@/lib/card";
import { decodeCard, estimateProcedure } from "@/lib/card";
import type { ProcedurePrice } from "@/lib/sim/params";
import pricesJson from "@/data/procedure-prices.json";
import { DRUG_TIER_OPTIONS } from "@/lib/options";
import { describeCostShare } from "@/lib/format";
import { usd } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { CoverageCardVisual } from "@/components/coverage-card";

const PROCEDURES = (pricesJson as { procedures: ProcedurePrice[] }).procedures;

export default function CardViewPage() {
  const [card, setCard] = useState<CoverageCard | null>(null);
  const [mounted, setMounted] = useState(false);
  const [procId, setProcId] = useState(PROCEDURES[0].id);

  useEffect(() => {
    setMounted(true);
    const token = window.location.hash.slice(1);
    if (token) setCard(decodeCard(token));
  }, []);

  const proc = PROCEDURES.find((p) => p.id === procId)!;
  const estimate = useMemo(
    () => (card ? estimateProcedure(card.plan, proc) : null),
    [card, proc],
  );

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo href={null} />
          <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            <Lock className="h-3.5 w-3.5" /> Read-only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {!card ? (
          <div className="py-20 text-center text-slate-500">
            This link doesn&apos;t contain a valid coverage card.
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <Stethoscope className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-900">
                Shared by the patient for point-of-care use. This card shows
                coverage and estimated costs only — <strong>no medical records
                are accessed</strong>.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <CoverageCardVisual card={card} />

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Estimate a patient cost
                  </h2>
                  <select
                    value={procId}
                    onChange={(e) => setProcId(e.target.value)}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    {PROCEDURES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {estimate && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          If deductible not met
                        </p>
                        <p className="mt-1 text-xl font-bold text-slate-900">
                          {usd(estimate.beforeDeductible)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-600">
                          If deductible met
                        </p>
                        <p className="mt-1 text-xl font-bold text-emerald-700">
                          {usd(estimate.afterDeductible)}
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-slate-400">
                    Based on the plan&apos;s real cost-sharing and a typical allowed
                    amount of {usd(proc.typicalAllowed)}. Your facility&apos;s
                    negotiated price may differ.
                  </p>
                </div>

                {card.meds.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Medications &amp; coverage
                    </h2>
                    <div className="mt-3 space-y-2">
                      {card.meds.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{m.name}</span>
                          <span className="text-slate-500">
                            {DRUG_TIER_OPTIONS.find((t) => t.key === m.tier)?.label} ·{" "}
                            {describeCostShare(card.plan.costShares[m.tier])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
