import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), log: vi.fn(), readModel: vi.fn(),
  projectProposal: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  standaloneProposal: { update: vi.fn() },
  project: { findUnique: vi.fn() }, customer: { findFirst: vi.fn() },
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.log }));
vi.mock("@/server/projects/proposal-read-model", () => ({ buildProposalReadModel: mocks.readModel }));
import { POST as attach } from "@/app/api/proposals/[id]/attach/route";
import { PATCH as patch } from "@/app/api/proposals/[id]/route";

const ctx = { params: Promise.resolve({ id: "cp" }) };
const req = (data: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(data) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "staff" } });
  mocks.transaction.mockImplementation(async callback => callback(mocks));
  mocks.projectProposal.findUnique.mockResolvedValue({ id: "cp", revision: 3, projectId: null, standaloneProposal: { id: "temp", convertedAt: null, convertedProjectId: null } });
  mocks.project.findUnique.mockResolvedValue({ id: "project", title: "Party", customerId: "customer", archivedAt: null });
  mocks.projectProposal.findFirst.mockResolvedValue(null);
  mocks.projectProposal.updateMany.mockResolvedValue({ count: 1 });
  mocks.readModel.mockResolvedValue({ id: "cp", revision: 4 });
});

describe("proposal ownership and metadata boundaries", () => {
  it("does not enter a transaction without staff authorization", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await attach(req({ expectedRevision: 3, projectId: "project" }), ctx)).status).toBe(403);
    expect((await patch(req({ expectedRevision: 3, title: "Updated" }), ctx)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("never replaces a target project's active proposal", async () => {
    mocks.projectProposal.findFirst.mockResolvedValue({ id: "existing" });
    expect((await attach(req({ expectedRevision: 3, projectId: "project" }), ctx)).status).toBe(409);
    expect(mocks.projectProposal.updateMany).not.toHaveBeenCalled();
  });
  it("rejects an archived target", async () => {
    mocks.project.findUnique.mockResolvedValue({ id: "project", archivedAt: new Date() });
    expect((await attach(req({ expectedRevision: 3, projectId: "project" }), ctx)).status).toBe(409);
    expect(mocks.projectProposal.updateMany).not.toHaveBeenCalled();
  });
  it("moves the same proposal ID and records provenance", async () => {
    expect((await attach(req({ expectedRevision: 3, projectId: "project" }), ctx)).status).toBe(200);
    expect(mocks.projectProposal.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cp", revision: 3, projectId: null, standaloneProposalId: "temp" },
      data: expect.objectContaining({ projectId: "project", standaloneProposalId: null }),
    }));
    expect(mocks.standaloneProposal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ convertedProjectId: "project", customerId: "customer" }) }));
    expect(mocks.log).toHaveBeenCalledOnce();
  });
  it("rejects stale metadata before writing", async () => {
    expect((await patch(req({ expectedRevision: 2, title: "Updated" }), ctx)).status).toBe(409);
    expect(mocks.projectProposal.updateMany).not.toHaveBeenCalled();
  });
  it("logs project metadata and keeps its customer in the project", async () => {
    mocks.projectProposal.findUnique.mockResolvedValue({ id: "cp", revision: 3, projectId: "project", project: { archivedAt: null }, standaloneProposal: null });
    expect((await patch(req({ expectedRevision: 3, customerId: "other" }), ctx)).status).toBe(400);
    expect(mocks.projectProposal.updateMany).not.toHaveBeenCalled();
    expect((await patch(req({ expectedRevision: 3, title: "Updated" }), ctx)).status).toBe(200);
    expect(mocks.log).toHaveBeenCalledWith(mocks, expect.objectContaining({ projectId: "project", payload: { proposalId: "cp", action: "UPDATE_METADATA" } }));
  });
  it("synchronizes standalone title without writing a project log", async () => {
    expect((await patch(req({ expectedRevision: 3, title: "Updated" }), ctx)).status).toBe(200);
    expect(mocks.standaloneProposal.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "temp" }, data: expect.objectContaining({ title: "Updated" }) }));
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
