import type { ConstraintCheck, PatientProfile, Plan, SimSummary } from "@/lib/types";
import type { Assumption } from "@/lib/sim/facts";
import type { Sensitivity } from "@/lib/sim/sensitivity";

// The trust / compliance layer. Every recommendation carries, in one place: where its numbers
// came from, what it assumed, what it is uncertain about, what would change the answer, and a
// clear non-advice guardrail. The goal is that a user (or a compliance reviewer) can see what
// is KNOWN, what is ESTIMATED, and what could move the recommendation, without reading code.

export const NOT_ADVICE =
  "This is a decision-support estimate, not insurance, medical, legal, or tax advice. Figures model your inputs against real plan rules and national care data; your actual costs depend on the care you receive, your providers, and your final plan documents. Confirm details with the issuer and healthcare.gov before enrolling.";

export interface TrustReport {
  /** Data provenance behind the recommendation. */
  sources: string[];
  /** Plain-English list of the modeling assumptions in play. */
  assumptions: string[];
  /** Formulary coverage flags for the patient's drugs. */
  drugCoverageFlags: string[];
  /** Network adequacy warnings for the patient's providers. */
  networkWarnings: string[];
  /** One-line statement of the estimate's statistical precision. */
  uncertainty: string;
  /** The levers that would change which plan wins. */
  whatCouldChange: string[];
  /** Fixed non-advice guardrail. */
  disclaimer: string;
}

export interface TrustInputs {
  plan: Plan;
  sim: SimSummary;
  constraints: ConstraintCheck;
  profile: PatientProfile;
  assumptions: Assumption[];
  sensitivity: Sensitivity | null;
  /** Whether the critic moved the recommendation off the raw cheapest, and why. */
  overrodeRawTop: boolean;
  overrideReasons: string[];
}

export function buildTrustReport(inp: TrustInputs): TrustReport {
  const { plan, sim, constraints, profile, assumptions, sensitivity } = inp;

  const sources = [
    "Plans, premiums, benefits: CMS PY2026 Exchange Public Use Files (data.healthcare.gov)",
    "Care patterns and prices: AHRQ Medical Expenditure Panel Survey",
    "Premium subsidy: ACA APTC via the second-lowest-cost silver benchmark",
  ];
  if (plan.formulary) sources.push("Drug coverage: CMS QHP machine-readable formulary for this plan");

  const drugCoverageFlags: string[] = [];
  if (profile.prescriptions.length > 0) {
    if (!plan.formulary)
      drugCoverageFlags.push(
        "No published formulary for this plan: drug coverage is assumed, not verified. Confirm your prescriptions are covered.",
      );
    else if (!constraints.coversAllDrugs)
      drugCoverageFlags.push("At least one of your prescriptions is not on this plan's formulary or sits at a higher tier.");
    else drugCoverageFlags.push("All your listed prescriptions were matched on this plan's formulary.");
  }

  const networkWarnings: string[] = [];
  if (profile.providers.length > 0) {
    if (!plan.network)
      networkWarnings.push(
        "No published provider network for this plan: in-network status is assumed. Verify your doctors are covered.",
      );
    else if (!constraints.providersInNetwork)
      networkWarnings.push("A provider you asked to keep appears to be out of this plan's network.");
    else networkWarnings.push("Your listed providers were matched in this plan's network.");
  }

  // Precision: express the mean's standard error as a share of the estimate, plus the tail gap.
  const se = sim.meanStdErr ?? 0;
  const rel = sim.expectedTotal > 0 ? (se / sim.expectedTotal) * 100 : 0;
  const badYear = sim.cvar90 ?? sim.p90;
  const uncertainty =
    `Expected annual cost about $${sim.expectedTotal.toLocaleString()} ± $${se.toLocaleString()} ` +
    `(±${rel.toFixed(1)}% sampling error); a genuinely bad year (worst 10%) runs about $${badYear.toLocaleString()}.`;

  const whatCouldChange: string[] = [];
  if (inp.overrodeRawTop && inp.overrideReasons.length)
    whatCouldChange.push(`The cheapest-on-paper plan was set aside: ${inp.overrideReasons.join(" ")}`);
  if (sensitivity)
    for (const c of sensitivity.crossovers)
      if (!c.winnerDominates) whatCouldChange.push(c.note); // direction-aware crossover
  whatCouldChange.push("A new prescription, a planned surgery or pregnancy, or an income change can shift the ranking. Re-run when your situation changes.");

  return {
    sources,
    assumptions: assumptions.map((a) => `${a.label}: ${a.value}${a.note ? ` (${a.note})` : ""}`),
    drugCoverageFlags,
    networkWarnings,
    uncertainty,
    whatCouldChange,
    disclaimer: NOT_ADVICE,
  };
}
