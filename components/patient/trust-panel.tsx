"use client";
import { useState } from "react";
import { ShieldCheck, ScrollText, ListChecks, GitBranch, Info, ChevronDown } from "lucide-react";
import type { RecommendationExplanation } from "@/lib/sim/explain";
import type { Basis } from "@/lib/sim/waterfall";
import { Badge } from "@/components/ui/badge";
import { usd } from "@/lib/utils";

// The confidence / trust panel: it turns the engine's explanation payload into plain English
// so a user can see exactly how the recommendation was derived, what is a hard fact versus an
// assumption, how a normal year compares to a bad one, when a different plan would win, and
// the sources and guardrails behind it all.

const BASIS: Record<Basis, { label: string; tone: "sky" | "amber" | "violet" }> = {
  fact: { label: "Fact", tone: "sky" },
  assumption: { label: "Assumption", tone: "amber" },
  derived: { label: "Derived", tone: "violet" },
};

function Section({
  icon,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-slate-400">{icon}</span>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="hidden text-xs text-slate-400 sm:inline">{subtitle}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

export function TrustPanel({ explain }: { explain: RecommendationExplanation }) {
  const { waterfall, facts, scenarios } = explain.plan;
  const { sensitivity, trust } = explain;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-slate-900">Why we recommend this, in plain English</h3>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Every number is traceable. Nothing here is a black box.
      </p>

      <div className="mt-2">
        {/* Cost waterfall */}
        <Section icon={<ScrollText className="h-4 w-4" />} title="How your yearly cost is built" subtitle="premium to final estimate" defaultOpen>
          <div className="space-y-1.5">
            {waterfall.steps.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <Badge tone={BASIS[s.basis].tone}>{BASIS[s.basis].label}</Badge>
                  {s.label}
                </span>
                <span className={`font-medium tabular-nums ${s.amount < 0 ? "text-indigo-600" : "text-slate-900"}`}>
                  {s.amount < 0 ? "-" : "+"}
                  {usd(Math.abs(s.amount))}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
              <span>Expected total per year</span>
              <span className="tabular-nums text-indigo-700">{usd(waterfall.expectedAnnual)}</span>
            </div>
          </div>
          {waterfall.careBySource.length > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Where your modeled care comes from (allowed cost, before insurance)</p>
              <div className="mt-1.5 space-y-1">
                {waterfall.careBySource.map((c) => (
                  <div key={c.source} className="flex justify-between text-xs text-slate-600">
                    <span>{c.label}</span>
                    <span className="tabular-nums">{usd(c.allowed)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Facts vs assumptions */}
        <Section icon={<ListChecks className="h-4 w-4" />} title="Known facts vs. estimates" subtitle="what is fixed vs. modeled">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">Hard facts</p>
              <dl className="space-y-1">
                {facts.facts.map((f) => (
                  <div key={f.key} className="flex justify-between gap-2 text-xs">
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-right font-medium text-slate-800">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Assumptions</p>
              <dl className="space-y-1">
                {facts.assumptions.map((a) => (
                  <div key={a.key} className="text-xs">
                    <dt className="text-slate-500">{a.label}</dt>
                    <dd className="font-medium text-slate-800">{a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Section>

        {/* Scenarios */}
        <Section icon={<GitBranch className="h-4 w-4" />} title="What different years look like" subtitle="normal, rough, surgery, worst case">
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <table className="w-full text-sm">
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.key} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{s.label}</div>
                      <div className="text-xs text-slate-400">{s.description}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{usd(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Sensitivity */}
        {sensitivity && sensitivity.crossovers.length > 0 && (
          <Section icon={<Info className="h-4 w-4" />} title="When a different plan would win" subtitle="the tipping points">
            <ul className="space-y-2">
              {sensitivity.crossovers.map((c) => (
                <li key={c.challengerPlanId} className="text-sm text-slate-600">
                  {c.note}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Trust / compliance */}
        <Section icon={<ShieldCheck className="h-4 w-4" />} title="Sources, warnings & confidence" subtitle="what could change this">
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">{trust.uncertainty}</p>

            {(trust.drugCoverageFlags.length > 0 || trust.networkWarnings.length > 0) && (
              <div className="space-y-1">
                {trust.drugCoverageFlags.map((f, i) => (
                  <p key={`d${i}`} className="text-xs text-amber-700">• {f}</p>
                ))}
                {trust.networkWarnings.map((w, i) => (
                  <p key={`n${i}`} className="text-xs text-amber-700">• {w}</p>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500">What could change the recommendation</p>
              <ul className="mt-1 space-y-1">
                {trust.whatCouldChange.map((w, i) => (
                  <li key={i} className="text-xs text-slate-600">• {w}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500">Sources</p>
              <ul className="mt-1 space-y-0.5">
                {trust.sources.map((s, i) => (
                  <li key={i} className="text-xs text-slate-500">• {s}</li>
                ))}
              </ul>
            </div>

            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">{trust.disclaimer}</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
