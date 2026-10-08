import { describe, expect, it } from "vitest";
import { proposalTotals } from "@/lib/proposals";

const item = { selectionRole: "PRIMARY" as const, qty: 2, clientUnitPrice: 100, internalUnitCost: 40, priceTypeSnapshot: "FIXED" as const };
describe("proposal budget", () => {
  it("counts only primary services; options and alternatives remain separate", () => {
    expect(proposalTotals([item, ...(["OPTIONAL", "ALTERNATIVE", "EXCLUDED"] as const).map(selectionRole => ({ ...item, selectionRole }))])).toMatchObject({ client: 200, cost: 80, margin: 120 });
  });
  it("distinguishes unknown prices and costs from a real zero", () => {
    expect(proposalTotals([{ ...item, clientUnitPrice: null, internalUnitCost: null }, { ...item, clientUnitPrice: 0, internalUnitCost: 0 }])).toMatchObject({ client: 0, unresolved: 1, unconfirmedCost: 1 });
  });
  it("marks FROM and RANGE as preliminary rather than exact", () => {
    expect(proposalTotals([{ ...item, priceTypeSnapshot: "RANGE" }]).preliminary).toBe(true);
    expect(proposalTotals([{ ...item, priceTypeSnapshot: "FROM" }]).preliminary).toBe(true);
  });
  it("allows an explicitly negotiated price for an ON_REQUEST snapshot", () => {
    expect(proposalTotals([{ ...item, priceTypeSnapshot: "ON_REQUEST" }])).toMatchObject({ client: 200, unresolved: 0 });
  });
  it("rounds each line to kopecks", () => {
    expect(proposalTotals([{ ...item, qty: 3, clientUnitPrice: 0.1 }]).client).toBe(0.3);
  });
});
