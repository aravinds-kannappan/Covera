import type { SimSummary } from "@/lib/types";
import { usd } from "@/lib/utils";

// Histogram of simulated all-in annual cost. Two things make this robust where the old chart
// broke: (1) a degenerate distribution (a very sick patient who hits their out-of-pocket max
// in nearly every year, so p10 == median == p90) is drawn as a single clean "one outcome"
// column instead of a pile of overlapping markers; (2) the P10 / Median / P90 / CVaR labels
// are de-overlapped so they never stack on top of each other.

export function DistributionChart({ sim }: { sim: SimSummary }) {
  const W = 720;
  const H = 264;
  const padX = 12;
  const padTop = 26;
  const padBottom = 34;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const yBase = padTop + plotH;

  const bins = sim.histogram.length ? sim.histogram : [{ bin: sim.expectedTotal, count: 1 }];
  const lo = bins[0].bin;
  const hi = bins[bins.length - 1].bin;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  // Degenerate: the outcome is effectively fixed (tiny spread relative to the value). Draw a
  // single centered column and one label, rather than a broken axis with overlapping markers.
  const degenerate = !(hi > lo) || sim.p90 - sim.p10 < Math.max(1, 0.015 * Math.max(1, sim.median));
  if (degenerate) {
    const cx = W / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
        <defs>
          <linearGradient id="barGradD" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={yBase} x2={W - padX} y2={yBase} stroke="#e2e8f0" />
        <rect x={cx - 60} y={padTop} width={120} height={plotH} rx={4} fill="url(#barGradD)" />
        <text x={cx} y={padTop - 10} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11, fontWeight: 600 }}>
          nearly every simulated year
        </text>
        <text x={cx} y={H - 12} textAnchor="middle" className="fill-slate-700" style={{ fontSize: 12, fontWeight: 700 }}>
          {usd(sim.expectedTotal)}
        </text>
      </svg>
    );
  }

  const span = hi - lo;
  const barW = plotW / bins.length;
  const x = (v: number) => padX + ((v - lo) / span) * plotW;

  const cvar = sim.cvar90 ?? sim.p90;
  const markers = [
    { v: sim.p10, label: "P10", color: "#10b981" },
    { v: sim.median, label: "Median", color: "#0f172a" },
    { v: sim.p90, label: "P90", color: "#e11d48" },
    { v: cvar, label: "Avg bad yr", color: "#f59e0b" },
  ];

  // De-overlap the labels: keep their true vertical lines, but push apart the label anchors.
  const minGap = 62;
  const labelX = markers
    .map((m, i) => ({ i, px: Math.min(W - padX - 2, Math.max(padX + 2, x(m.v))) }))
    .sort((a, b) => a.px - b.px);
  for (let k = 1; k < labelX.length; k++)
    if (labelX[k].px - labelX[k - 1].px < minGap) labelX[k].px = labelX[k - 1].px + minGap;
  for (let k = labelX.length - 2; k >= 0; k--)
    if (labelX[k + 1].px - labelX[k].px < minGap) labelX[k].px = labelX[k + 1].px - minGap;
  const px: number[] = [];
  for (const l of labelX) px[l.i] = l.px;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      {/* Tail beyond P90 shaded, to make the bad-year mass visible */}
      <rect x={x(sim.p90)} y={padTop} width={Math.max(0, W - padX - x(sim.p90))} height={plotH} fill="#fb7185" opacity={0.06} />

      {/* bars */}
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * plotH;
        const beyondP90 = b.bin > sim.p90;
        return (
          <rect
            key={i}
            x={padX + i * barW + 0.5}
            y={yBase - h}
            width={Math.max(0.5, barW - 1)}
            height={h}
            rx={1.5}
            fill={beyondP90 ? "#fb7185" : "url(#barGrad)"}
            opacity={beyondP90 ? 0.55 : 0.9}
          />
        );
      })}

      <line x1={padX} y1={yBase} x2={W - padX} y2={yBase} stroke="#e2e8f0" />

      {/* markers: true vertical line + de-overlapped label */}
      {markers.map((m, i) => (
        <g key={m.label}>
          <line x1={x(m.v)} y1={padTop - 4} x2={x(m.v)} y2={yBase} stroke={m.color} strokeWidth={m.label === "Median" ? 2 : 1.4} strokeDasharray={m.label === "Median" ? "" : "4 3"} />
          <text x={px[i]} y={padTop - 8} textAnchor="middle" fill={m.color} style={{ fontSize: 10.5, fontWeight: 600 }}>
            {m.label}
          </text>
        </g>
      ))}

      {/* x-axis endpoints */}
      <text x={padX} y={H - 12} className="fill-slate-400" style={{ fontSize: 11 }}>{usd(lo)}</text>
      <text x={W - padX} y={H - 12} textAnchor="end" className="fill-slate-400" style={{ fontSize: 11 }}>{usd(hi)}</text>
    </svg>
  );
}
