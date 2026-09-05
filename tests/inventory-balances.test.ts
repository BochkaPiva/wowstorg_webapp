import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { getLinkedBalances, unlinkedQuantity } from "../src/server/inventory-balances";

describe("inventory source accounting", () => {
  it("does not present order repair units as manual stock", () => {
    expect(unlinkedQuantity(1, 1)).toBe(0);
    expect(unlinkedQuantity(5, 2)).toBe(3);
    expect(unlinkedQuantity(0, 2)).toBe(0);
  });
  it("counts only unresolved quantities, without adding repaired or disposed units", async () => {
    const db = {
      incident: { findMany: vi.fn().mockResolvedValue([
        { condition: "NEEDS_REPAIR", qty: 5, repairedQty: 2, utilizedQty: 1 },
        { condition: "BROKEN", qty: 4, repairedQty: 0, utilizedQty: 1 },
      ]) },
      lossRecord: { findMany: vi.fn().mockResolvedValue([{ qty: 6, foundQty: 2, writtenOffQty: 1 }]) },
    };
    expect(await getLinkedBalances(db as unknown as Prisma.TransactionClient, "item")).toEqual({ inRepair: 2, broken: 3, missing: 3 });
    expect(db.lossRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { itemId: "item", status: "OPEN", orderId: { not: null } } }));
    expect(db.incident.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "OPEN", orderLine: { itemId: "item" } } }));
  });
});
