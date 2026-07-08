"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Loader2,
  ScanLine,
  Stethoscope,
  TrendingUp,
} from "lucide-react";
import { SUPPORTED_STATES } from "@/lib/options";
import { decodeCard, estimateProcedure } from "@/lib/card";
import { PROCEDURES } from "@/lib/sim/params";
import { usd } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/controls";
import { BillAuditor } from "@/components/hospital/bill-auditor";
import { AgentConsole } from "@/components/mesh/agent-console";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { METAL_TONE } from "@/lib/format";
import type { Metal } from "@/lib/types";

interface HospitalResult {
  procedure: { label: string; typicalAllowed: number };
  count: number;
  stats: { min: number; median: number; max: number };
  cheapest: { name: string; issuer: string; metal: Metal; before: number; after: number }[];
  costliest: { name: string; issuer: string; metal: Metal; before: number }[];
}

export default function HospitalPage() {
  const [facility, setFacility] = useState("");
  const [state, setState] = useState("TX");
  const [procId, setProcId] = useState(PROCEDURES[0].id);
  const [data, setData] = useState<HospitalResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/hospital", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, procedureId: procId }),
    })
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .finally(() => setLoading(false));
  }, [state, procId]);

  const maxBar = data
    ? Math.max(...data.cheapest.map((p) => p.before), ...data.costliest.map((p) => p.before))
    : 1;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <Badge tone="violet">
          <Stethoscope className="h-3.5 w-3.5" /> For hospitals
        </Badge>
        <h1 className="mt-4 font-serif text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
          Cost clarity at the front desk
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          Surprise bills become bad debt. See what a procedure will cost a patient
          across every marketplace plan, now priced from real CMS Medicare physician
          data, and read a patient&apos;s Coverage Card to quote their cost on the spot
          without ever touching a record.
        </p>

        <section className="mt-8">
          <Badge tone="emerald">Talk to the desk</Badge>
          <h2 className="mt-3 font-serif text-2xl font-medium tracking-tight text-slate-900">
            Ask the cost desk out loud.
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            A physician or biller can just talk to it. Paste the patient&apos;s Coverage Card and it
            consults their Covera concierge for real coverage and a live cost estimate: no record
            pulled, no guessing.
          </p>
          <div className="mt-5 max-w-xl">
            <AgentConsole role="hospital" state={state} persona="clinical" />
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Procedure across plans */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <TrendingUp className="h-4 w-4 text-violet-600" /> What a procedure costs
              across plans
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Facility (optional)" className="sm:col-span-1">
                <TextInput
                  placeholder="e.g. UT Southwestern"
                  value={facility}
                  onChange={(e) => setFacility(e.target.value)}
                />
              </Field>
              <Field label="State">
                <Select value={state} onChange={(e) => setState(e.target.value)}>
                  {SUPPORTED_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Procedure">
                <Select value={procId} onChange={(e) => setProcId(e.target.value)}>
                  {PROCEDURES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {loading || !data ? (
              <div className="grid place-items-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  {[
                    { k: "Cheapest plan", v: usd(data.stats.min), c: "text-indigo-700" },
                    { k: "Median", v: usd(data.stats.median), c: "text-slate-900" },
                    { k: "Costliest plan", v: usd(data.stats.max), c: "text-rose-600" },
                  ].map((s) => (
                    <div key={s.k} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{s.k}</p>
                      <p className={`mt-0.5 text-lg font-bold ${s.c}`}>{s.v}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  The same{" "}
                  <span className="font-medium text-slate-700">{data.procedure.label}</span>{" "}
                  {facility ? `at ${facility} ` : ""}can cost a patient{" "}
                  <span className="font-semibold text-slate-900">
                    {usd(data.stats.max - data.stats.min)}
                  </span>{" "}
                  more depending on their plan (deductible not yet met), across{" "}
                  {data.count} plans.
                </p>

                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500">
                    Lowest patient cost
                  </p>
                  {data.cheapest.map((p, i) => (
                    <PlanBar key={i} p={p} max={maxBar} />
                  ))}
                  <p className="pt-2 text-xs font-semibold text-slate-500">
                    Highest patient cost
                  </p>
                  {data.costliest.map((p, i) => (
                    <PlanBar key={i} p={p} max={maxBar} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Card reader */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
            <CardReader />
            <p className="px-1 text-xs text-slate-400">
              Costs apply each plan&apos;s real CMS cost-sharing to allowed amounts
              from CMS Medicare physician pricing. Drop in your facility&apos;s
              machine-readable price file to localize these to your negotiated rates.
            </p>
          </div>
        </div>

        {/* Document upload: drop a PDF bill/EOB/plan and structure it */}
        <div className="mt-6">
          <DocumentUploader />
        </div>

        {/* Bill auditor: patient-usable, runs entirely in the browser */}
        <div className="mt-6">
          <BillAuditor />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function PlanBar({
  p,
  max,
}: {
  p: { name: string; issuer: string; metal: Metal; before: number };
  max: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <Badge tone={METAL_TONE[p.metal]} className="w-20 justify-center">
        {p.metal}
      </Badge>
      <span className="w-40 truncate text-sm text-slate-600" title={`${p.name} · ${p.issuer}`}>
        {p.name}
      </span>
      <div className="h-2.5 flex-1 rounded-full bg-slate-100">
        <div
          className="h-2.5 rounded-full bg-violet-500"
          style={{ width: `${(p.before / max) * 100}%` }}
        />
      </div>
      <span className="w-16 text-right text-sm font-medium text-slate-700">
        {usd(p.before)}
      </span>
    </div>
  );
}

function CardReader() {
  const [text, setText] = useState("");
  const [procId, setProcId] = useState(PROCEDURES[0].id);
  const token = useMemo(() => {
    const t = text.trim();
    return t.includes("#") ? t.slice(t.indexOf("#") + 1) : t;
  }, [text]);
  const card = useMemo(() => (token ? decodeCard(token) : null), [token]);

  // Quote the selected procedure for THIS patient's plan: their real cost-sharing applied,
  // both before and after their deductible is met. No record touched, just their card.
  const quote = useMemo(() => {
    if (!card) return null;
    const proc = PROCEDURES.find((p) => p.id === procId);
    if (!proc) return null;
    return { proc, est: estimateProcedure(card.plan, proc) };
  }, [card, procId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ScanLine className="h-4 w-4 text-violet-600" /> Read a patient&apos;s
        Coverage Card
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Paste the link from the patient&apos;s card (or scan their QR) to quote a procedure on
        their real plan.
      </p>
      <TextInput
        className="mt-3"
        placeholder="Paste card link…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {text && !card && (
        <p className="mt-2 text-xs text-rose-500">That link isn&apos;t a valid card.</p>
      )}
      {card && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900">{card.name}</p>
          <p className="text-xs text-slate-500">
            {card.plan.metal} · {card.plan.name}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Deductible {usd(card.plan.deductible)} · OOP max {usd(card.plan.oopMax)}
          </p>

          <div className="mt-3 border-t border-slate-200 pt-3">
            <Field label="Quote a procedure on this plan">
              <Select value={procId} onChange={(e) => setProcId(e.target.value)}>
                {PROCEDURES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            {quote && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">If deductible not met</p>
                  <p className="text-lg font-bold text-slate-900">{usd(quote.est.beforeDeductible)}</p>
                </div>
                <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">If deductible met</p>
                  <p className="text-lg font-bold text-indigo-700">{usd(quote.est.afterDeductible)}</p>
                </div>
              </div>
            )}
          </div>

          <a
            href={`/card/view#${token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700"
          >
            Open full card <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
