import type { Metal, ServiceCostShare } from "@/lib/types";
import { usd } from "@/lib/utils";

type Tone = "neutral" | "emerald" | "amber" | "rose" | "sky" | "violet";

export const METAL_TONE: Record<Metal, Tone> = {
  Bronze: "amber",
  "Expanded Bronze": "amber",
  Silver: "neutral",
  Gold: "violet",
  Platinum: "sky",
  Catastrophic: "rose",
};

/** Human-readable member cost share, e.g. "$30", "20% after deductible". */
export function describeCostShare(cs?: ServiceCostShare): string {
  if (!cs) return ": ";
  if (cs.noCharge) return cs.afterDeductible ? "Free after deductible" : "No charge";
  const parts: string[] = [];
  if (cs.copay != null && cs.copay > 0) parts.push(usd(cs.copay));
  if (cs.coinsurance != null && cs.coinsurance > 0)
    parts.push(`${Math.round(cs.coinsurance * 100)}%`);
  if (parts.length === 0) {
    if (cs.copay === 0) return cs.afterDeductible ? "Free after deductible" : "$0";
    return "Covered";
  }
  return parts.join(" + ") + (cs.afterDeductible ? " after deductible" : "");
}
