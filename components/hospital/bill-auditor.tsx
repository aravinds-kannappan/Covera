"use client";
import { useMemo, useState } from "react";
import { Plus, Receipt, Trash2, AlertTriangle } from "lucide-react";
import { SERVICE_KEYS, SERVICE_LABELS, type ServiceKey } from "@/lib/types";
import { auditBill, type BillLine } from "@/lib/sim/billaudit";
import { usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Patient-usable bill auditor. It runs the same deterministic benchmark the concierge uses
// (real CMS submitted-charge references) entirely in the browser: no upload, no account. A
// patient at the front desk types their bill lines, maps each to a service, and immediately
// sees which are billed far above typical and which look duplicated: the lines worth
// questioning before they pay.

interface Row {
  id: number;
  description: string;
  serviceKey: ServiceKey | "";
  billed: string;
}

let nextId = 3;
const SEED: Row[] = [
  { id: 1, description: "MRI, lower back", serviceKey: "imagingAdvanced", billed: "3200" },
  { id: 2, description: "ER facility fee", serviceKey: "emergencyRoom", billed: "4800" },
];

export function BillAuditor() {
  const [rows, setRows] = useState<Row[]>(SEED);

  const audit = useMemo(() => {
    const lines: BillLine[] = rows
      .filter((r) => r.description.trim() && Number(r.billed) > 0)
      .map((r) => ({
        description: r.description.trim(),
        serviceKey: r.serviceKey || undefined,
        billed: Number(r.billed),
      }));
    return lines.length ? auditBill(lines) : null;
  }, [rows]);

  const set = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { id: nextId++, description: "", serviceKey: "", billed: "" }]);
  const remove = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Receipt className="h-4 w-4 text-violet-600" /> Audit a medical bill
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Up to 80% of bills contain errors. Enter your line items and map each to a service. We
        benchmark them against real CMS charge data and flag what is worth questioning.
      </p>

      <div className="mt-4 space-y-2">
        <div className="hidden grid-cols-[1fr_180px_110px_32px] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:grid">
          <span>Line item</span>
          <span>Service</span>
          <span className="text-right">Billed</span>
          <span />
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_180px_110px_32px] sm:items-center">
            <input
              className="col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm sm:col-span-1"
              placeholder="e.g. CT scan, abdomen"
              value={r.description}
              onChange={(e) => set(r.id, { description: e.target.value })}
            />
            <select
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              value={r.serviceKey}
              onChange={(e) => set(r.id, { serviceKey: e.target.value as ServiceKey | "" })}
            >
              <option value="">(map service…)</option>
              {SERVICE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SERVICE_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-right text-sm tabular-nums"
              placeholder="$"
              value={r.billed}
              onChange={(e) => set(r.id, { billed: e.target.value })}
            />
            <button
              onClick={() => remove(r.id)}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-500"
              title="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Button size="sm" variant="ghost" className="mt-2" onClick={add}>
        <Plus className="h-4 w-4" /> Add line
      </Button>

      {audit && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Total billed</p>
              <p className="text-xl font-bold text-slate-900">{usd(audit.totalBilled)}</p>
            </div>
            <div className={`rounded-xl border p-3 ${audit.potentialOvercharge > 0 ? "border-rose-200 bg-rose-50" : "border-indigo-200 bg-indigo-50"}`}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Potential overcharge</p>
              <p className={`text-xl font-bold ${audit.potentialOvercharge > 0 ? "text-rose-600" : "text-indigo-700"}`}>
                {usd(audit.potentialOvercharge)}
              </p>
            </div>
          </div>

          <ul className="mt-3 space-y-1.5">
            {audit.lines.map((l, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-700">{l.description}</span>
                <span className="flex items-center gap-2">
                  {l.referenceAllowed != null && (
                    <span className="text-xs text-slate-400">
                      typical ~{usd(l.referenceAllowed)}
                    </span>
                  )}
                  {l.flags.includes("overcharge") && <Badge tone="rose">overcharge</Badge>}
                  {l.flags.includes("possible duplicate") && <Badge tone="amber">duplicate?</Badge>}
                  {l.flags.includes("uncoded: could not benchmark") && <Badge tone="neutral">unmapped</Badge>}
                  {l.flags.length === 0 && <Badge tone="emerald">looks fair</Badge>}
                  <span className="w-16 text-right font-medium tabular-nums text-slate-800">{usd(l.billed)}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {audit.flags.join(" ")} This is a first-pass reference check, not billing or legal
              advice. Ask the provider for an itemized bill and question flagged lines.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
