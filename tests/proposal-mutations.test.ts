import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), readModel: vi.fn(), log: vi.fn(),
  projectProposal: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  projectProposalItem: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/projects/proposal-read-model", () => ({ buildProposalReadModel: mocks.readModel }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.log }));
import { applyProposalMutation, proposalMutationSchema } from "@/server/proposals/mutate";

const args = { proposalId: "cp", actorUserId: "staff", operation: { action: "UPDATE_ITEM" as const, expectedRevision: 4, itemId: "item", qty: 2 } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async callback => callback(mocks));
  mocks.projectProposal.findUnique.mockResolvedValue({ projectId: null, standaloneProposalId: "temp", revision: 4, standaloneProposal: { convertedAt: null } });
  mocks.projectProposalItem.findFirst.mockResolvedValue({ id: "item" });
  mocks.projectProposal.updateMany.mockResolvedValue({ count: 1 });
  mocks.readModel.mockResolvedValue({ id: "cp", revision: 5 });
});
describe("standalone and project proposal mutations", () => {
  it("rejects a stale revision before touching a service", async () => {
    mocks.projectProposal.findUnique.mockResolvedValue({ revision: 5 });
    await expect(applyProposalMutation(args)).rejects.toThrow("REVISION_CONFLICT");
    expect(mocks.projectProposalItem.update).not.toHaveBeenCalled();
  });
  it("rejects archived projects before any mutation", async () => {
    mocks.projectProposal.findUnique.mockResolvedValue({ projectId: "project", revision: 4, project: { archivedAt: new Date() } });
    await expect(applyProposalMutation(args)).rejects.toThrow("READ_ONLY");
    expect(mocks.projectProposalItem.update).not.toHaveBeenCalled();
  });
  it("rejects foreign project and foreign item IDs", async () => {
    await expect(applyProposalMutation({ ...args, expectedProjectId: "other" })).rejects.toThrow("NOT_FOUND");
    mocks.projectProposalItem.findFirst.mockResolvedValue(null);
    await expect(applyProposalMutation(args)).rejects.toThrow("INVALID_TARGET");
  });
  it("uses Serializable and revision CAS for standalone proposals without a project log", async () => {
    expect(await applyProposalMutation(args)).toEqual({ id: "cp", revision: 5 });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    expect(mocks.projectProposal.updateMany).toHaveBeenCalledWith({ where: { id: "cp", revision: 4 }, data: { revision: { increment: 1 }, updatedById: "staff" } });
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it("rejects a lost CAS rather than returning a successful read model", async () => {
    mocks.projectProposal.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyProposalMutation(args)).rejects.toThrow("REVISION_CONFLICT");
    expect(mocks.readModel).not.toHaveBeenCalled();
  });
  it.each([0, -1, 100001, Infinity])("rejects invalid quantity %s", qty => {
    expect(proposalMutationSchema.safeParse({ ...args.operation, qty }).success).toBe(false);
  });
});
