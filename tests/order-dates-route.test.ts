import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), find: vi.fn(), update: vi.fn(), transaction: vi.fn(), reserved: vi.fn(), schedule: vi.fn(),
}));
vi.mock("@/server/auth/require", () => ({ requireUser: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { order: { findUnique: mocks.find }, $transaction: mocks.transaction } }));
vi.mock("@/server/orders/reserve", () => ({ getReservedQtyByItemId: mocks.reserved }));
vi.mock("@/server/orders/estimate-artifacts", () => ({ makeEstimateArtifactsForOrder: vi.fn() }));
vi.mock("@/server/notifications/schedule-after-response", () => ({ scheduleAfterResponse: mocks.schedule }));
import { POST, PATCH } from "@/app/api/orders/[id]/dates/route";

const ctx = { params: Promise.resolve({ id: "order" }) };
const past = { readyByDate: "2026-10-06", startDate: "2026-10-07", endDate: "2026-10-13", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING" };
const future = { ...past, readyByDate: "2026-10-12", startDate: "2026-10-13", endDate: "2026-10-15" };
const req = (method: string, body: unknown) => new Request("http://localhost/api/orders/order/dates", { method, body: JSON.stringify(body) });
const order = () => ({
  id: "order", source: "GREENWICH_INTERNAL", status: "SUBMITTED", greenwichUserId: "g", lines: [{
    id: "line", itemId: "item", requestedQty: 1, approvedQty: null, issuedQty: null,
    item: { id: "item", name: "Стул", photo1Key: null, total: 2, inRepair: 0, broken: 0, missing: 0 },
  }],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "admin", role: "WOWSTORG" } });
  mocks.find.mockResolvedValue(order()); mocks.update.mockResolvedValue({}); mocks.reserved.mockResolvedValue(new Map());
  mocks.transaction.mockImplementation((callback) => callback({ order: { findUnique: mocks.find, update: mocks.update } }));
});
afterEach(() => vi.useRealTimers());

describe("order date changes", () => {
  it.each([[POST, "POST"], [PATCH, "PATCH"]] as const)("allows historical dates only for the authenticated warehouse role (%s)", async (handler, method) => {
    expect((await handler(req(method, past), ctx)).status).toBe(200);
    expect(mocks.reserved).toHaveBeenCalledWith(expect.objectContaining({ excludeOrderId: "order", startDate: new Date("2026-10-07Z"), endDate: new Date("2026-10-13Z") }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
    if (method === "PATCH") expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ startDate: new Date("2026-10-07Z"), endDate: new Date("2026-10-13Z") }) }));
  });
  it.each([[POST, "POST"], [PATCH, "PATCH"]] as const)("does not accept role/allowPastDates spoofing by Grinvich (%s)", async (handler, method) => {
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "g", role: "GREENWICH" } });
    for (const date of [past, { ...future, readyByDate: past.readyByDate }]) {
      const response = await handler(req(method, { ...date, role: "WOWSTORG", allowPastDates: true }), ctx);
      expect(response.status).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([[POST, "POST"], [PATCH, "PATCH"]] as const)("keeps future dates and ownership rules for Grinvich (%s)", async (handler, method) => {
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "g", role: "GREENWICH" } });
    expect((await handler(req(method, future), ctx)).status).toBe(200);
    mocks.auth.mockResolvedValue({ ok: true, user: { id: "other", role: "GREENWICH" } });
    expect((await handler(req(method, future), ctx)).status).toBe(403);
  });
  it.each([[POST, "POST"], [PATCH, "PATCH"]] as const)("keeps chronology, terminal status and availability guards for admins (%s)", async (handler, method) => {
    for (const body of [{ ...past, readyByDate: "2026-10-08" }, { ...past, endDate: "2026-10-05" }]) {
      expect((await handler(req(method, body), ctx)).status).toBe(400);
    }
    for (const status of ["ISSUED", "RETURN_DECLARED", "CLOSED", "CANCELLED"]) {
      mocks.find.mockResolvedValue({ ...order(), status });
      expect((await handler(req(method, past), ctx)).status).toBe(403);
    }
    mocks.find.mockResolvedValue(order()); mocks.reserved.mockResolvedValue(new Map([["item", 2]]));
    const response = await handler(req(method, past), ctx);
    expect(response.status).toBe(method === "POST" ? 200 : 409);
    if (method === "POST") expect(await response.json()).toMatchObject({ available: false, conflicts: [{ itemId: "item", shortageQty: 1 }] });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
