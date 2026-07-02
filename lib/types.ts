// Core domain types shared by the ingester, simulation engine, and UI.
// Every Plan field maps to a real column in the CMS Exchange PUFs (PY2026).

export type Metal =
  | "Bronze"
  | "Expanded Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Catastrophic";

export type PlanTypeCode = "HMO" | "PPO" | "EPO" | "POS" | "Indemnity";

/** The service lines the simulation models. Each maps to a real PUF benefit. */
export type ServiceKey =
  | "primaryCare"
  | "specialist"
  | "urgentCare"
  | "emergencyRoom"
  | "inpatient"
  | "outpatientSurgery"
  | "labs"
  | "xray"
  | "imagingAdvanced" // MRI / CT / PET
  | "mentalHealthOutpatient"
  | "genericDrugs"
  | "preferredBrandDrugs"
  | "nonPreferredBrandDrugs"
  | "specialtyDrugs";

export const SERVICE_KEYS: ServiceKey[] = [
  "primaryCare",
  "specialist",
  "urgentCare",
  "emergencyRoom",
  "inpatient",
  "outpatientSurgery",
  "labs",
  "xray",
  "imagingAdvanced",
  "mentalHealthOutpatient",
  "genericDrugs",
  "preferredBrandDrugs",
  "nonPreferredBrandDrugs",
  "specialtyDrugs",
];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  primaryCare: "Primary care visit",
  specialist: "Specialist visit",
  urgentCare: "Urgent care",
  emergencyRoom: "Emergency room",
  inpatient: "Inpatient hospital stay",
  outpatientSurgery: "Outpatient surgery",
  labs: "Lab work",
  xray: "X-ray",
  imagingAdvanced: "Advanced imaging (MRI/CT)",
  mentalHealthOutpatient: "Mental health visit",
  genericDrugs: "Generic drug",
  preferredBrandDrugs: "Preferred brand drug",
  nonPreferredBrandDrugs: "Non-preferred brand drug",
  specialtyDrugs: "Specialty drug",
};

/** How a single service is cost-shared under a plan (parsed from the PUF strings). */
export interface ServiceCostShare {
  /** Flat dollar copay per service, or null if not applicable. */
  copay: number | null;
  /** Coinsurance as a 0..1 fraction of the allowed amount, or null. */
  coinsurance: number | null;
  /** Whether the plan deductible must be met before this cost share applies. */
  afterDeductible: boolean;
  /** Covered with no member cost share. */
  noCharge: boolean;
}

export interface SbcScenario {
  deductible: number | null;
  copay: number | null;
  coinsurance: number | null;
  limit: number | null;
}

/** A normalized health plan, assembled from the CMS PUFs. */
export interface Plan {
  id: string; // StandardComponentId (14 char)
  state: string;
  issuer: string;
  marketingName: string;
  planType: PlanTypeCode;
  metal: Metal;
  hsaEligible: boolean;
  /** Actuarial value (share of costs the plan pays on average), 0..1. */
  actuarialValue: number | null;
  /** In-network individual deductible (combined medical+drug when integrated). */
  deductible: number;
  /** Separate drug deductible, when the plan is not integrated. */
  drugDeductible: number | null;
  integratedMedicalDrugDeductible: boolean;
  /** In-network individual out-of-pocket maximum. */
  oopMax: number;
  /** Monthly unsubsidized premium keyed by CMS rate-age bucket. */
  premiumByAge: Record<string, number>;
  /** Per-service cost sharing, parsed from the Benefits & Cost Sharing PUF. */
  costShares: Partial<Record<ServiceKey, ServiceCostShare>>;
  /** Real worked examples published in the plan's SBC (when available). */
  sbc?: {
    havingABaby?: SbcScenario;
    managingDiabetes?: SbcScenario;
    simpleFracture?: SbcScenario;
  };
  /**
   * Optional drug formulary: lowercased drug name to the tier the plan covers it at, or
   * "notCovered". Present once a formulary source (CMS QHP formulary files) is ingested.
   */
  formulary?: Record<string, DrugTier | "notCovered">;
  /** Optional in-network provider identifiers (names or NPIs), for network matching. */
  network?: string[];
}

export interface PlanDataset {
  state: string;
  planYear: number;
  generatedAt: string;
  source: string;
  rateAgeKeys: string[];
  plans: Plan[];
}

// ----- Patient profile -----

export type ConditionKey =
  | "diabetesType2"
  | "diabetesType1"
  | "hypertension"
  | "highCholesterol"
  | "asthma"
  | "copd"
  | "depressionAnxiety"
  | "heartDisease"
  | "cancerActive"
  | "arthritis"
  | "migraine"
  | "thyroid";

export type PlannedEventKey =
  | "pregnancy"
  | "plannedSurgery"
  | "tryingToConceive"
  | "therapyWeekly"
  | "physicalTherapy";

export type DrugTier =
  | "genericDrugs"
  | "preferredBrandDrugs"
  | "nonPreferredBrandDrugs"
  | "specialtyDrugs";

export interface Prescription {
  name: string;
  tier: DrugTier;
  /** Fills per year (12 = monthly maintenance med). */
  fillsPerYear: number;
}

export type RiskTolerance = "low" | "medium" | "high";

export interface PatientProfile {
  age: number;
  sex: "male" | "female";
  state: string;
  /** Household size and income drive ACA premium subsidies (APTC). */
  householdSize: number;
  annualIncome: number;
  tobacco: boolean;
  conditions: ConditionKey[];
  prescriptions: Prescription[];
  plannedEvents: PlannedEventKey[];
  /** Free-text doctors/facilities the patient wants to keep. */
  providers: string[];
  riskTolerance: RiskTolerance;
  /** Hard requirements that filter the plan set. */
  requireHsa?: boolean;
}

// ----- Simulation output -----

export interface SimSummary {
  planId: string;
  annualPremium: number; // after any subsidy
  annualPremiumGross: number; // before subsidy
  subsidy: number; // APTC applied per year
  expectedOOP: number;
  expectedTotal: number; // premium + expected OOP
  median: number;
  p10: number;
  p90: number;
  stdev: number;
  probHitOOPMax: number;
  maxTotal: number; // worst simulated total (premium + OOP cap)
  histogram: { bin: number; count: number }[];
  /** Mean OOP contribution by service line, for the attribution view. */
  oopByService: Partial<Record<ServiceKey, number>>;
  // ----- Tail risk + estimator precision (see lib/sim/estimators.ts) -----
  /** Expected all-in cost in the worst 10% of years (CVaR / expected shortfall). */
  cvar90?: number;
  /** Expected all-in cost in the worst 5% of years. */
  cvar95?: number;
  /** Standard error of expectedTotal, so two plans can be judged a real tie or not. */
  meanStdErr?: number;
  /** Standard error of the p90 (bad-year) estimate. */
  p90StdErr?: number;
  /** Antithetic variance-reduction ratio (>= 1: how many plain draws each draw is worth). */
  varianceReductionRatio?: number;
  /** scenarioCount scaled by the variance-reduction ratio. */
  effectiveSampleSize?: number;
}

export interface ConstraintCheck {
  coversAllDrugs: boolean;
  providersInNetwork: boolean;
  hsaOk: boolean;
}

export interface RankedPlan {
  plan: Plan;
  sim: SimSummary;
  /** Risk-adjusted objective (lower is better): E[cost] + lambda * downside. */
  score: number;
  constraints: ConstraintCheck;
}
