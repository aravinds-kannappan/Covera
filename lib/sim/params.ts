import type {
  ConditionKey,
  DrugTier,
  PlannedEventKey,
  ServiceKey,
} from "@/lib/types";
import mepsJson from "@/data/meps-params.json";
import pricesJson from "@/data/procedure-prices.json";

export type AgeBandKey = "0-17" | "18-44" | "45-64" | "65+";

export interface ServiceParam {
  isDrug: boolean;
  allowedMedian: number;
  allowedSigma: number;
  freq: Record<AgeBandKey, number>;
}

export interface MedAddition {
  tier: DrugTier;
  fillsPerYear: number;
  name: string;
}

export interface ConditionParam {
  label: string;
  freqMult?: Partial<Record<ServiceKey, number>>;
  freqAdd?: Partial<Record<ServiceKey, number>>;
  extraInpatientProb?: number;
  addMeds?: MedAddition[];
}

export interface PlannedEventParam {
  label: string;
  freqAdd?: Partial<Record<ServiceKey, number>>;
  guaranteedEvents?: {
    service: ServiceKey;
    count: number;
    allowedOverride?: number;
  }[];
}

export interface MepsParams {
  _provenance: { source: string; method: string; note: string };
  concentration: {
    meanAnnual: number;
    medianAnnual: number;
    top1pct: number;
    top5pct: number;
    top10pct: number;
    bottom50pct: number;
  };
  /** Person-year frailty: a mean-1 latent multiplier on acute-care frequency. */
  frailty: { sigma: number; note?: string };
  ageBands: { key: AgeBandKey; min: number; max: number; meanAnnualSpend: number }[];
  services: Record<ServiceKey, ServiceParam>;
  conditions: Record<ConditionKey, ConditionParam>;
  plannedEvents: Record<PlannedEventKey, PlannedEventParam>;
}

export interface ProcedurePrice {
  id: string;
  label: string;
  serviceKey: ServiceKey;
  /** Commercial allowed-amount estimate the cost engine applies plan cost-sharing to. */
  typicalAllowed: number;
  /** Real CMS fields (present once scripts/ingest_prices.py has run). */
  hcpcs?: string;
  hcpcsDesc?: string;
  /** Real CMS national average Medicare allowed amount for the code. */
  medicareAllowed?: number;
  /** Real CMS national average submitted charge (what providers bill). */
  avgSubmittedCharge?: number;
  /** Facility-dominated procedure: CMS physician data is professional-fee only here. */
  facility?: boolean;
}

export const MEPS = mepsJson as unknown as MepsParams;
export const PROCEDURES = (pricesJson as { procedures: ProcedurePrice[] })
  .procedures;
export const PROCEDURE_SOURCE = (pricesJson as { _provenance: { source: string } })
  ._provenance.source;

export function ageBandKey(age: number): AgeBandKey {
  for (const b of MEPS.ageBands) {
    if (age >= b.min && age <= b.max) return b.key;
  }
  return age < 18 ? "0-17" : "65+";
}
