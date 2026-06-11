import type { ServiceKey } from "@/lib/types";
import { SERVICE_LABELS } from "@/lib/types";
import { usd } from "@/lib/utils";

/** Horizontal bars showing which service lines drive expected out-of-pocket cost. */
export function DriversBar({
  drivers,
}: {
  drivers: { service: ServiceKey; oop: number }[];
}) {
  const max = Math.max(...drivers.map((d) => d.oop), 1);
  return (
    <div className="space-y-2.5">
      {drivers.map((d) => (
        <div key={d.service} className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
          <span className="truncate text-sm text-slate-600">
            {SERVICE_LABELS[d.service]}
          </span>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
              style={{ width: `${(d.oop / max) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium tabular-nums text-slate-700">
            {usd(d.oop)}
          </span>
        </div>
      ))}
    </div>
  );
}
