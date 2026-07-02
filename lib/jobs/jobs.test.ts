import { describe, it, expect } from "vitest";
import { InProcessQueue } from "@/lib/jobs/inprocess";

describe("InProcessQueue", () => {
  it("runs a registered handler and records the result", async () => {
    const q = new InProcessQueue();
    q.register<{ a: number; b: number }, number>("longSimulation", async (p) => p.a + p.b);
    const job = await q.enqueue({ kind: "longSimulation", payload: { a: 2, b: 3 } });
    const done = await q.waitFor(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.result).toBe(5);
  });

  it("retries a flaky handler up to the attempt limit", async () => {
    const q = new InProcessQueue();
    let calls = 0;
    q.register("longSimulation", async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return "ok";
    });
    const job = await q.enqueue({ kind: "longSimulation", payload: {} });
    const done = await q.waitFor(job.id);
    expect(done.status).toBe("succeeded");
    expect(done.attempts).toBe(3);
  });

  it("dedupes by idempotency key", async () => {
    const q = new InProcessQueue();
    q.register("refreshFormulary", async () => "done");
    const a = await q.enqueue({ kind: "refreshFormulary", payload: {}, dedupeKey: "2026-TX" });
    const b = await q.enqueue({ kind: "refreshFormulary", payload: {}, dedupeKey: "2026-TX" });
    expect(b.id).toBe(a.id);
  });

  it("fails loudly when no handler is registered", async () => {
    const q = new InProcessQueue();
    const job = await q.enqueue({ kind: "ingestPlans", payload: {} });
    const done = await q.waitFor(job.id);
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/No handler/);
  });

  it("lets a handler enqueue follow-up work", async () => {
    const q = new InProcessQueue();
    let childId = "";
    q.register("refreshProcedurePrices", async () => "child");
    q.register("runBenchmark", async (_p, ctx) => {
      const child = await ctx.enqueue({ kind: "refreshProcedurePrices", payload: {} });
      childId = child.id;
      return "parent";
    });
    const parent = await q.enqueue({ kind: "runBenchmark", payload: {} });
    await q.waitFor(parent.id);
    const child = await q.waitFor(childId);
    expect(child.status).toBe("succeeded");
    expect(child.result).toBe("child");
  });
});
