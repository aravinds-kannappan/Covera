import type { Plan, ServiceCostShare, ServiceKey } from "@/lib/types";
import { SERVICE_KEYS } from "@/lib/types";
import type { Scenario } from "@/lib/sim/utilization";

// Deterministic claim bundles: fixed, hand-checkable episodes of care used as regression
// fixtures for the adjudication engine. These are REFERENCE amounts (round, illustrative
// allowed dollars) chosen so the expected out-of-pocket is easy to verify by hand, NOT a
// claim about any specific real bill. They pin the cost math so a refactor cannot silently
// change what a diabetes year or a surgery episode costs on a known plan.

/** A reference plan with uniform cost sharing, so OOP is a clean function of total spend:
 *  pay 100% under a $2,000 deductible, then 20% coinsurance, capped at an $8,000 OOP max. */
export const REFERENCE_PLAN: Plan = (() => {
  const share: ServiceCostShare = {
    copay: null,
    coinsurance: 0.2,
    afterDeductible: true,
    noCharge: false,
  };
  const costShares: Partial<Record<ServiceKey, ServiceCostShare>> = {};
  for (const k of SERVICE_KEYS) costShares[k] = share;
  return {
    id: "REFERENCE",
    state: "TX",
    issuer: "Reference",
    marketingName: "Reference Silver",
    planType: "PPO",
    metal: "Silver",
    hsaEligible: false,
    actuarialValue: 0.7,
    deductible: 2000,
    drugDeductible: null,
    integratedMedicalDrugDeductible: true,
    oopMax: 8000,
    premiumByAge: { "40": 400 },
    costShares,
  };
})();

function year(byService: Partial<Record<ServiceKey, number[]>>): Scenario {
  let totalAllowed = 0;
  for (const k in byService)
    for (const a of byService[k as ServiceKey]!) totalAllowed += a;
  return { byService, totalAllowed };
}

export interface ClaimBundle {
  key: string;
  label: string;
  scenario: Scenario;
}

// Each bundle's totalAllowed and thus its OOP on REFERENCE_PLAN is documented inline.
export const CLAIM_BUNDLES: ClaimBundle[] = [
  // 12 generic fills @ $40 = $480 (under deductible) -> OOP $480.
  { key: "diabetesMeds", label: "Diabetes maintenance meds (1 yr)", scenario: year({ genericDrugs: Array(12).fill(40) }) },
  // 3 specialist visits @ $350 = $1,050 (under deductible) -> OOP $1,050.
  { key: "cardiologyVisits", label: "Cardiology follow-ups (3 visits)", scenario: year({ specialist: [350, 350, 350] }) },
  // 20 therapy visits @ $150 = $3,000 -> $2,000 + 20% of $1,000 = $2,200.
  { key: "therapyVisits", label: "Weekly therapy (20 visits)", scenario: year({ mentalHealthOutpatient: Array(20).fill(150) }) },
  // 12 preferred-brand fills @ $200 = $2,400 -> $2,000 + 20% of $400 = $2,080.
  { key: "arthritisMeds", label: "Arthritis brand medication (1 yr)", scenario: year({ preferredBrandDrugs: Array(12).fill(200) }) },
  // 1 ER visit @ $2,500 -> $2,000 + 20% of $500 = $2,100.
  { key: "erVisit", label: "Emergency room visit", scenario: year({ emergencyRoom: [2500] }) },
  // 1 MRI @ $1,200 (under deductible) -> OOP $1,200.
  { key: "imaging", label: "Advanced imaging (MRI)", scenario: year({ imagingAdvanced: [1200] }) },
  // Outpatient surgery $12,000 + surgeon visit $400 = $12,400 -> $2,000 + 20% of $10,400 = $4,080.
  { key: "surgeryEpisode", label: "Outpatient surgery episode", scenario: year({ outpatientSurgery: [12000], specialist: [400] }) },
  // Delivery $15,000 + 10 prenatal specialist @ $400 + 5 labs @ $200 = $20,000 -> $2,000 + 20% of $18,000 = $5,600.
  { key: "maternityEpisode", label: "Maternity + delivery episode", scenario: year({ inpatient: [15000], specialist: Array(10).fill(400), labs: Array(5).fill(200) }) },
  // Inpatient stay $30,000 -> $2,000 + 20% of $28,000 = $7,600 (under the $8,000 cap).
  { key: "inpatientStay", label: "Inpatient hospital stay", scenario: year({ inpatient: [30000] }) },
];
