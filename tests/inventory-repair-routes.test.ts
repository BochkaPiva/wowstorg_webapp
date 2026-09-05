import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  item: { findUnique: vi.fn(), update: vi.fn() },
  incident: { findMany: vi.fn() },
  lossRecord: { findMany: vi.fn() },
  transaction: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
import { POST as restore } from "@/app/api/warehouse/repair-items/[id]/restore/route";
import { POST as writeOff } from "@/app/api/warehouse/repair-items/[id]/write-off/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.transaction.mockImplementation(async callback => callback(mocks));
  mocks.item.findUnique.mockResolvedValue({ id: "item", total: 5, inRepair: 2, broken: 0, isActive: true });
  mocks.incident.findMany.mockResolvedValue([{ condition: "NEEDS_REPAIR", qty: 2, repairedQty: 0, utilizedQty: 0 }]);
  mocks.lossRecord.findMany.mockResolvedValue([]);
});
const request = (qty: number) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ qty, condition: "NEEDS_REPAIR" }) });
const ctx = { params: Promise.resolve({ id: "item" }) };

describe("manual repairs cannot consume order incidents", () => {
  it.each([restore, writeOff])("rejects order-owned quantities without mutating stock", async handler => {
    expect((await handler(request(1), ctx)).status).toBe(409);
    expect(mocks.item.update).not.toHaveBeenCalled();
  });
  it("restores only the manual remainder without reducing total", async () => {
    mocks.item.findUnique.mockResolvedValue({ id: "item", total: 5, inRepair: 3, broken: 0, isActive: false });
    expect((await restore(request(1), ctx)).status).toBe(200);
    expect(mocks.item.update).toHaveBeenCalledWith({ where: { id: "item" }, data: { inRepair: { decrement: 1 } } });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
  it("writes off only unlinked units and decreases total by the same amount", async () => {
    mocks.item.findUnique.mockResolvedValue({ id: "item", total: 5, inRepair: 3, broken: 0, isActive: true });
    expect((await writeOff(request(1), ctx)).status).toBe(200);
    expect(mocks.item.update).toHaveBeenCalledWith({ where: { id: "item" }, data: { inRepair: { decrement: 1 }, total: { decrement: 1 } } });
  });
  it.each([0, -1, 1.5])("rejects invalid quantity %s", async qty => {
    expect((await restore(request(qty), ctx)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
