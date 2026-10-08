import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogQuery } from "@/server/contractors/catalog-query";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { contractor: { findMany: mocks.findMany, findUnique: mocks.findUnique } } }));
import { GET as list } from "@/app/api/contractors/route";
import { GET as detail } from "@/app/api/contractors/[contractorId]/route";

beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "staff" } }); mocks.findMany.mockResolvedValue([]); });
describe("contractor keyset catalog", () => {
  it("validates bounded page size before querying", async () => {
    expect((await list(new Request("http://localhost/api/contractors?paged=1&limit=999"))).status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(() => catalogQuery(new URLSearchParams("cursor=bad"))).toThrow();
  });
  it("includes every ordering key and retains filters on subsequent pages", () => {
    const first = catalogQuery(new URLSearchParams("paged=1&categoryId=cat&search=show"));
    const cursor = first.encodeCursor({ id: "c2", name: "Show", isActive: true });
    const next = catalogQuery(new URLSearchParams({ paged: "1", categoryId: "cat", search: "show", cursor }));
    expect(next.orderBy).toEqual([{ isActive: "desc" }, { name: "asc" }, { id: "asc" }]);
    expect(next.where.AND).toContainEqual({ OR: [{ isActive: false }, { isActive: true, name: { gt: "Show" } }, { isActive: true, name: "Show", id: { gt: "c2" } }] });
    expect(() => catalogQuery(new URLSearchParams({ paged: "1", cursor, search: "different" }))).toThrow();
  });
  it("uses take+1 and never returns the sentinel row", async () => {
    mocks.findMany.mockResolvedValue(["a", "b", "c"].map((id) => ({ id, name: "Same", isActive: true, assets: [], offers: [] })));
    const response = await list(new Request("http://localhost/api/contractors?paged=1&limit=2"));
    const body = await response.json();
    expect(body.contractors.map((row: { id: string }) => row.id)).toEqual(["a", "b"]);
    expect(body.nextCursor).toBeTypeOf("string");
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.take).toBe(3); expect(query.select.contacts).toBe(false); expect(query.select.internalNotes).toBe(false); expect(query.select.offers.select.internalCost).toBe(false);
  });
  it("preserves nonpaged legacy contract and filters visible services by category only in paged mode", async () => {
    const legacy = await (await list(new Request("http://localhost/api/contractors"))).json();
    expect(legacy).not.toHaveProperty("nextCursor"); expect(mocks.findMany.mock.calls[0][0].take).toBe(500);
    await list(new Request("http://localhost/api/contractors?paged=1&categoryId=cat"));
    expect(mocks.findMany.mock.calls[1][0].select.offers.where).toEqual({ isActive: true, categoryId: "cat" });
  });
  it("authenticates both list and detail; unknown contractor is 404", async () => {
    const ctx = { params: Promise.resolve({ contractorId: "missing" }) };
    mocks.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await list(new Request("http://localhost/api/contractors"))).status).toBe(403);
    mocks.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await detail(new Request("http://localhost/api/contractors/missing"), ctx)).status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    mocks.findUnique.mockResolvedValue(null);
    expect((await detail(new Request("http://localhost/api/contractors/missing"), ctx)).status).toBe(404);
  });
  it("detail returns authorized photo URLs, never storage keys", async () => {
    mocks.findUnique.mockResolvedValue({ id: "c", name: "Name", contacts: [], offers: [], assets: [{ id: "photo", caption: "Portrait", storageKey: "PRIVATE_KEY" }] });
    const body = await (await detail(new Request("http://localhost/api/contractors/c"), { params: Promise.resolve({ contractorId: "c" }) })).json();
    expect(body.contractor.photos[0].url).toBe("/api/contractors/c/assets/photo");
    expect(JSON.stringify(body)).not.toContain("PRIVATE_KEY");
  });
});
