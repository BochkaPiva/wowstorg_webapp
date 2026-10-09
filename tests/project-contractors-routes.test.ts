import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), add: vi.fn(), update: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/projects/project-contractors", () => ({ readProjectContractors: mocks.read, addProjectContractors: mocks.add, updateProjectContractor: mocks.update, rosterErrorResponse: () => new Response(null, { status: 500 }) }));
import { GET, POST } from "@/app/api/projects/[id]/contractors/route";
import { PATCH } from "@/app/api/projects/[id]/contractors/[assignmentId]/route";
const ctx = { params: Promise.resolve({ id: "p", assignmentId: "r" }) };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "a" } }); });
it("authenticates every method before reading data or parsing a body", async () => {
  mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
  expect((await GET(new Request("http://local"), ctx)).status).toBe(403);
  expect((await POST(new Request("http://local", { method: "POST", body: "not json" }), ctx)).status).toBe(403);
  expect((await PATCH(new Request("http://local", { method: "PATCH", body: "not json" }), ctx)).status).toBe(403);
  expect(mocks.auth).toHaveBeenCalledWith("WOWSTORG");
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects invalid JSON, unknown fields and missing revision before writes", async () => {
  expect((await POST(new Request("http://local", { method: "POST", body: "invalid" }), ctx)).status).toBe(400);
  expect((await POST(new Request("http://local", { method: "POST", body: JSON.stringify({ action: "IMPORT_PROPOSAL", variantId: "v", expectedProposalRevision: 0, clientPrice: 1 }) }), ctx)).status).toBe(400);
  expect((await PATCH(new Request("http://local", { method: "PATCH", body: "{}" }), ctx)).status).toBe(400);
  expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("scopes a valid import to route project and session actor", async () => {
  mocks.add.mockResolvedValue({ added: 1, skipped: 0 });
  const input = { action: "IMPORT_PROPOSAL", variantId: "v", expectedProposalRevision: 4 };
  expect((await POST(new Request("http://local", { method: "POST", body: JSON.stringify(input) }), ctx)).status).toBe(200);
  expect(mocks.add).toHaveBeenCalledWith("p", "a", input);
});
