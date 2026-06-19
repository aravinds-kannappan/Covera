import type { PatientProfile } from "@/lib/types";

// Server-safe default profile. Kept out of the "use client" store so server routes (the
// texting agent) can seed a runnable profile too. The client store re-exports this.
export function defaultProfile(): PatientProfile {
  return {
    age: 35,
    sex: "female",
    state: "TX",
    householdSize: 1,
    annualIncome: 45000,
    tobacco: false,
    conditions: [],
    prescriptions: [],
    plannedEvents: [],
    providers: [],
    riskTolerance: "medium",
  };
}
