"use client";
import { motion } from "motion/react";
import { Check, ShieldCheck, X } from "lucide-react";
import type { Metal } from "@/lib/types";
import type { PlansMeta } from "@/lib/agents/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { METAL_TONE } from "@/lib/format";
import { usd } from "@/lib/utils";

// The plan picker the voice concierge pops up once it has gathered enough to rank plans. It shows
// the same real, simulated numbers the text UI does (expected all-in cost, the bad-year p90, the
// odds of hitting the OOP max), and choosing one hands the name back to the concierge so it fires
// finalize_plan and confirms out loud.
export function PlanChoiceModal({
  meta,
  onPick,
  onClose,
}: {
  meta: PlansMeta;
  onPick: (planName: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your plan"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone="emerald">
              <ShieldCheck className="h-3.5 w-3.5" /> {meta.label || "Your ranked plans"}
            </Badge>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              Pick the plan that fits you.
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ranked by risk-adjusted all-in cost on real CMS plans.
              {meta.subsidyMonthly > 0 ? ` Includes your ~$${meta.subsidyMonthly}/mo subsidy.` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {meta.topPlans.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className="rounded-2xl border border-slate-200 p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={METAL_TONE[p.metal as Metal] ?? "neutral"}>{p.metal}</Badge>
                    {i === 0 && <Badge tone="emerald">Best fit</Badge>}
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-900">{p.name}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <div>
                      <dt>Expected / yr</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{usd(p.expectedTotal)}</dd>
                    </div>
                    <div>
                      <dt>Bad year (p90)</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{usd(p.p90)}</dd>
                    </div>
                    <div>
                      <dt>Hit OOP max</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{p.probHitOOPMax}%</dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-xs text-slate-400">
                    Premium {usd(p.annualPremium)}/yr after subsidy
                  </p>
                </div>
                <Button size="sm" onClick={() => onPick(p.name)} className="shrink-0">
                  <Check className="h-4 w-4" /> Choose
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Decision support, not insurance advice. Confirm specifics with the issuer before enrolling.
        </p>
      </motion.div>
    </div>
  );
}
