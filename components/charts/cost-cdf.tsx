import type { SimSummary } from "@/lib/types";
import { usd } from "@/lib/utils";

// Cumulative probability of annual all-in cost: "there is an X% chance your year costs at most
// $Y." This complements the histogram and stays meaningful exactly where the histogram fails:
// for a max-out-heavy patient the curve simply climbs slowly and then jumps to 100% at the
// out-of-pocket-max cost, showing at a glance how much probability piles up at the ceiling.

export function CostCdf({ sim }: { sim: SimSummary }) {
  const W = 720;
  const H = 210;
  const padL = 40;
  const padR = 12;
  const padTop = 14;
  const padBottom = 30;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const yBase = padTop + plotH;

  const bins = sim.histogram.length ? sim.histogram : [{ bin: sim.expectedTotal, count: 1 }];
  const total = bins.reduce((a, b) => a + b.count, 0) || 1;
  const lo = bins[0].bin;
  const hi = bins[bins.length - 1].bin;
  const span = hi - lo || 1;

  const x = (v: number) => padL + ((v - lo) / span) * plotW;
  const y = (f: number) => yBase - f * plotH; // f in [0,1]

  // Cumulative fraction at each bin's right edge, starting from 0 at the low end.
  let cum = 0;
  const pts: { x: number; y: number }[] = [{ x: x(lo), y: y(0) }];
  for (const b of bins) {
    cum += b.count;
    pts.push({ x: x(b.bin), y: y(cum / total) });
  }
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${x(hi).toFixed(1)},${yBase} L${padL},${yBase} Z`;

  const gridY = [0.25, 0.5, 0.75, 0.9];
  const dots = [
    { v: sim.median, f: 0.5, label: "50%", color: "#0f172a" },
    { v: sim.p90, f: 0.9, label: "90%", color: "#e11d48" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <linearGradient id="cdfFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* horizontal gridlines with percent labels */}
      {gridY.map((f) => (
        <g key={f}>
          <line x1={padL} y1={y(f)} x2={W - padR} y2={y(f)} stroke="#f1f5f9" />
          <text x={padL - 6} y={y(f) + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>
            {Math.round(f * 100)}%
          </text>
        </g>
      ))}
      <line x1={padL} y1={yBase} x2={W - padR} y2={yBase} stroke="#e2e8f0" />

      <path d={area} fill="url(#cdfFill)" />
      <path d={line} fill="none" stroke="#10b981" strokeWidth={2} />

      {/* percentile dots */}
      {dots.map((d) => (
        <g key={d.label}>
          <line x1={x(d.v)} y1={y(d.f)} x2={x(d.v)} y2={yBase} stroke={d.color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <circle cx={x(d.v)} cy={y(d.f)} r={3.5} fill={d.color} />
          <text x={Math.min(W - padR - 2, x(d.v) + 6)} y={y(d.f) - 5} className="fill-slate-500" style={{ fontSize: 10, fontWeight: 600 }}>
            {d.label} ≤ {usd(d.v)}
          </text>
        </g>
      ))}

      {/* x-axis endpoints */}
      <text x={padL} y={H - 10} className="fill-slate-400" style={{ fontSize: 10 }}>{usd(lo)}</text>
      <text x={W - padR} y={H - 10} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10 }}>{usd(hi)}</text>
    </svg>
  );
}
