import { describe, it, expect } from "vitest";
import txData from "@/data/plans.TX.json";
import type { Plan, PatientProfile } from "@/lib/types";
import { optimize } from "@/lib/sim/optimize";

const plans = (txData as { plans: Plan[] }).plans;

describe("optimize on real TX PUF data", () => {
  it("ranks real plans for a sample patient within budget", () => {
    const profile: PatientProfile = {
      age: 52,
      sex: "male",
      state: "TX",
      householdSize: 1,
      annualIncome: 60000,
      tobacco: false,
      conditions: ["diabetesType2", "hypertension"],
      prescriptions: [],
      plannedEvents: [],
      providers: [],
      riskTolerance: "medium",
    };
    const t0 = Date.now();
    const res = optimize(profile, plans);
    const ms = Date.now() - t0;

    console.log(
      `\nTX plans: ${plans.length}, considered: ${res.consideredCount}, time: ${ms}ms`,
    );
    console.log(
      `subsidy: $${res.subsidy.aptcMonthly.toFixed(0)}/mo (FPL ${(res.subsidy.fplRatio * 100).toFixed(0)}%, SLCSP $${res.subsidy.slcspMonthly.toFixed(0)})`,
    );
    console.log(
      `modeled spend $${res.spendVsAverage.simulatedMean} vs MEPS avg $${res.spendVsAverage.mepsAverage} (${res.spendVsAverage.ageBand})`,
    );
    for (const r of res.ranked.slice(0, 6)) {
      console.log(
        ` ${r.plan.metal.padEnd(9)} ${r.plan.marketingName.slice(0, 34).padEnd(34)} ` +
          `exp $${r.sim.expectedTotal}  p10 $${r.sim.p10} / p90 $${r.sim.p90}  ` +
          `prem $${r.sim.annualPremium}/yr  hitOOP ${(r.sim.probHitOOPMax * 100).toFixed(0)}%`,
      );
    }
    console.log(
      `drivers: ${res.drivers.map((d) => `${d.service} $${Math.round(d.oop)}`).join(", ")}`,
    );

    expect(res.ranked.length).toBeGreaterThan(0);
    expect(res.ranked[0].sim.expectedTotal).toBeGreaterThan(0);
    expect(res.ranked[0].sim.p90).toBeGreaterThanOrEqual(res.ranked[0].sim.median);
    expect(ms).toBeLessThan(8000);
  }, 30000);
});
