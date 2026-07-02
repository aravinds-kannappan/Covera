import type { Plan, PatientProfile } from "@/lib/types";
import { effectiveCoinsurance } from "@/lib/sim/analytic";
import { MEPS, ageBandKey } from "@/lib/sim/params";
import type { UtilizationModel } from "@/lib/sim/utilization";

// Separating hard facts from assumptions is the honest core of a trustworthy estimate. A
// premium or a deductible is a contractual FACT pulled from the CMS filing: it will not
// change. How many times you will visit the ER, or what a knee MRI is allowed at, is an
// ASSUMPTION drawn from national survey data: it is our best model, not a promise. The UI
// shows these in two clearly labeled columns so a user knows exactly what is known versus
// estimated, and what could move the recommendation.

const CMS = "CMS PY2026 Exchange PUF (data.healthcare.gov)";
const MEPS_SRC = "AHRQ Medical Expenditure Panel Survey";

export interface HardFact {
  key: string;
  label: string;
  value: string;
  source: string;
}

export interface Assumption {
  key: string;
  label: string;
  value: string;
  source: string;
  note?: string;
}

export interface PlanFactSheet {
  facts: HardFact[];
  assumptions: Assumption[];
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Build the fact/assumption sheet for one plan and this patient's modeled utilization.
 * `premiumNetAnnual` is the subsidized annual premium the ranking used.
 */
export function buildFactSheet(
  plan: Plan,
  profile: PatientProfile,
  model: UtilizationModel,
  premiumNetAnnual: number,
): PlanFactSheet {
  const facts: HardFact[] = [
    { key: "issuer", label: "Plan", value: `${plan.marketingName} (${plan.issuer})`, source: CMS },
    { key: "metal", label: "Metal / type", value: `${plan.metal} · ${plan.planType}`, source: CMS },
    { key: "premium", label: "Premium after subsidy", value: `${usd(premiumNetAnnual)}/yr`, source: CMS },
    { key: "deductible", label: "Deductible", value: usd(plan.deductible), source: CMS },
    { key: "oopMax", label: "Out-of-pocket max", value: usd(plan.oopMax), source: CMS },
    {
      key: "coinsurance",
      label: "Typical coinsurance",
      value: `${Math.round(effectiveCoinsurance(plan) * 100)}% after deductible`,
      source: CMS,
    },
    { key: "hsa", label: "HSA eligible", value: plan.hsaEligible ? "Yes" : "No", source: CMS },
    {
      key: "formulary",
      label: "Drug formulary data",
      value: plan.formulary ? "Matched against real formulary" : "Not published for this plan",
      source: CMS,
    },
  ];

  const band = ageBandKey(profile.age);
  const conc = MEPS.concentration;

  // The handful of services that most drive this patient's modeled spend, for transparency.
  const topServices = (Object.keys(model.expectedFreq) as (keyof typeof model.expectedFreq)[])
    .map((s) => ({ s, freq: model.expectedFreq[s] }))
    .filter((x) => x.freq > 0.05)
    .sort((a, b) => b.freq - a.freq)
    .slice(0, 4)
    .map((x) => `${x.s} ~${x.freq.toFixed(1)}x`)
    .join(", ");

  const assumptions: Assumption[] = [
    {
      key: "utilization",
      label: "How much care you use",
      value: topServices || "age-band baseline utilization",
      source: MEPS_SRC,
      note: `Baseline for the ${band} age band, adjusted up for your conditions and planned events.`,
    },
    {
      key: "allowed",
      label: "What that care is allowed at",
      value: "MEPS median allowed amounts per service, log-normally distributed",
      source: MEPS_SRC,
      note: "Real prices vary by provider and region; these are national medians.",
    },
    {
      key: "frailty",
      label: "Bad-year / catastrophic risk",
      value: `frailty σ = ${MEPS.frailty.sigma}`,
      source: MEPS_SRC,
      note: `Calibrated so the top 5% of people carry ~${Math.round(conc.top5pct * 100)}% of spend, matching MEPS concentration.`,
    },
    {
      key: "chronic",
      label: "Chronic-care intensity",
      value:
        model.chronicMeds.length > 0
          ? `${model.chronicMeds.length} maintenance med(s), ${model.chronicMeds.reduce((a, m) => a + m.fillsPerYear, 0)} fills/yr`
          : "none modeled",
      source: MEPS_SRC,
    },
    {
      key: "planned",
      label: "Planned events",
      value:
        model.guaranteed.length > 0
          ? model.guaranteed.map((g) => `${g.count}× ${g.service}`).join(", ")
          : "none",
      source: MEPS_SRC,
      note: "Surgery/delivery episodes you told us to expect, modeled as guaranteed care.",
    },
  ];

  return { facts, assumptions };
}
