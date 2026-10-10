import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), update: vi.fn(), log: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.log }));
import { PATCH } from "@/app/api/projects/[id]/event-dates/route";
const ctx = { params: Promise.resolve({ id: "p" }) };
const valid = { eventStartDate: "2026-09-12", eventEndDate: "2026-09-13", expectedStartDate: null, expectedEndDate: null };
const request = (body: unknown) => new Request("http://local", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "a" } });
  mocks.find.mockResolvedValue({ status: "COMPLETED", eventStartDate: null, eventEndDate: null, eventDateConfirmed: false });
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(callback => callback({ project: { findUnique: mocks.find, updateMany: mocks.update } }));
});
it("authenticates before parsing or database access", async () => {
  mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  expect((await PATCH(request(valid), ctx)).status).toBe(403);
  expect(mocks.auth).toHaveBeenCalledWith("WOWSTORG"); expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects impossible dates, reversed range, missing CAS values and unrelated fields", async () => {
  for (const body of [{ ...valid, eventStartDate: "2026-02-30" }, { ...valid, eventEndDate: "2026-09-01" }, { eventStartDate: "2026-09-01", eventEndDate: "2026-09-01" }, { ...valid, title: "change" }, { ...valid, archive: false }, { ...valid, status: "IN_PROGRESS" }]) {
    expect((await PATCH(request(body), ctx)).status).toBe(400);
  }
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("changes only dates of completed work and records the actor and previous values", async () => {
  expect((await PATCH(request(valid), ctx)).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: "p", status: "COMPLETED", eventStartDate: null, eventEndDate: null }, data: { eventStartDate: new Date("2026-09-12Z"), eventEndDate: new Date("2026-09-13Z"), eventDateConfirmed: true } });
  expect(mocks.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ projectId: "p", actorUserId: "a", kind: "PROJECT_UPDATED", payload: expect.objectContaining({ source: "ANALYTICS_DATE_CORRECTION" }) }));
});
it("does not mutate active/cancelled work or stale dates", async () => {
  for (const status of ["IN_PROGRESS", "CANCELLED"]) {
    mocks.find.mockResolvedValue({ status, eventStartDate: null, eventEndDate: null });
    expect((await PATCH(request(valid), ctx)).status).toBe(409);
  }
  mocks.find.mockResolvedValue({ status: "COMPLETED", eventStartDate: new Date("2026-09-01Z"), eventEndDate: null });
  expect((await PATCH(request(valid), ctx)).status).toBe(409);
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.log).not.toHaveBeenCalled();
});
it("protects against a concurrent update and skips a repeated identical correction", async () => {
  mocks.update.mockResolvedValue({ count: 0 });
  expect((await PATCH(request(valid), ctx)).status).toBe(409); expect(mocks.log).not.toHaveBeenCalled();
  mocks.update.mockClear();
  mocks.find.mockResolvedValue({ status: "COMPLETED", eventStartDate: new Date("2026-09-12Z"), eventEndDate: new Date("2026-09-13Z"), eventDateConfirmed: true });
  expect((await PATCH(request({ ...valid, expectedStartDate: valid.eventStartDate, expectedEndDate: valid.eventEndDate }), ctx)).status).toBe(200);
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.log).not.toHaveBeenCalled();
});
it("returns 404 for missing projects", async () => {
  mocks.find.mockResolvedValue(null);
  expect((await PATCH(request(valid), ctx)).status).toBe(404); expect(mocks.update).not.toHaveBeenCalled();
});
