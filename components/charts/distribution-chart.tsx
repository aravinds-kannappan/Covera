import type { SimSummary } from "@/lib/types";
import { usd } from "@/lib/utils";

/** Histogram of simulated all-in annual cost, with expected / P10 / P90 markers. */
export function DistributionChart({ sim }: { sim: SimSummary }) {
  const W = 720;
  const H = 260;
  const padX = 10;
  const padTop = 22;
  const padBottom = 34;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;

  const bins = sim.histogram;
  const lo = bins[0]?.bin ?? 0;
  const hi = bins[bins.length - 1]?.bin ?? 1;
  const span = hi - lo || 1;
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const barW = plotW / bins.length;

  const x = (v: number) => padX + ((v - lo) / span) * plotW;
  const yTop = padTop;
  const yBase = padTop + plotH;

  const markers = [
    { v: sim.p10, label: "P10", color: "#10b981", dash: "4 3" },
    { v: sim.expectedTotal, label: "Expected", color: "#0f172a", dash: "" },
    { v: sim.p90, label: "P90", color: "#e11d48", dash: "4 3" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <defs>
        <linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>

      {/* P10–P90 band */}
      <rect
        x={x(sim.p10)}
        y={yTop}
        width={Math.max(0, x(sim.p90) - x(sim.p10))}
        height={plotH}
        fill="#10b981"
        opacity={0.06}
      />

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
            opacity={beyondP90 ? 0.5 : 0.9}
          />
        );
      })}

      {/* baseline */}
      <line x1={padX} y1={yBase} x2={W - padX} y2={yBase} stroke="#e2e8f0" />

      {/* markers */}
      {markers.map((m) => (
        <g key={m.label}>
          <line
            x1={x(m.v)}
            y1={yTop - 6}
            x2={x(m.v)}
            y2={yBase}
            stroke={m.color}
            strokeWidth={m.label === "Expected" ? 2 : 1.5}
            strokeDasharray={m.dash}
          />
          <text
            x={Math.min(W - padX - 2, Math.max(padX + 2, x(m.v)))}
            y={yTop - 9}
            textAnchor="middle"
            className="fill-slate-500"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* x-axis labels */}
      <text x={padX} y={H - 12} className="fill-slate-400" style={{ fontSize: 11 }}>
        {usd(lo)}
      </text>
      <text
        x={W - padX}
        y={H - 12}
        textAnchor="end"
        className="fill-slate-400"
        style={{ fontSize: 11 }}
      >
        {usd(hi)}
      </text>
      <text
        x={x(sim.expectedTotal)}
        y={H - 12}
        textAnchor="middle"
        className="fill-slate-700"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        {usd(sim.expectedTotal)}
      </text>
    </svg>
  );
}
