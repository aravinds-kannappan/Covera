"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PatientProfile } from "@/lib/types";
import type { OptimizeResult } from "@/lib/sim/optimize";

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

interface CoveraState {
  profile: PatientProfile | null;
  result: OptimizeResult | null;
  loading: boolean;
  selectedPlanId: string | null;
  setProfile: (p: PatientProfile) => void;
  patchProfile: (patch: Partial<PatientProfile>) => void;
  setResult: (r: OptimizeResult | null) => void;
  setLoading: (b: boolean) => void;
  selectPlan: (id: string | null) => void;
  reset: () => void;
}

export const useCovera = create<CoveraState>()(
  persist(
    (set) => ({
      profile: null,
      result: null,
      loading: false,
      selectedPlanId: null,
      setProfile: (profile) => set({ profile }),
      patchProfile: (patch) =>
        set((s) => ({
          profile: s.profile
            ? { ...s.profile, ...patch }
            : { ...defaultProfile(), ...patch },
        })),
      setResult: (result) => set({ result }),
      setLoading: (loading) => set({ loading }),
      selectPlan: (selectedPlanId) => set({ selectedPlanId }),
      reset: () => set({ profile: null, result: null, selectedPlanId: null }),
    }),
    {
      name: "covera-v1",
      partialize: (s) => ({
        profile: s.profile,
        selectedPlanId: s.selectedPlanId,
      }),
    },
  ),
);
