import { usd } from "@/lib/utils";

/** Compact P10–P90 range bar with an expected-cost marker, on a shared scale. */
export function RangeBar({
  p10,
  expected,
  p90,
  min,
  max,
}: {
  p10: number;
  expected: number;
  p90: number;
  min: number;
  max: number;
}) {
  const span = max - min || 1;
  const pos = (v: number) => `${((v - min) / span) * 100}%`;
  const left = ((p10 - min) / span) * 100;
  const width = ((p90 - p10) / span) * 100;

  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full rounded-full bg-slate-100">
        <div
          className="absolute top-0 h-2.5 rounded-full bg-indigo-200"
          style={{ left: `${left}%`, width: `${Math.max(1, width)}%` }}
        />
        <div
          className="absolute top-[-3px] h-[17px] w-[3px] -translate-x-1/2 rounded-full bg-slate-900"
          style={{ left: pos(expected) }}
          title={`Expected ${usd(expected)}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{usd(p10)}</span>
        <span className="font-semibold text-slate-600">{usd(expected)}</span>
        <span>{usd(p90)}</span>
      </div>
    </div>
  );
}
