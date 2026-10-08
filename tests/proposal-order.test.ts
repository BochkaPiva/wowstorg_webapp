import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposalOrder } from "@/lib/proposal-order";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), readModel: vi.fn(), log: vi.fn(),
  projectProposal: { findUnique: vi.fn(), updateMany: vi.fn() },
  projectProposalSection: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  projectProposalItem: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/projects/proposal-read-model", () => ({ buildProposalReadModel: mocks.readModel }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.log }));
import { applyProposalMutation, proposalMutationSchema } from "@/server/proposals/mutate";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async callback => callback(mocks));
  mocks.projectProposal.findUnique.mockResolvedValue({ revision: 4, projectId: null });
  mocks.projectProposal.updateMany.mockResolvedValue({ count: 1 });
  mocks.projectProposalSection.findFirst.mockResolvedValue({ id: "s2", variantId: "v" });
  mocks.projectProposalItem.findFirst.mockResolvedValue({ id: "b", sectionId: "s1", section: { variantId: "v" } });
});

describe("proposal order", () => {
  it("moves before a sibling or appends without losing IDs", () => {
    expect(proposalOrder(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(proposalOrder(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
    expect(proposalOrder(["a", "b"], "a", "b")).toEqual(["a", "b"]);
  });
  it.each([["foreign", null], ["a", "foreign"], ["a", "a"]])("rejects invalid IDs %s %s", (id, before) => {
    expect(() => proposalOrder(["a", "b"], id!, before)).toThrow("INVALID_TARGET");
  });
  it("validates strict movement contracts", () => {
    expect(proposalMutationSchema.safeParse({ action: "MOVE_ITEM", expectedRevision: 4, itemId: "b", sectionId: "s2", beforeId: null }).success).toBe(true);
    expect(proposalMutationSchema.safeParse({ action: "MOVE_SECTION", expectedRevision: 4, sectionId: "s2" }).success).toBe(false);
    expect(proposalMutationSchema.safeParse({ action: "MOVE_ITEM", expectedRevision: 4, itemId: "b", sectionId: "s2", beforeId: null, clientUnitPrice: 1 }).success).toBe(false);
  });
  it("reorders sections within their own variant", async () => {
    mocks.projectProposalSection.findMany.mockResolvedValue([{ id: "s1", sortOrder: 0 }, { id: "s2", sortOrder: 1 }]);
    await applyProposalMutation({ proposalId: "cp", actorUserId: "staff", operation: { action: "MOVE_SECTION", expectedRevision: 4, sectionId: "s2", beforeId: "s1" } });
    expect(mocks.projectProposalSection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { variantId: "v" } }));
    expect(mocks.projectProposalSection.update.mock.calls).toEqual([[{ where: { id: "s2" }, data: { sortOrder: 0 } }], [{ where: { id: "s1" }, data: { sortOrder: 1 } }]]);
  });
  it("moves an item without recreating it or writing its snapshots", async () => {
    mocks.projectProposalItem.findMany.mockResolvedValue([{ id: "a", sectionId: "s1", sortOrder: 0 }, { id: "b", sectionId: "s1", sortOrder: 1 }, { id: "c", sectionId: "s1", sortOrder: 2 }, { id: "d", sectionId: "s2", sortOrder: 0 }]);
    await applyProposalMutation({ proposalId: "cp", actorUserId: "staff", operation: { action: "MOVE_ITEM", expectedRevision: 4, itemId: "b", sectionId: "s2", beforeId: "d" } });
    expect(mocks.projectProposalItem.update.mock.calls).toEqual([[{ where: { id: "c" }, data: { sortOrder: 1 } }], [{ where: { id: "b" }, data: { sortOrder: 0, sectionId: "s2" } }], [{ where: { id: "d" }, data: { sortOrder: 1, sectionId: "s2" } }]]);
    expect(mocks.projectProposalItem.delete).not.toHaveBeenCalled();
    expect(mocks.projectProposalItem.create).not.toHaveBeenCalled();
  });
  it("rejects a foreign destination variant before writing", async () => {
    mocks.projectProposalSection.findFirst.mockResolvedValue({ id: "s2", variantId: "foreign" });
    await expect(applyProposalMutation({ proposalId: "cp", actorUserId: "staff", operation: { action: "MOVE_ITEM", expectedRevision: 4, itemId: "b", sectionId: "s2", beforeId: null } })).rejects.toThrow("INVALID_TARGET");
    expect(mocks.projectProposalItem.update).not.toHaveBeenCalled();
  });
  it("rejects a foreign insertion anchor before any item writes", async () => {
    mocks.projectProposalItem.findMany.mockResolvedValue([{ id: "b", sectionId: "s1", sortOrder: 0 }]);
    await expect(applyProposalMutation({ proposalId: "cp", actorUserId: "staff", operation: { action: "MOVE_ITEM", expectedRevision: 4, itemId: "b", sectionId: "s2", beforeId: "foreign" } })).rejects.toThrow("INVALID_TARGET");
    expect(mocks.projectProposalItem.update).not.toHaveBeenCalled();
  });
});
