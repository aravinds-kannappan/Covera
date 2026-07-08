"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, FlaskConical } from "lucide-react";
import { SUPPORTED_STATES } from "@/lib/options";
import { usd } from "@/lib/utils";
import { Field, Select } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { METAL_TONE } from "@/lib/format";
import type { Metal } from "@/lib/types";

// Interactive proof of the cost engine. The user picks a state and a real episode of care;
// the table shows what that episode costs out-of-pocket on the cheapest real plan in each
// metal tier, and clicking a cell opens the exact mechanism breakdown (deductible phase,
// coinsurance, copays). It makes the deterministic adjudication auditable at a glance.

interface Cell {
  metal: Metal;
  oop: number;
  deductiblePaid: number;
  coinsurancePaid: number;
  copayPaid: number;
  hitOopMax: boolean;
}
interface Column {
  metal: Metal;
  planName: string;
  issuer: string;
  monthlyPremium: number;
  deductible: number;
  oopMax: number;
}
interface BundleRow {
  key: string;
  label: string;
  allowed: number;
  cells: Cell[];
}
interface Data {
  state: string;
  columns: Column[];
  bundles: BundleRow[];
}

export function BundleExplorer() {
  const [state, setState] = useState("TX");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null); // `${bundleKey}:${metal}`

  useEffect(() => {
    setLoading(true);
    fetch("/api/bundle-cost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    })
      .then((r) => r.json())
      .then((d) => setData(d.error ? null : d))
      .finally(() => setLoading(false));
  }, [state]);

  const maxOop = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.bundles.flatMap((b) => b.cells.map((c) => c.oop)));
  }, [data]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FlaskConical className="h-4 w-4 text-indigo-600" /> What real care costs, plan by plan
        </h3>
        <Field label="" className="w-44">
          <Select value={state} onChange={(e) => setState(e.target.value)}>
            {SUPPORTED_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Each row is a fixed episode of care run through the real adjudication engine on the
        cheapest plan in each metal tier. Click any number to see the exact math.
      </p>

      {loading || !data ? (
        <div className="grid place-items-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Episode of care
                </th>
                {data.columns.map((c) => (
                  <th key={c.metal} className="px-2 py-2 text-center">
                    <Badge tone={METAL_TONE[c.metal]}>{c.metal}</Badge>
                    <div className="mt-1 text-[10px] font-normal text-slate-400">
                      ded {usd(c.deductible)} · oop {usd(c.oopMax)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.bundles.map((b) => (
                <tr key={b.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-2.5">
                    <div className="font-medium text-slate-800">{b.label}</div>
                    <div className="text-[11px] text-slate-400">{usd(b.allowed)} allowed</div>
                  </td>
                  {b.cells.map((cell) => {
                    const id = `${b.key}:${cell.metal}`;
                    const isOpen = open === id;
                    return (
                      <td key={cell.metal} className="px-2 py-2.5 text-center align-top">
                        <button
                          onClick={() => setOpen(isOpen ? null : id)}
                          className="group inline-flex w-full flex-col items-center"
                        >
                          <span className={`font-semibold tabular-nums ${cell.hitOopMax ? "text-rose-600" : "text-slate-900"} group-hover:underline`}>
                            {usd(cell.oop)}
                          </span>
                          <span className="mt-1 h-1.5 w-full max-w-[72px] overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-1.5 rounded-full bg-indigo-500/70"
                              style={{ width: `${(cell.oop / maxOop) * 100}%` }}
                            />
                          </span>
                        </button>
                        {isOpen && (
                          <div className="mt-2 rounded-lg bg-slate-50 p-2 text-left text-[11px] text-slate-600">
                            <Line label="Deductible phase" v={cell.deductiblePaid} />
                            <Line label="Coinsurance" v={cell.coinsurancePaid} />
                            <Line label="Copays" v={cell.copayPaid} />
                            {cell.hitOopMax && <div className="mt-1 font-medium text-rose-600">Capped at OOP max</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Episodes are fixed reference bundles (round allowed amounts), so the math is checkable;
        the plans and cost-sharing are real CMS PY2026 data. Deductible + coinsurance + copays,
        capped at the out-of-pocket max, equals the number shown.
      </p>
    </div>
  );
}

function Line({ label, v }: { label: string; v: number }) {
  if (v <= 0) return null;
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{usd(v)}</span>
    </div>
  );
}
