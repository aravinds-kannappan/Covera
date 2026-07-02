import { describe, it, expect } from "vitest";
import type { PatientProfile } from "@/lib/types";
import { adjudicateExplained } from "@/lib/sim/costsharing";
import { sanitizeExtracted } from "@/lib/documents/extract";
import {
  auditDocument,
  deniedLines,
  employerPlanToPlan,
  extractedAccumulators,
  mergePrescriptions,
} from "@/lib/documents/apply";
import type { ExtractedEmployerPlan, ExtractedEOB, ExtractedPrescriptionList } from "@/lib/documents/types";

const profile: PatientProfile = {
  age: 40, sex: "female", state: "TX", householdSize: 1, annualIncome: 80000, tobacco: false,
  conditions: [], prescriptions: [{ name: "metformin", tier: "genericDrugs", fillsPerYear: 12 }],
  plannedEvents: [], providers: [], riskTolerance: "medium",
};

describe("sanitizeExtracted", () => {
  it("drops invalid service keys and coerces money to numbers", () => {
    const warnings: string[] = [];
    const doc = sanitizeExtracted(
      "medicalBill",
      { provider: "Hospital", lines: [{ description: "MRI", serviceKey: "imagingAdvanced", billed: "1,200" }, { description: "bogus", serviceKey: "notAKey", billed: 50 }] },
      warnings,
    );
    expect(doc.kind).toBe("medicalBill");
    if (doc.kind === "medicalBill") {
      expect(doc.lines).toHaveLength(2);
      expect(doc.lines[0].serviceKey).toBe("imagingAdvanced");
      expect(doc.lines[0].billed).toBe(1200); // "1,200" coerced
      expect(doc.lines[1].serviceKey).toBeUndefined(); // invalid key dropped
    }
  });
});

describe("mergePrescriptions", () => {
  it("adds new drugs and dedupes existing ones", () => {
    const list: ExtractedPrescriptionList = {
      kind: "prescriptionList",
      prescriptions: [
        { name: "atorvastatin", tier: "genericDrugs", fillsPerYear: 12 },
        { name: "Metformin" }, // already present, different case
      ],
    };
    const { profile: next, added } = mergePrescriptions(profile, list);
    expect(next.prescriptions).toHaveLength(2);
    expect(added).toEqual(["atorvastatin"]);
  });
});

describe("employerPlanToPlan", () => {
  it("produces a Plan the cost engine can adjudicate", () => {
    const e: ExtractedEmployerPlan = {
      kind: "employerPlan", planName: "MegaCorp PPO", deductible: 2000, oopMax: 8000, coinsurance: 0.2, employeeMonthlyPremium: 250,
    };
    const plan = employerPlanToPlan(e)!;
    expect(plan.id).toBe("EMPLOYER");
    // $30k inpatient year -> $2000 + 20% of $28000 = $7600 (matches the reference bundle math).
    const adj = adjudicateExplained(plan, { byService: { inpatient: [30000] }, totalAllowed: 30000 });
    expect(Math.round(adj.oop)).toBe(7600);
  });

  it("returns null when core cost-sharing is missing", () => {
    expect(employerPlanToPlan({ kind: "employerPlan", planName: "x" })).toBeNull();
  });
});

describe("auditDocument + denied + accumulators", () => {
  const eob: ExtractedEOB = {
    kind: "eob",
    issuer: "BCBS",
    deductibleMetToDate: 1500,
    oopMetToDate: 3000,
    lines: [
      { description: "Office visit", serviceKey: "primaryCare", billed: 400, denied: false },
      { description: "Lab panel", serviceKey: "labs", billed: 250, denied: true, denialReason: "not medically necessary" },
    ],
  };

  it("audits the lines and totals the billed amounts", () => {
    const audit = auditDocument(eob);
    expect(audit.totalBilled).toBe(650);
    expect(audit.lines).toHaveLength(2);
  });

  it("surfaces denied lines as appeal candidates", () => {
    expect(deniedLines(eob).map((l) => l.description)).toEqual(["Lab panel"]);
  });

  it("exposes year-to-date accumulators to refine the estimate", () => {
    expect(extractedAccumulators(eob)).toEqual({ deductibleMetToDate: 1500, oopMetToDate: 3000 });
  });
});
