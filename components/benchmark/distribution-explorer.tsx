"use client";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ConditionKey, PatientProfile } from "@/lib/types";
import { MEPS } from "@/lib/sim/params";
import { makeRng } from "@/lib/sim/random";
import { buildUtilization, sampleScenario } from "@/lib/sim/utilization";
import { usd } from "@/lib/utils";

// An interactive island: it runs the REAL simulation engine live in the browser for a
// chosen age band and condition, so you can watch the spend distribution (and its skew)
// form and compare the simulated mean to the published MEPS target. The same sampleScenario
// the accuracy report uses server-side.

const N = 5000;

const BANDS: { key: string; label: string; age: number }[] = [
  { key: "0-17", label: "0 to 17", age: 10 },
  { key: "18-44", label: "18 to 44", age: 30 },
  { key: "45-64", label: "45 to 64", age: 55 },
  { key: "65+", label: "65 and up", age: 70 },
];

const CONDITIONS: { key: ConditionKey | "none"; label: string }[] = [
  { key: "none", label: "No condition" },
  { key: "diabetesType2", label: "Type 2 diabetes" },
  { key: "heartDisease", label: "Heart disease" },
  { key: "cancerActive", label: "Active cancer" },
];

function profileFor(age: number, condition: ConditionKey | "none"): PatientProfile {
  return {
    age,
    sex: "female",
    state: "TX",
    householdSize: 1,
    annualIncome: 45000,
    tobacco: false,
    conditions: condition === "none" ? [] : [condition],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };
}

export function DistributionExplorer() {
  const [bandIdx, setBandIdx] = useState(2);
  const [condition, setCondition] = useState<ConditionKey | "none">("none");
  const [seed, setSeed] = useState(1);

  const band = BANDS[bandIdx];
  const stats = useMemo(() => {
    const model = buildUtilization(profileFor(band.age, condition));
    const rng = makeRng(seed * 7919 + bandIdx * 101 + condition.length);
    const spend: number[] = new Array(N);
    for (let i = 0; i < N; i++) spend[i] = sampleScenario(rng, model).totalAllowed;
    spend.sort((a, b) => a - b);

    const total = spend.reduce((s, x) => s + x, 0);
    const mean = total / N;
    const median = spend[Math.floor(N / 2)];
    const top5 = spend.slice(Math.floor(N * 0.95)).reduce((s, x) => s + x, 0) / total;

    // Histogram capped at the 98th percentile so the long tail doesn't flatten the chart.
    const cap = spend[Math.floor(N * 0.98)] || 1;
    const binsN = 32;
    const width = cap / binsN;
    const counts = new Array(binsN).fill(0);
    for (const v of spend) counts[Math.min(binsN - 1, Math.floor(v / width))]++;
    const maxCount = Math.max(...counts, 1);

    const target = MEPS.ageBands.find((b) => b.key === band.key)?.meanAnnualSpend ?? 0;
    return { mean, median, top5, counts, maxCount, cap, width, meanTarget: target };
  }, [band, bandIdx, condition, seed]);

  const W = 720;
  const H = 190;
  const padX = 8;
  const plotH = 150;
  const barW = (W - padX * 2) / stats.counts.length;
  const meanX = padX + Math.min(1, stats.mean / stats.cap) * (W - padX * 2);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Explore the distribution</h3>
          <p className="text-xs text-slate-500">
            {N.toLocaleString()} simulated years, run live in your browser.
          </p>
        </div>
        <button
          onClick={() => setSeed((s) => s + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Resample
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {BANDS.map((b, i) => (
          <button
            key={b.key}
            onClick={() => setBandIdx(i)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
              (i === bandIdx
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            Age {b.label}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-slate-200" />
        {CONDITIONS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCondition(c.key)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
              (c.key === condition
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat
          label="Simulated mean"
          value={usd(Math.round(stats.mean))}
          sub={condition === "none" && stats.meanTarget ? `MEPS target ${usd(stats.meanTarget)}` : "condition-adjusted"}
        />
        <Stat label="Median year" value={usd(Math.round(stats.median))} sub="half spend less" />
        <Stat
          label="Top 5% share"
          value={`${Math.round(stats.top5 * 100)}%`}
          sub="of this group's spend"
        />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img">
        <title>Simulated annual spend distribution</title>
        {stats.counts.map((c, i) => {
          const h = (c / stats.maxCount) * plotH;
          return (
            <rect
              key={i}
              x={padX + i * barW + 0.5}
              y={plotH - h + 6}
              width={Math.max(0.5, barW - 1)}
              height={h}
              rx={1.5}
              className="fill-emerald-500"
              opacity={0.85}
            />
          );
        })}
        <line x1={padX} y1={plotH + 6} x2={W - padX} y2={plotH + 6} stroke="#e2e8f0" />
        {/* mean marker */}
        <line x1={meanX} y1={0} x2={meanX} y2={plotH + 6} stroke="#0f172a" strokeWidth={1.5} />
        <text x={Math.min(W - padX - 40, meanX + 4)} y={12} className="fill-slate-700" style={{ fontSize: 11, fontWeight: 600 }}>
          mean
        </text>
        <text x={padX} y={H - 4} className="fill-slate-400" style={{ fontSize: 11 }}>
          $0
        </text>
        <text x={W - padX} y={H - 4} textAnchor="end" className="fill-slate-400" style={{ fontSize: 11 }}>
          {usd(Math.round(stats.cap))}+
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-slate-400">
        The long right tail is the whole point: a few people drive most spending, which is
        why the cheapest plan often is not the safest. Add a condition to watch the mean and
        tail move.
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  );
}
