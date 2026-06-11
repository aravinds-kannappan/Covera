import { HeartPulse, Pill, ShieldCheck } from "lucide-react";
import type { CoverageCard } from "@/lib/card";
import { usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** The patient-owned "membership card" visual, shared by the builder and provider views. */
export function CoverageCardVisual({ card }: { card: CoverageCard }) {
  const memberId = card.plan.id.slice(0, 8).toUpperCase();
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
      <div className="relative bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white">
        <div className="bg-grid absolute inset-0 opacity-10" aria-hidden />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-50">
              <ShieldCheck className="h-4 w-4" /> Covera Coverage Card
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{card.name}</p>
            <p className="text-sm text-emerald-100">
              {card.state} · age {card.age}
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-white/30">
            {card.plan.metal}
          </span>
        </div>
      </div>

      <div className="p-6">
        <p className="text-base font-semibold text-slate-900">{card.plan.name}</p>
        <p className="text-sm text-slate-500">
          {card.plan.issuer} · {card.plan.planType}
          {card.plan.hsa && " · HSA"}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[
            { k: "Deductible", v: usd(card.plan.deductible) },
            { k: "Out-of-pocket max", v: usd(card.plan.oopMax) },
            { k: "Premium", v: `${usd(card.plan.premiumMonthly)}/mo` },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{s.k}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{s.v}</p>
            </div>
          ))}
        </div>

        {(card.conditions.length > 0 || card.meds.length > 0) && (
          <div className="mt-4 space-y-3">
            {card.conditions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <HeartPulse className="h-4 w-4 text-rose-500" />
                {card.conditions.map((c) => (
                  <Badge key={c} tone="rose">
                    {c}
                  </Badge>
                ))}
              </div>
            )}
            {card.meds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill className="h-4 w-4 text-sky-500" />
                {card.meds.map((m, i) => (
                  <Badge key={i} tone="sky">
                    {m.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span>Member {memberId}</span>
          <span>Issued {card.issued}</span>
        </div>
      </div>
    </div>
  );
}
