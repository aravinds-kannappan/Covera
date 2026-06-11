"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Mic, Plus, Sparkles, X } from "lucide-react";
import type { DrugTier, PatientProfile, Prescription } from "@/lib/types";
import {
  CONDITION_OPTIONS,
  DRUG_TIER_OPTIONS,
  EVENT_OPTIONS,
  RISK_OPTIONS,
  SUPPORTED_STATES,
} from "@/lib/options";
import { defaultProfile, useCovera } from "@/lib/store";
import { postExtract } from "@/lib/api";
import { useSpeech } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Chip,
  Field,
  Segmented,
  Select,
  TextInput,
  Toggle,
} from "@/components/ui/controls";

export function IntakeForm() {
  const router = useRouter();
  const setProfile = useCovera((s) => s.setProfile);
  const setResult = useCovera((s) => s.setResult);
  const [form, setForm] = useState<PatientProfile>(
    () => useCovera.getState().profile ?? defaultProfile(),
  );
  const set = <K extends keyof PatientProfile>(k: K, v: PatientProfile[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleIn = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // Prescription draft
  const [rxName, setRxName] = useState("");
  const [rxTier, setRxTier] = useState<DrugTier>("genericDrugs");
  const [rxFreq, setRxFreq] = useState(12);
  const addRx = () => {
    const name = rxName.trim();
    if (!name) return;
    const rx: Prescription = { name, tier: rxTier, fillsPerYear: rxFreq };
    set("prescriptions", [...form.prescriptions, rx]);
    setRxName("");
  };

  // Natural-language / voice intake
  const speech = useSpeech();
  const [desc, setDesc] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const fillFromDescription = async () => {
    if (!desc.trim()) return;
    setExtracting(true);
    setExtractMsg(null);
    const { patch, error } = await postExtract(desc);
    setExtracting(false);
    if (error) return setExtractMsg(error);
    if (Object.keys(patch).length === 0)
      return setExtractMsg("Couldn't pull much from that — add a little more detail.");
    setForm((f) => ({
      ...f,
      ...patch,
      prescriptions: patch.prescriptions
        ? [...f.prescriptions, ...patch.prescriptions]
        : f.prescriptions,
    }));
    setExtractMsg("Filled in below — review and adjust anything.");
  };

  const submit = () => {
    setResult(null);
    setProfile(form);
    router.push("/patient/results");
  };

  return (
    <div className="space-y-6">
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-slate-900">
            Tell us in your own words
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Type or talk — we&apos;ll fill the form for you. Edit anything after.
        </p>
        <div className="relative mt-4">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="e.g. I'm 34 in Texas, make about $52k, my wife and I share a plan. I have type 1 diabetes and take insulin, and we're planning a baby next year."
            className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3.5 pr-12 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={() =>
                speech.listening ? speech.stop() : speech.start(setDesc)
              }
              title={speech.listening ? "Stop" : "Speak"}
              className={cn(
                "absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full transition-colors",
                speech.listening
                  ? "animate-pulse bg-rose-500 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={fillFromDescription}
            disabled={extracting || !desc.trim()}
          >
            {extracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Fill from description
              </>
            )}
          </Button>
          {extractMsg && <span className="text-sm text-slate-500">{extractMsg}</span>}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">About you</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Age">
            <TextInput
              type="number"
              min={0}
              max={120}
              value={form.age}
              onChange={(e) => set("age", Number(e.target.value))}
            />
          </Field>
          <Field label="State">
            <Select
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
            >
              {SUPPORTED_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sex">
            <Segmented
              options={[
                { key: "female", label: "Female" },
                { key: "male", label: "Male" },
              ]}
              value={form.sex}
              onChange={(v) => set("sex", v)}
            />
          </Field>
          <Field label="Household size" hint="People on your tax household">
            <TextInput
              type="number"
              min={1}
              max={12}
              value={form.householdSize}
              onChange={(e) => set("householdSize", Number(e.target.value))}
            />
          </Field>
          <Field
            label="Annual household income"
            hint="Drives your premium subsidy"
            className="sm:col-span-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <TextInput
                type="number"
                min={0}
                step={1000}
                value={form.annualIncome}
                onChange={(e) => set("annualIncome", Number(e.target.value))}
              />
            </div>
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Your health</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick anything that applies. We use it to model your likely care — it
          never leaves your device except to run the math.
        </p>

        <Field label="Ongoing conditions" className="mt-5">
          <div className="flex flex-wrap gap-2">
            {CONDITION_OPTIONS.map((c) => (
              <Chip
                key={c.key}
                active={form.conditions.includes(c.key)}
                onClick={() =>
                  set("conditions", toggleIn(form.conditions, c.key))
                }
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Expecting this year?" className="mt-5">
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((e) => (
              <Chip
                key={e.key}
                active={form.plannedEvents.includes(e.key)}
                onClick={() =>
                  set("plannedEvents", toggleIn(form.plannedEvents, e.key))
                }
              >
                {e.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Prescriptions" className="mt-5">
          {form.prescriptions.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {form.prescriptions.map((rx, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
                >
                  {rx.name}
                  <span className="text-xs text-slate-400">
                    {DRUG_TIER_OPTIONS.find((t) => t.key === rx.tier)?.label}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "prescriptions",
                        form.prescriptions.filter((_, j) => j !== i),
                      )
                    }
                    className="text-slate-400 hover:text-rose-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput
              placeholder="Drug name (e.g. Insulin)"
              value={rxName}
              onChange={(e) => setRxName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRx())}
              className="sm:flex-1"
            />
            <Select
              value={rxTier}
              onChange={(e) => setRxTier(e.target.value as DrugTier)}
              className="sm:w-44"
            >
              {DRUG_TIER_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Select
              value={rxFreq}
              onChange={(e) => setRxFreq(Number(e.target.value))}
              className="sm:w-36"
            >
              <option value={12}>Monthly</option>
              <option value={4}>Occasional</option>
              <option value={1}>One-time</option>
            </Select>
            <Button type="button" variant="outline" onClick={addRx}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </Field>

        <Field
          label="Doctors or hospitals you want to keep"
          hint="Optional, comma-separated"
          className="mt-5"
        >
          <TextInput
            placeholder="e.g. UT Southwestern, Dr. Chen"
            value={form.providers.join(", ")}
            onChange={(e) =>
              set(
                "providers",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </Field>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          What matters to you
        </h2>
        <Field label="How should we weigh cost vs. risk?" className="mt-4">
          <Segmented
            options={RISK_OPTIONS}
            value={form.riskTolerance}
            onChange={(v) => set("riskTolerance", v)}
          />
        </Field>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Only HSA-eligible plans"
            checked={!!form.requireHsa}
            onChange={(b) => set("requireHsa", b)}
          />
          <Toggle
            label="I use tobacco"
            checked={form.tobacco}
            onChange={(b) => set("tobacco", b)}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={submit}>
          Run my simulation <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
