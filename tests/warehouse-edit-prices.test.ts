import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), reserve: vi.fn() }));
const tx = vi.hoisted(() => ({ order: { findUnique: vi.fn(), update: vi.fn() }, project: { findUnique: vi.fn() }, item: { findMany: vi.fn() }, orderLine: { update: vi.fn(), create: vi.fn(), delete: vi.fn() }, $queryRaw: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/notifications/schedule-after-response", () => ({ scheduleAfterResponse: vi.fn() }));
vi.mock("@/server/orders/reserve", () => ({ getReservedQtyByItemId: mocks.reserve }));
vi.mock("@/server/ratings/greenwich-offers", () => ({ getGreenwichItemBenefits: async () => new Map() }));
import { PATCH } from "@/app/api/orders/[id]/warehouse-edit/route";
const stamp = "2026-10-14T00:00:00.000Z";
const order = { id: "o", projectId: "p", updatedAt: new Date(stamp), status: "ESTIMATE_SENT", source: "GREENWICH", startDate: new Date(stamp), endDate: new Date(stamp), rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING", payMultiplier: 1, clientPaymentMethod: "NON_CASH", rentalDiscountType: "NONE", greenwichRequestedDiscountType: "NONE", deliveryEnabled: false, montageEnabled: false, demontageEnabled: false, lines: [{ id: "l", itemId: "i", requestedQty: 1, pricePerDaySnapshot: 500, payMultiplierSnapshot: 1 }] };
const write = (body: unknown) => PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "o" }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "a" } }); mocks.transaction.mockImplementation(async (callback) => callback(tx));
  tx.order.findUnique.mockResolvedValue(order); tx.project.findUnique.mockResolvedValue({ archivedAt: null }); tx.$queryRaw.mockResolvedValue([]);
  tx.item.findMany.mockResolvedValue([{ id: "i", name: "Стойка", pricePerDay: 100, total: 20, inRepair: 0, broken: 0, missing: 0 }]); mocks.reserve.mockResolvedValue(new Map());
});
it("preserves an individual tariff when only quantity changes", async () => {
  expect((await write({ expectedUpdatedAt: stamp, lines: [{ id: "l", itemId: "i", requestedQty: 2 }] })).status).toBe(200);
  expect(tx.orderLine.update.mock.calls[0][0].data.pricePerDaySnapshot).toBe(500);
  expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
});
it("changes only the order snapshot and resets customer approval", async () => {
  expect((await write({ expectedUpdatedAt: stamp, lines: [{ id: "l", itemId: "i", requestedQty: 1, pricePerDaySnapshot: 700.5 }] })).status).toBe(200);
  expect(tx.orderLine.update.mock.calls[0][0].data.pricePerDaySnapshot).toBe(700.5);
  expect(tx.order.update.mock.calls[0][0].data.status).toBe("SUBMITTED");
});
it("rejects stale edits, archived projects and invalid prices without changing lines", async () => {
  const lines = [{ id: "l", itemId: "i", requestedQty: 1, pricePerDaySnapshot: 700 }];
  expect((await write({ expectedUpdatedAt: "2026-10-13T00:00:00.000Z", lines })).status).toBe(409);
  tx.project.findUnique.mockResolvedValueOnce({ archivedAt: new Date() });
  expect((await write({ expectedUpdatedAt: stamp, lines })).status).toBe(400);
  expect((await write({ lines: [{ ...lines[0], pricePerDaySnapshot: -1 }] })).status).toBe(400);
  expect(tx.orderLine.update).not.toHaveBeenCalled();
});
