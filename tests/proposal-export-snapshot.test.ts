import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), read: vi.fn(), storage: vi.fn(),
  projectProposalSnapshot: { findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn() }, projectProposal: { findUnique: vi.fn() }, contractorAsset: { findFirst: vi.fn() } }));
vi.mock("@/server/db", () => ({ prisma: { ...mocks, $transaction: mocks.transaction } }));
vi.mock("@/server/projects/proposal-read-model", () => ({ buildProposalReadModel: mocks.read }));
vi.mock("@/server/file-storage", () => ({ getCustomerLogo: mocks.storage }));
import { captureProposalExport } from "@/server/projects/proposal-export-snapshot";
const request = { proposalId: "p", expectedRevision: 4, variantId: "v", exportId: "11111111-1111-4111-8111-111111111111", userId: "staff" };
const model = { id: "p", revision: 4, title: "Демо", clientIntro: null, clientOutro: null, variants: [{ id: "v", title: "Основной", sections: [{ id: "s", title: "Программа", items: [{ id: "i", selectionRole: "PRIMARY", qty: 1, clientUnitPrice: null, priceTypeSnapshot: "ON_REQUEST", internalUnitCost: 12345, contractorNameSnapshot: "Демо", offerTitleSnapshot: "Программа", offerDescriptionSnapshot: null, unitLabel: null, clientNote: null, assetSnapshot: [{ url: "https://untrusted.invalid/photo.jpg" }] }] }] }] };
beforeEach(() => { vi.resetAllMocks(); mocks.transaction.mockImplementation(async fn => fn(mocks)); mocks.read.mockResolvedValue(structuredClone(model)); mocks.projectProposal.findUnique.mockResolvedValue({ revision: 4 }); mocks.projectProposalSnapshot.aggregate.mockResolvedValue({ _max: { versionNumber: 3 } }); mocks.projectProposalSnapshot.create.mockImplementation(async ({ data }) => data); });
describe("immutable export snapshots", () => {
  it("captures a client-only revision in Serializable without fetching arbitrary URLs", async () => {
    const captured = await captureProposalExport(request);
    expect(captured.versionNumber).toBe(4); expect(captured.reason).toBe("EXPORT");
    expect(JSON.stringify(captured.clientData)).not.toContain("12345"); expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
  });
  it("a lost response retries the same UUID without capturing photos or creating another version", async () => {
    const snapshot = await captureProposalExport(request); mocks.projectProposalSnapshot.findUnique.mockResolvedValue(snapshot); mocks.projectProposalSnapshot.create.mockClear(); mocks.read.mockClear();
    expect(await captureProposalExport(request)).toEqual(snapshot); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.projectProposalSnapshot.create).not.toHaveBeenCalled();
    await expect(captureProposalExport({ ...request, userId: "other" })).rejects.toThrow("EXPORT_ID_CONFLICT");
  });
  it("refuses stale revision both before and after preparation", async () => {
    await expect(captureProposalExport({ ...request, expectedRevision: 3 })).rejects.toThrow("REVISION_CONFLICT");
    mocks.projectProposal.findUnique.mockResolvedValue({ revision: 5 });
    await expect(captureProposalExport(request)).rejects.toThrow("REVISION_CONFLICT"); expect(mocks.projectProposalSnapshot.create).not.toHaveBeenCalled();
  });
});
