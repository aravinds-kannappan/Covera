import type { ServiceKey } from "@/lib/types";
import { PROCEDURES } from "@/lib/sim/params";

// Defend — bill auditor.
//
// Up to ~80% of medical bills contain errors. This is a deterministic first pass: it
// benchmarks each line against the same CMS-aligned reference allowed amounts the cost
// estimator uses, flags lines billed far above that, and surfaces likely duplicates. It is
// not legal/billing advice — it tells the patient which lines are worth questioning.
//
// Swap-in point: a real price-transparency feed (CMS / Turquoise machine-readable files)
// would replace the per-service averages below with facility + payer negotiated rates, for
// a much tighter, location-specific benchmark.

export interface BillLine {
  description: string;
  /** The service line this charge maps to (the agent maps free-text → a ServiceKey). */
  serviceKey?: ServiceKey;
  /** Amount the provider billed for this line. */
  billed: number;
  units?: number;
}

export interface AuditedLine {
  description: string;
  serviceKey: ServiceKey | null;
  billed: number;
  units: number;
  referenceAllowed: number | null;
  overchargeRatio: number | null;
  flags: string[];
}

export interface BillAudit {
  lines: AuditedLine[];
  totalBilled: number;
  totalReference: number;
  potentialOvercharge: number;
  flags: string[];
}

/**
 * Reference *billed* amount per service line — the right benchmark for an audit, since a
 * bill shows submitted charges, not allowed amounts. Uses real CMS national average
 * submitted charges (scripts/ingest_prices.py) for the procedures we can benchmark
 * completely. Facility-dominated procedures are skipped: the CMS physician dataset carries
 * only their professional fee, not the hospital/ASC charge, so we lack a complete billed
 * benchmark for those lines (they await a hospital price-transparency source).
 */
function referenceByService(): Partial<Record<ServiceKey, number>> {
  const sum: Partial<Record<ServiceKey, number>> = {};
  const count: Partial<Record<ServiceKey, number>> = {};
  for (const p of PROCEDURES) {
    if (p.facility) continue;
    const billed = typeof p.avgSubmittedCharge === "number" ? p.avgSubmittedCharge : p.typicalAllowed;
    sum[p.serviceKey] = (sum[p.serviceKey] ?? 0) + billed;
    count[p.serviceKey] = (count[p.serviceKey] ?? 0) + 1;
  }
  const out: Partial<Record<ServiceKey, number>> = {};
  for (const k in sum) {
    const key = k as ServiceKey;
    out[key] = sum[key]! / (count[key] ?? 1);
  }
  return out;
}

const REF = referenceByService();
const DEFAULT_OVERCHARGE_FACTOR = 2.5; // billed > 2.5× reference allowed → worth questioning

export function auditBill(
  lines: BillLine[],
  opts: { overchargeFactor?: number } = {},
): BillAudit {
  const factor = opts.overchargeFactor ?? DEFAULT_OVERCHARGE_FACTOR;

  // Count identical (service + description + amount) lines to surface duplicates.
  const lineKey = (l: BillLine) =>
    `${l.serviceKey ?? "?"}|${l.description.trim().toLowerCase()}|${l.billed}`;
  const seen = new Map<string, number>();
  for (const l of lines) seen.set(lineKey(l), (seen.get(lineKey(l)) ?? 0) + 1);

  let totalBilled = 0;
  let totalReference = 0;
  let potentialOvercharge = 0;

  const audited: AuditedLine[] = lines.map((l) => {
    const units = l.units && l.units > 0 ? l.units : 1;
    const serviceKey = l.serviceKey ?? null;
    const refUnit = serviceKey ? REF[serviceKey] ?? null : null;
    const referenceAllowed = refUnit != null ? Math.round(refUnit * units) : null;
    const overchargeRatio =
      referenceAllowed && referenceAllowed > 0 ? l.billed / referenceAllowed : null;

    const flags: string[] = [];
    if (overchargeRatio != null && overchargeRatio > factor) flags.push("overcharge");
    if ((seen.get(lineKey(l)) ?? 0) > 1) flags.push("possible duplicate");
    if (serviceKey == null) flags.push("uncoded — could not benchmark");

    totalBilled += l.billed;
    if (referenceAllowed != null) totalReference += referenceAllowed;
    if (overchargeRatio != null && overchargeRatio > factor)
      potentialOvercharge += l.billed - referenceAllowed!;

    return { description: l.description, serviceKey, billed: l.billed, units, referenceAllowed, overchargeRatio, flags };
  });

  const overcharged = audited.filter((a) => a.flags.includes("overcharge")).length;
  const dups = audited.filter((a) => a.flags.includes("possible duplicate")).length;
  const flags: string[] = [];
  if (overcharged) flags.push(`${overcharged} line(s) billed well above typical allowed amounts`);
  if (dups) flags.push(`${dups} line(s) look duplicated`);
  if (!flags.length) flags.push("no obvious overcharges vs. reference prices");

  return {
    lines: audited,
    totalBilled: Math.round(totalBilled),
    totalReference: Math.round(totalReference),
    potentialOvercharge: Math.round(Math.max(0, potentialOvercharge)),
    flags,
  };
}
