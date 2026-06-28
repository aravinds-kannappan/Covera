import type { PatientProfile } from "@/lib/types";

/** Where the patient is in the journey, which shapes how the concierge behaves. */
export type ConversationStatus = "intake" | "advising" | "finalized";

/**
 * A structured payload attached to an agent message so the web UI can render a rich
 * side panel (a chart, plan cards, an outreach draft) alongside the plain text that
 * actually gets sent over iMessage. The text is always self-contained; `meta` is a
 * progressive enhancement for the on-screen console and the results dashboard.
 */
export type MessageMeta =
  | { kind: "profile"; data: ProfileMeta }
  | { kind: "plans"; data: PlansMeta }
  | { kind: "whatif"; data: PlansMeta }
  | { kind: "marketplace"; data: MarketplaceMeta }
  | { kind: "hospital"; data: HospitalMeta }
  | { kind: "estimate"; data: EstimateMeta }
  | { kind: "billaudit"; data: BillAuditMeta }
  | { kind: "appeal"; data: AppealMeta }
  | { kind: "recheck"; data: RecheckMeta }
  | { kind: "outreach"; data: OutreachMeta };

export interface ProfileMeta {
  filled: string[]; // human labels of fields captured so far, e.g. ["age 34", "Texas"]
  missing: string[]; // what's still needed before advising
}

export interface PlanLine {
  name: string;
  metal: string;
  expectedTotal: number;
  p90: number;
  annualPremium: number;
  probHitOOPMax: number;
}

export interface PlansMeta {
  label: string;
  subsidyMonthly: number;
  topPlans: PlanLine[];
}

export interface MarketplaceMeta {
  state: string;
  planCount: number;
  issuers: number;
  employerOfferMonthly: number | null; // what the employer offer would cost the patient
  bestMarketplaceMonthly: number; // cheapest comparable marketplace option (net of subsidy)
  verdict: string;
}

export interface HospitalMeta {
  procedure: string;
  state: string;
  min: number;
  median: number;
  max: number;
}

export interface OutreachMeta {
  target: "employer" | "hospital";
  to: string | null;
  subject: string;
  body: string;
  sent: boolean;
}

/** A procedure's cost on the patient's own plan (Use). */
export interface EstimateMeta {
  procedure: string;
  planName: string;
  allowed: number;
  ifDeductibleUnmet: number;
  ifDeductibleMet: number;
}

export interface BillAuditLineMeta {
  description: string;
  billed: number;
  referenceAllowed: number | null;
  flags: string[];
}

/** A medical-bill audit result (Defend). */
export interface BillAuditMeta {
  totalBilled: number;
  potentialOvercharge: number;
  flaggedLines: BillAuditLineMeta[];
  summary: string[];
}

/** A denial-appeal draft (Defend). */
export interface AppealMeta {
  service: string;
  denialReason: string;
  subject: string;
  letter: string;
  sent: boolean;
}

/** An annual re-rank comparing the current plan to this year's best (Optimize). */
export interface RecheckMeta {
  currentPlanName: string | null;
  currentExpectedTotal: number | null;
  bestPlanName: string;
  bestExpectedTotal: number;
  annualSavings: number | null;
  shouldSwitch: boolean;
  reason: string;
}

export interface ConvoMessage {
  role: "patient" | "agent";
  text: string;
  ts: number;
  meta?: MessageMeta;
}

export interface Thread {
  id: string; // E.164 phone number, or a demo session id
  channel: "loopmessage" | "sandbox";
  profile: Partial<PatientProfile>;
  /**
   * Free-form, human context the patient shares that doesn't fit the structured profile
   * — fears, constraints, life details, preferences ("worried about a surprise ER bill",
   * "self-employed, income swings", "wants to keep her oncologist"). The agent carries
   * these across the whole conversation and tailors its advice and tone to them.
   */
  notes: string[];
  messages: ConvoMessage[];
  selectedPlanId: string | null;
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
}
