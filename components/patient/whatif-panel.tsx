"use client";
import { Loader2, Wand2 } from "lucide-react";
import type { PatientProfile } from "@/lib/types";
import { CONDITION_OPTIONS, EVENT_OPTIONS, RISK_OPTIONS } from "@/lib/options";
import { federalPovertyLevel } from "@/lib/sim/subsidy";
import { usd } from "@/lib/utils";
import { Chip, Field, Segmented, Toggle } from "@/components/ui/controls";

export function WhatIfPanel({
  profile,
  onPatch,
  recalculating,
}: {
  profile: PatientProfile;
  onPatch: (patch: Partial<PatientProfile>) => void;
  recalculating: boolean;
}) {
  const toggleIn = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const fplRatio = profile.annualIncome / federalPovertyLevel(profile.householdSize);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Wand2 className="h-4 w-4 text-emerald-600" /> Play with your scenario
        </h3>
        {recalculating && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> recalculating
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Change anything — the ranking re-simulates live.
      </p>

      <Field label="Conditions" className="mt-4">
        <div className="flex flex-wrap gap-1.5">
          {CONDITION_OPTIONS.map((c) => (
            <Chip
              key={c.key}
              active={profile.conditions.includes(c.key)}
              onClick={() =>
                onPatch({ conditions: toggleIn(profile.conditions, c.key) })
              }
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Life events" className="mt-4">
        <div className="flex flex-wrap gap-1.5">
          {EVENT_OPTIONS.map((e) => (
            <Chip
              key={e.key}
              active={profile.plannedEvents.includes(e.key)}
              onClick={() =>
                onPatch({ plannedEvents: toggleIn(profile.plannedEvents, e.key) })
              }
            >
              {e.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label={`Income — ${usd(profile.annualIncome)} (${Math.round(fplRatio * 100)}% FPL)`}
        className="mt-4"
      >
        <input
          type="range"
          min={0}
          max={150000}
          step={1000}
          value={profile.annualIncome}
          onChange={(e) => onPatch({ annualIncome: Number(e.target.value) })}
          className="w-full accent-emerald-600"
        />
      </Field>

      <Field label="Cost vs. risk" className="mt-4">
        <Segmented
          options={RISK_OPTIONS.map((r) => ({ key: r.key, label: r.label }))}
          value={profile.riskTolerance}
          onChange={(v) => onPatch({ riskTolerance: v })}
        />
      </Field>

      <div className="mt-4">
        <Toggle
          label="Only HSA-eligible plans"
          checked={!!profile.requireHsa}
          onChange={(b) => onPatch({ requireHsa: b })}
        />
      </div>
    </div>
  );
}
