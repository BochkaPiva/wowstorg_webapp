import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), item: { create: vi.fn(), findMany: vi.fn() }, lossRecord: { create: vi.fn() }, category: { findMany: vi.fn() }, collection: { findMany: vi.fn() } }));
vi.mock("@/server/db", () => ({ prisma: { ...mocks, $transaction: mocks.transaction } }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
import { GET, POST } from "@/app/api/inventory/positions/route";
const payload = { name: "Шатёр", type: "ASSET", pricePerDay: 5000, total: 4, inRepair: 1, broken: 1, missing: 1, categoryIds: ["category", "category"], collectionIds: ["collection", "collection"] };
function post(body: unknown) { return POST(new Request("https://test.invalid/api/inventory/positions", { method: "POST", body: JSON.stringify(body) })); }
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true }); mocks.transaction.mockImplementation(async callback => callback(mocks)); mocks.item.create.mockResolvedValue({ id: "new", updatedAt: new Date("2026-10-14T00:00:00Z") }); });
describe("complete position creation", () => {
  it("creates stock, category and collection membership and loss history in one transaction", async () => {
    const response = await post(payload); expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.item.create.mock.calls[0][0].data).toMatchObject({ total: 4, inRepair: 1, broken: 1, missing: 1, categories: { create: [{ categoryId: "category" }] }, collections: { create: [{ collectionId: "collection", position: 0 }] } });
    expect(mocks.lossRecord.create).toHaveBeenCalledWith({ data: { itemId: "new", qty: 1, status: "OPEN" } });
    expect(await response.json()).toEqual({ ok: true, id: "new", updatedAt: "2026-10-14T00:00:00.000Z" });
  });
  it.each([{ ...payload, total: 2 }, { ...payload, total: 2.5 }, { ...payload, pricePerDay: -1 }])("rejects invalid quantities/prices before a write", async body => { expect((await post(body)).status).toBe(400); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("uses actual collections for options without loading the item list", async () => {
    mocks.category.findMany.mockResolvedValue([{ id: "cat", name: "Декор" }]); mocks.collection.findMany.mockResolvedValue([{ id: "collection", name: "Свадьба" }]);
    const response = await GET(new Request("https://test.invalid/api/inventory/positions?options=true"));
    expect(await response.json()).toEqual({ categories: [{ id: "cat", name: "Декор" }], collections: [{ id: "collection", name: "Свадьба" }] }); expect(mocks.item.findMany).not.toHaveBeenCalled();
  });
  it("returns a recoverable conflict when selected membership no longer exists", async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("FK", { code: "P2003", clientVersion: "6" })); expect((await post(payload)).status).toBe(409);
  });
  it.each([GET, POST])("enforces warehouse role before any queries", async handler => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await handler(new Request("https://test.invalid/api/inventory/positions?options=true", { method: handler === POST ? "POST" : "GET" }))).status).toBe(403); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.category.findMany).not.toHaveBeenCalled();
  });
});
