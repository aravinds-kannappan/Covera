import type { DrugTier, ServiceKey } from "@/lib/types";

// Upload-ready document schemas.
//
// The goal is to let real paperwork drive the simulation instead of generic assumptions. A
// user's EOBs, bills, employer plan summary, prescription list, and prior claims all carry
// structured facts (allowed amounts, deductible-met-to-date, copays, drug tiers, provider
// names) that are strictly better than national medians. These types are the contract between
// extraction (whatever produces them: an LLM pass now, a dedicated parser later) and the rest
// of the app: apply-to-profile, cost simulation, bill audit, and appeal drafting.

export type DocumentKind =
  | "eob" // Explanation of Benefits
  | "medicalBill" // a provider/hospital bill
  | "employerPlan" // an employer plan summary / SBC
  | "prescriptionList" // a med list
  | "claimHistory"; // prior claims / year-to-date accumulators

/** One line as it appears on an EOB or a bill. */
export interface DocumentLineItem {
  description: string;
  /** Mapped to a modeled service line when possible. */
  serviceKey?: ServiceKey;
  cptOrHcpcs?: string;
  dateOfService?: string;
  /** What the provider billed. */
  billed?: number;
  /** The plan-allowed (negotiated) amount, if the document shows it. */
  allowed?: number;
  /** What the plan paid. */
  planPaid?: number;
  /** What the member owed (copay/coinsurance/deductible). */
  memberResponsibility?: number;
  denied?: boolean;
  denialReason?: string;
}

export interface ExtractedEOB {
  kind: "eob";
  issuer?: string;
  planName?: string;
  memberId?: string;
  claimNumber?: string;
  serviceStart?: string;
  serviceEnd?: string;
  lines: DocumentLineItem[];
  /** Year-to-date accumulators, if present. Deductible/OOP met sharpens the simulation. */
  deductibleMetToDate?: number;
  oopMetToDate?: number;
}

export interface ExtractedBill {
  kind: "medicalBill";
  provider?: string;
  serviceDate?: string;
  lines: DocumentLineItem[];
  totalBilled?: number;
}

export interface ExtractedEmployerPlan {
  kind: "employerPlan";
  issuer?: string;
  planName?: string;
  metal?: string;
  /** What the plan costs the employee per month (their premium share). */
  employeeMonthlyPremium?: number;
  deductible?: number;
  oopMax?: number;
  coinsurance?: number; // 0..1
  hsaEligible?: boolean;
  copays?: Partial<Record<ServiceKey, number>>;
}

export interface ExtractedPrescription {
  name: string;
  tier?: DrugTier;
  fillsPerYear?: number;
}
export interface ExtractedPrescriptionList {
  kind: "prescriptionList";
  prescriptions: ExtractedPrescription[];
}

export interface ExtractedClaimHistory {
  kind: "claimHistory";
  planYear?: number;
  lines: DocumentLineItem[];
  deductibleMetToDate?: number;
  oopMetToDate?: number;
}

export type ExtractedDocument =
  | ExtractedEOB
  | ExtractedBill
  | ExtractedEmployerPlan
  | ExtractedPrescriptionList
  | ExtractedClaimHistory;

/** A parse result, always carrying its confidence and provenance for the trust layer. */
export interface DocumentParse<T extends ExtractedDocument = ExtractedDocument> {
  kind: DocumentKind;
  data: T;
  /** 0..1 self-reported extraction confidence. Low confidence is surfaced, never hidden. */
  confidence: number;
  /** How the fields were produced, e.g. "LLM extraction (claude-haiku-4-5)". */
  method: string;
  /** Field-level notes and anything the extractor could not read. */
  warnings: string[];
}
