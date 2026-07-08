"use client";
import type { FrontierPoint } from "@/lib/sim/optimize";
import { usd } from "@/lib/utils";

/** Cost-vs-risk scatter. Best plans sit toward the lower-left efficient frontier. */
export function FrontierChart({
  points,
  recommendedId,
  selectedId,
  onSelect,
}: {
  points: FrontierPoint[];
  recommendedId?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (points.length === 0) return null;
  const W = 720;
  const H = 340;
  const padL = 58;
  const padR = 18;
  const padT = 22;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xs = points.map((p) => p.expectedTotal);
  const ys = points.map((p) => p.risk);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const x = (v: number) => padL + ((v - minX) / spanX) * plotW;
  const y = (v: number) => padT + (1 - (v - minY) / spanY) * plotH;

  const frontier = points
    .filter((p) => p.onFrontier)
    .sort((a, b) => a.expectedTotal - b.expectedTotal);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {/* axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#e2e8f0" />
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="#e2e8f0"
      />

      {/* efficient frontier line */}
      {frontier.length > 1 && (
        <polyline
          points={frontier.map((p) => `${x(p.expectedTotal)},${y(p.risk)}`).join(" ")}
          fill="none"
          stroke="#10b981"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          opacity={0.7}
        />
      )}

      {/* points */}
      {points.map((p) => {
        const isRec = p.planId === recommendedId;
        const isSel = p.planId === selectedId;
        const r = isRec ? 7 : isSel ? 6.5 : 5;
        return (
          <g
            key={p.planId}
            onClick={() => onSelect?.(p.planId)}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            <title>{`Expected ${usd(p.expectedTotal)} · bad-year ${usd(p.risk)}`}</title>
            <circle
              cx={x(p.expectedTotal)}
              cy={y(p.risk)}
              r={r}
              fill={p.onFrontier ? "#10b981" : "#cbd5e1"}
              stroke={isSel ? "#0f172a" : isRec ? "#047857" : "white"}
              strokeWidth={isSel ? 2.5 : 2}
              opacity={p.onFrontier ? 1 : 0.8}
            />
          </g>
        );
      })}

      {/* labels */}
      <text x={padL + plotW / 2} y={H - 10} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 12 }}>
        Expected annual cost →
      </text>
      <text
        x={16}
        y={padT + plotH / 2}
        textAnchor="middle"
        transform={`rotate(-90 16 ${padT + plotH / 2})`}
        className="fill-slate-500"
        style={{ fontSize: 12 }}
      >
        ↑ Bad-year cost (P90)
      </text>
      <text x={padL} y={padT - 8} className="fill-indigo-600" style={{ fontSize: 11, fontWeight: 600 }}>
        ● on the efficient frontier
      </text>
    </svg>
  );
}
