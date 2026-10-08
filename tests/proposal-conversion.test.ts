import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), log: vi.fn(), folders: vi.fn(),
  projectProposal: { findUnique: vi.fn(), updateMany: vi.fn() },
  standaloneProposal: { update: vi.fn() },
  customer: { findFirst: vi.fn() }, project: { create: vi.fn() },
  projectMember: { create: vi.fn() }, projectWidget: { createMany: vi.fn() },
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.log }));
vi.mock("@/server/projects/project-files", () => ({ ensureDefaultProjectFolders: mocks.folders }));
import { POST } from "@/app/api/proposals/[id]/convert/route";
const ctx = { params: Promise.resolve({ id: "cp" }) };
const request = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "staff" } });
  mocks.transaction.mockImplementation(async callback => callback(mocks));
  mocks.projectProposal.findUnique.mockResolvedValue({ id: "cp", title: "Party", revision: 3, projectId: null, standaloneProposal: { id: "temp", title: "Party", ownerUserId: "owner", convertedAt: null, convertedProjectId: null } });
  mocks.customer.findFirst.mockResolvedValue({ id: "customer" });
  mocks.project.create.mockResolvedValue({ id: "project", title: "Party", customer: { id: "customer" } });
  mocks.projectProposal.updateMany.mockResolvedValue({ count: 1 });
});
describe("convert temporary proposal without copying services", () => {
  it("requires the revision the user reviewed", async () => {
    expect((await POST(request({ customerId: "customer" }), ctx)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect((await POST(request({ expectedRevision: 2, customerId: "customer" }), ctx)).status).toBe(409);
    expect(mocks.project.create).not.toHaveBeenCalled();
  });
  it("moves the owner in a single CAS, preserving the proposal ID", async () => {
    expect((await POST(request({ expectedRevision: 3, customerId: "customer" }), ctx)).status).toBe(200);
    expect(mocks.projectProposal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cp", revision: 3, projectId: null, standaloneProposalId: "temp" }, data: expect.objectContaining({ projectId: "project", standaloneProposalId: null }) }));
    expect(mocks.standaloneProposal.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "temp" }, data: expect.objectContaining({ convertedProjectId: "project" }) }));
  });
  it("does not create a second project from a moved proposal", async () => {
    mocks.projectProposal.findUnique.mockResolvedValue({ id: "cp", revision: 3, projectId: "existing" });
    expect((await POST(request({ expectedRevision: 3, customerId: "customer" }), ctx)).status).toBe(409);
    expect(mocks.project.create).not.toHaveBeenCalled();
  });
});
