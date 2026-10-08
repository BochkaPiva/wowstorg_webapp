import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), snapshot: vi.fn(), capture: vi.fn(), pdf: vi.fn(), pptx: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { projectProposalSnapshot: { findFirst: mocks.snapshot } } }));
vi.mock("@/server/projects/proposal-export-snapshot", () => ({ captureProposalExport: mocks.capture }));
vi.mock("@/server/projects/proposal-export-render", () => ({ renderProposalPdf: mocks.pdf, renderProposalPptx: mocks.pptx }));
import { POST } from "@/app/api/proposals/[id]/exports/route";
import { GET } from "@/app/api/proposals/[id]/exports/[snapshotId]/route";
import { EXPORT_ADAPTER, exportChecksum, type ExportDocument } from "@/server/projects/proposal-export-document";
const context = { params: Promise.resolve({ id: "p", snapshotId: "s" }) };
const doc: ExportDocument = { adapter: EXPORT_ADAPTER, proposalId: "p", revision: 4, variantId: "v", title: "КП\nТест", variantTitle: "Основной", intro: null, outro: null, budget: "0 ₽", budgetDetail: "", sections: [] };
const command = { expectedRevision: 4, variantId: "v", exportId: "11111111-1111-4111-8111-111111111111" };
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "staff" } });
  mocks.snapshot.mockResolvedValue({ clientData: doc, checksum: exportChecksum(doc), versionNumber: 1 });
  mocks.capture.mockResolvedValue({ id: "s", versionNumber: 1 }); mocks.pdf.mockResolvedValue(Buffer.from("%PDF")); mocks.pptx.mockResolvedValue(Buffer.from("PK"));
});
describe("authenticated proposal downloads", () => {
  it("rejects unauthenticated capture and download before reading data", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await POST(new Request("http://localhost/exports", { method: "POST" }), context)).status).toBe(401);
    expect((await GET(new Request("http://localhost/exports/s?format=pdf"), context)).status).toBe(401);
    expect(mocks.capture).not.toHaveBeenCalled(); expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it("validates capture input and format", async () => {
    expect((await POST(new Request("http://localhost/exports", { method: "POST", body: JSON.stringify({ ...command, internalPrice: 42 }) }), context)).status).toBe(400);
    expect((await GET(new Request("http://localhost/exports/s?format=html"), context)).status).toBe(400);
    expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.capture).not.toHaveBeenCalled();
  });
  it("captures the authenticated author with the supplied idempotency UUID", async () => {
    const response = await POST(new Request("http://localhost/exports", { method: "POST", body: JSON.stringify(command) }), context);
    expect(response.status).toBe(200); expect(mocks.capture).toHaveBeenCalledWith({ ...command, proposalId: "p", userId: "staff" });
  });
  it("refuses corrupt and unsupported snapshots before rendering", async () => {
    mocks.snapshot.mockResolvedValue({ clientData: doc, checksum: "wrong", versionNumber: 1 });
    expect((await GET(new Request("http://localhost/exports/s?format=pdf"), context)).status).toBe(409);
    mocks.snapshot.mockResolvedValue({ clientData: { ...doc, adapter: "unknown" }, checksum: "wrong", versionNumber: 1 });
    expect((await GET(new Request("http://localhost/exports/s?format=pdf"), context)).status).toBe(409); expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it.each(["pdf", "pptx"])("returns a private %s attachment scoped to its proposal", async format => {
    const response = await GET(new Request(`http://localhost/exports/s?format=${format}`), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain(`proposal-v1.${format}`);
    expect(response.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(mocks.snapshot).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s", proposalId: "p", reason: "EXPORT" } }));
    expect(format === "pdf" ? mocks.pdf : mocks.pptx).toHaveBeenCalledWith(doc);
  });
});
