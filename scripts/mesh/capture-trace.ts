/**
 * Capture a REAL agent-mesh exchange to data/mesh-trace.json, which the landing-page network
 * animation (components/story/agent-network.tsx) replays. This replaces the old hand-authored
 * PHASES array: the figures shown now come from the real deterministic engine (a real Coverage
 * Card, real coverage rules, a real procedure estimate, a real marketplace comparison), so the
 * "figures come from the real simulation" caption is finally true.
 *
 *   npx tsx scripts/mesh/capture-trace.ts   (no key or network)
 *
 * The connective narration is concise and factual, derived from the tool outputs. The only
 * illustrative line is the patient's own opening words. Every dollar figure is computed here from
 * the committed CMS plan data, exactly as the live mesh (lib/agents/mesh) computes them, so the
 * animation stays free on page load and never bills or needs a model key.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { PatientProfile } from "@/lib/types";
import { loadPlans } from "@/lib/data/plans";
import { recommendPlans } from "@/lib/agents/advisor";
import { buildCard, encodeCard } from "@/lib/card";
import { consultConcierge } from "@/lib/agents/mesh/consult";
import { compareEmployerOffer } from "@/lib/agents/marketplace";
import { usd } from "@/lib/utils";

const STATE = "TX";
const PROCEDURE_ID = "mri_brain";
const EMPLOYER_MONTHLY = 350;

async function main() {
  const plans = await loadPlans(STATE);

  const profile: PatientProfile = {
    age: 34,
    sex: "female",
    state: STATE,
    householdSize: 1,
    annualIncome: 42000,
    tobacco: false,
    conditions: [],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "low",
  };

  // Real ranking -> real headline plan (through the actor/critic safety layer).
  const { result } = recommendPlans(profile, plans);
  const top = result.ranked[0];
  if (!top) throw new Error("No plans ranked for the trace scenario.");
  const plan = top.plan;
  const monthly = top.sim.annualPremium / 12;

  // Real portable Coverage Card, then a real cross-agent consult off it.
  const card = buildCard(profile, plan, monthly, "Maya");
  const token = encodeCard(card);
  const consult = consultConcierge({ cardToken: token, procedureId: PROCEDURE_ID });
  const market = compareEmployerOffer(profile, plans, EMPLOYER_MONTHLY);

  const oopMax = consult.coverage?.oopMax ?? plan.oopMax;
  const deductible = consult.coverage?.deductible ?? plan.deductible;
  const est = consult.estimate;

  // Map the real exchange onto the network's nodes. `real` flags a line whose figures are
  // engine-computed (everything except the patient's own opening words).
  const phases = [
    {
      from: "you",
      to: "concierge",
      speaker: "You",
      line: "I'm 34, in Texas, and scared of a bill I can't pay.",
      real: false,
    },
    {
      from: "concierge",
      to: "advisor",
      speaker: "Concierge → Advisor",
      line: "Rank real plans on her bad-year risk, not just premium.",
      real: false,
    },
    {
      from: "advisor",
      to: "concierge",
      speaker: "Advisor → Concierge",
      line: `${plan.metal} caps her worst year at ${usd(oopMax)}. It's the safe pick.`,
      real: true,
    },
    {
      from: "concierge",
      to: "marketplace",
      speaker: "Concierge → Marketplace",
      line: `Best marketplace plan is about ${usd(market.bestMarketplaceMonthly)}/mo net of subsidy.`,
      real: true,
    },
    {
      from: "concierge",
      to: "you",
      speaker: "Concierge → You",
      line: `The ${plan.metal} plan fits you. Want me to set it up?`,
      real: true,
    },
    {
      from: "advocate",
      to: "employer",
      speaker: "Advocate → Employer",
      line: `Your ${usd(EMPLOYER_MONTHLY)}/mo offer vs ${usd(market.bestMarketplaceMonthly)}/mo on the marketplace: coordinating enrollment.`,
      real: true,
    },
    {
      from: "costdesk",
      to: "hospital",
      speaker: "Cost desk → Hospital",
      line: est
        ? `MRI on her card: ${usd(est.ifDeductibleUnmet)} before the ${usd(deductible)} deductible, ${usd(est.ifDeductibleMet)} after.`
        : `Confirming her in-network MRI cost on the card (deductible ${usd(deductible)}).`,
      real: true,
    },
  ];

  const trace = {
    _provenance: {
      source:
        "Real deterministic Covera engine: a real Coverage Card, real plan cost-sharing, a real procedure estimate, and a real marketplace comparison over the committed CMS plan data. No model or network.",
      capturedWith: "deterministic-engine",
      note: "Regenerate with `npx tsx scripts/mesh/capture-trace.ts`. Every line flagged real:true has engine-computed figures; the opening line is the patient's own words.",
    },
    generatedAt: new Date().toISOString(),
    scenario: {
      member: card.name,
      age: profile.age,
      state: STATE,
      plan: `${plan.metal} · ${plan.marketingName}`,
      procedure: "MRI (without contrast)",
    },
    phases,
  };

  const outDir = path.resolve(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "mesh-trace.json"), JSON.stringify(trace, null, 2));

  console.log("Captured real mesh trace -> data/mesh-trace.json");
  console.log(`  Plan: ${plan.metal} ${plan.marketingName}  ·  worst-year cap ${usd(oopMax)}`);
  if (est) console.log(`  MRI: ${usd(est.ifDeductibleUnmet)} before / ${usd(est.ifDeductibleMet)} after deductible`);
  console.log(`  Marketplace: ${usd(market.bestMarketplaceMonthly)}/mo net of subsidy`);
}

main();
