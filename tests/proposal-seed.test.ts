import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), readModel: vi.fn(),
  customer: { findFirst: vi.fn() }, contractorOffer: { findFirst: vi.fn() },
  standaloneProposal: { create: vi.fn() }, projectProposal: { create: vi.fn() },
  projectProposalSection: { create: vi.fn() }, projectProposalItem: { create: vi.fn() },
}));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/projects/proposal-read-model", () => ({ buildProposalReadModel: mocks.readModel }));
import { POST } from "@/app/api/proposals/route";
const req = (body: unknown) => new Request("http://localhost/api/proposals", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "staff" } });
  mocks.transaction.mockImplementation(async (callback) => callback(mocks));
  mocks.standaloneProposal.create.mockResolvedValue({ id: "standalone" });
  mocks.projectProposal.create.mockResolvedValue({ id: "cp", variants: [{ id: "variant" }] });
  mocks.projectProposalSection.create.mockResolvedValue({ id: "section" });
  mocks.readModel.mockResolvedValue({ id: "cp" });
});
describe("catalog service starts a standalone proposal", () => {
  it("snapshots the authoritative offer, price, category and photos in one transaction", async () => {
    mocks.contractorOffer.findFirst.mockResolvedValue({ id: "offer", revision: 8, title: "Host", description: "Program", priceType: "FIXED", clientPrice: new Prisma.Decimal(15000), internalCost: new Prisma.Decimal(10000), currencyCode: "RUB", unitLabel: "hour", priceConfirmedAt: new Date(), category: { id: "cat", name: "Hosts" }, contractor: { id: "contractor", name: "Name", assets: [{ id: "asset", caption: "Portrait", focalX: null, focalY: null }] } });
    expect((await POST(req({ title: "Event", seedOfferId: "offer" }))).status).toBe(200);
    expect(mocks.contractorOffer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "offer", isActive: true, contractor: { isActive: true } } }));
    expect(mocks.projectProposalItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientUnitPrice: new Prisma.Decimal(15000), sourceOfferRevision: 8, selectionRole: "PRIMARY", assetSnapshot: [expect.objectContaining({ url: "/api/contractors/contractor/assets/asset" })] }) }));
    expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
  });
  it("refuses unavailable services before creating any proposal", async () => {
    mocks.contractorOffer.findFirst.mockResolvedValue(null);
    expect((await POST(req({ title: "Event", seedOfferId: "hidden" }))).status).toBe(400);
    expect(mocks.standaloneProposal.create).not.toHaveBeenCalled();
  });
  it("never trusts client-provided prices or contractor identities", async () => {
    expect((await POST(req({ title: "Event", seedOfferId: "offer", clientPrice: 1, contractorId: "forged" }))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
