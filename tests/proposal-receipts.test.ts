import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), read: vi.fn(), capture: vi.fn(), reverse: vi.fn(), log: vi.fn(),
  projectProposal: { findUnique: vi.fn(), updateMany: vi.fn() },
  proposalMutationReceipt: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  projectProposalItem: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/projects/proposal-read-model", () => ({ buildProposalReadModel: mocks.read }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.log }));
vi.mock("@/server/proposals/history", () => ({ captureProposalState: mocks.capture, reverseProposalDelta: mocks.reverse, proposalDelta: () => ({ version: 1 }) }));
import { applyProposalMutation } from "@/server/proposals/mutate";
const mutationId = "b41b6847-ac65-4e75-b658-4f743582f96d";
const args = { proposalId: "cp", actorUserId: "staff", operation: { action: "UPDATE_ITEM" as const, itemId: "item", qty: 2, expectedRevision: 4, mutationId } };
beforeEach(() => {
  vi.resetAllMocks(); mocks.transaction.mockImplementation(async callback => callback(mocks));
  mocks.projectProposal.findUnique.mockResolvedValue({ revision: 4, projectId: null });
  mocks.projectProposal.updateMany.mockResolvedValue({ count: 1 }); mocks.projectProposalItem.findFirst.mockResolvedValue({ id: "item" });
  mocks.capture.mockResolvedValue({}); mocks.read.mockResolvedValue({ id: "cp", revision: 5 });
});
describe("proposal command receipts", () => {
  it("records a command in the same transaction as the revision bump", async () => {
    await applyProposalMutation(args);
    expect(mocks.proposalMutationReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ mutationId, proposalId: "cp", actorUserId: "staff", resultRevision: 5, requestHash: expect.stringMatching(/^[a-f0-9]{64}$/) }) });
    expect(mocks.capture).toHaveBeenCalledTimes(2);
  });
  it("a committed retry returns the current model without running the operation twice", async () => {
    await applyProposalMutation(args);
    const receipt = mocks.proposalMutationReceipt.create.mock.calls[0][0].data;
    mocks.projectProposal.findUnique.mockResolvedValue({ revision: 8, projectId: null }); mocks.proposalMutationReceipt.findUnique.mockResolvedValue(receipt);
    mocks.projectProposalItem.update.mockClear(); await applyProposalMutation(args);
    expect(mocks.projectProposalItem.update).not.toHaveBeenCalled();
  });
  it("rejects reuse of a UUID for a different payload", async () => {
    mocks.proposalMutationReceipt.findUnique.mockResolvedValue({ requestHash: "wrong" });
    await expect(applyProposalMutation(args)).rejects.toThrow("MUTATION_ID_REUSED");
    expect(mocks.projectProposalItem.update).not.toHaveBeenCalled();
  });
  it("checks receipt ownership and refuses someone else's inverse", async () => {
    await expect(applyProposalMutation({ ...args, operation: { action: "RESTORE_CHANGE", expectedRevision: 4, mutationId, changeId: "5568dbaa-b068-46df-838b-cc3566b024cb" } })).rejects.toThrow("HISTORY_CONFLICT");
    expect(mocks.proposalMutationReceipt.findUnique).toHaveBeenLastCalledWith({ where: { proposalId_actorUserId_mutationId: { proposalId: "cp", actorUserId: "staff", mutationId: "5568dbaa-b068-46df-838b-cc3566b024cb" } } });
  });
  it("refuses a second inverse of the same command", async () => {
    mocks.proposalMutationReceipt.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ reversedByMutationId: "already" });
    await expect(applyProposalMutation({ ...args, operation: { action: "RESTORE_CHANGE", expectedRevision: 4, mutationId, changeId: "5568dbaa-b068-46df-838b-cc3566b024cb" } })).rejects.toThrow("HISTORY_CONFLICT");
    expect(mocks.reverse).not.toHaveBeenCalled();
  });
  it("records the inverse itself so redo is another compensating command", async () => {
    mocks.proposalMutationReceipt.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "receipt", delta: { version: 1 }, reversedByMutationId: null });
    await applyProposalMutation({ ...args, operation: { action: "RESTORE_CHANGE", expectedRevision: 4, mutationId, changeId: "5568dbaa-b068-46df-838b-cc3566b024cb" } });
    expect(mocks.reverse).toHaveBeenCalled(); expect(mocks.proposalMutationReceipt.update).toHaveBeenCalledWith({ where: { id: "receipt" }, data: { reversedByMutationId: mutationId } });
    expect(mocks.proposalMutationReceipt.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "RESTORE_CHANGE" }) });
  });
});
