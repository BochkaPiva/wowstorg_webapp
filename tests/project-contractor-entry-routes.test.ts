import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), add: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/projects/project-contractors", () => ({ readContractorEntries: mocks.read, addContractorEntry: mocks.add, rosterErrorResponse: () => new Response(null, { status: 500 }) }));
import { GET, POST } from "@/app/api/projects/[id]/contractors/[assignmentId]/entries/route";
const ctx = { params: Promise.resolve({ id: "p", assignmentId: "r" }) };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "a" } }); });
it("rejects non-admin reads and writes before parsing or accessing notes", async () => {
  mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  expect((await GET(new Request("http://local"), ctx)).status).toBe(403);
  expect((await POST(new Request("http://local", { method: "POST", body: "invalid" }), ctx)).status).toBe(403);
  expect(mocks.auth).toHaveBeenCalledWith("WOWSTORG"); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
});
it("validates input and binds writes to the current session and project", async () => {
  expect((await POST(new Request("http://local", { method: "POST", body: "{}" }), ctx)).status).toBe(400);
  const input = { id: "9d2d6fb9-3870-4206-af9c-83c8183c68a4", expectedRevision: 0, body: "Обсудили площадку", status: "DISCUSSING" };
  mocks.add.mockResolvedValue({ ok: true });
  expect((await POST(new Request("http://local", { method: "POST", body: JSON.stringify(input) }), ctx)).status).toBe(200);
  expect(mocks.add).toHaveBeenCalledWith("p", "r", "a", input);
  mocks.read.mockResolvedValue({ entries: [], nextCursor: null });
  const response = await GET(new Request("http://local?cursor=page"), ctx);
  expect(mocks.read).toHaveBeenCalledWith("p", "r", "page"); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
