import { describe, it, expect } from "vitest";
import { auditBill } from "@/lib/sim/billaudit";
import { PROCEDURES } from "@/lib/sim/params";

// Use a service line that is guaranteed to have a reference price so the benchmark exists.
const known = PROCEDURES[0];

describe("bill audit", () => {
  it("flags a line billed far above the reference allowed amount", () => {
    const a = auditBill([
      { description: known.label, serviceKey: known.serviceKey, billed: known.typicalAllowed * 100 },
    ]);
    expect(a.lines[0].flags).toContain("overcharge");
    expect(a.potentialOvercharge).toBeGreaterThan(0);
    expect(a.totalBilled).toBe(known.typicalAllowed * 100);
  });

  it("flags likely duplicate lines", () => {
    const a = auditBill([
      { description: "CBC panel", serviceKey: known.serviceKey, billed: 120 },
      { description: "CBC panel", serviceKey: known.serviceKey, billed: 120 },
    ]);
    expect(a.lines[0].flags).toContain("possible duplicate");
    expect(a.lines[1].flags).toContain("possible duplicate");
  });

  it("marks uncoded lines as not benchmarkable", () => {
    const a = auditBill([{ description: "misc facility fee", billed: 500 }]);
    expect(a.lines[0].referenceAllowed).toBeNull();
    expect(a.lines[0].flags).toContain("uncoded: could not benchmark");
  });

  it("reports a clean bill when charges are reasonable", () => {
    const a = auditBill([{ description: "small charge", serviceKey: known.serviceKey, billed: 1 }]);
    expect(a.lines[0].flags).not.toContain("overcharge");
    expect(a.flags.join(" ")).toContain("no obvious overcharges");
  });
});
