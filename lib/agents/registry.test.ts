import { describe, it, expect } from "vitest";
import txData from "@/data/plans.TX.json";
import type { Plan } from "@/lib/types";
import { newThread } from "@/lib/store/conversations";
import { dispatchTool } from "@/lib/agents/registry";

const plans = (txData as { plans: Plan[] }).plans;

function thread() {
  const t = newThread("demo:test", "sandbox");
  t.profile = {
    ...t.profile,
    age: 40,
    state: "TX",
    annualIncome: 50000,
    conditions: ["diabetesType2"],
  };
  return t;
}

describe("dispatchTool — deterministic tools over real TX plans", () => {
  it("recommend_plans returns a ranking and advances status", async () => {
    const t = thread();
    const out = await dispatchTool("recommend_plans", {}, t, plans);
    expect(out.meta?.kind).toBe("plans");
    expect(t.status).toBe("advising");
    const data = out.result as { topPlans: unknown[] };
    expect(data.topPlans.length).toBeGreaterThan(0);
  });

  it("recommend_plans with a whatif labels it as a what-if", async () => {
    const t = thread();
    const out = await dispatchTool("recommend_plans", { whatif: { plannedEvents: ["pregnancy"] } }, t, plans);
    expect(out.meta?.kind).toBe("whatif");
  });

  it("compare_employer_offer produces a marketplace verdict", async () => {
    const t = thread();
    const out = await dispatchTool("compare_employer_offer", { employerMonthlyToEmployee: 420 }, t, plans);
    expect(out.meta?.kind).toBe("marketplace");
    const d = out.result as { bestMarketplaceMonthly: number; verdict: string };
    expect(d.bestMarketplaceMonthly).toBeGreaterThanOrEqual(0);
    expect(d.verdict.length).toBeGreaterThan(0);
  });

  it("lookup_procedure_cost returns a cost range", async () => {
    const t = thread();
    const out = await dispatchTool("lookup_procedure_cost", { procedureId: "mri_brain" }, t, plans);
    expect(out.meta?.kind).toBe("hospital");
    const d = out.result as { min: number; max: number };
    expect(d.max).toBeGreaterThanOrEqual(d.min);
  });

  it("finalize_plan records the chosen plan and flips status", async () => {
    const t = thread();
    const chosen = plans[0].marketingName;
    const out = await dispatchTool("finalize_plan", { planName: chosen }, t, plans);
    expect(t.status).toBe("finalized");
    expect(t.selectedPlanId).toBe(plans[0].id);
    expect((out.result as { finalized: boolean }).finalized).toBe(true);
  });
});
