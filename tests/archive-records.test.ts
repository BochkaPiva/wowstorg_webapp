import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/archive-records/[kind]/[id]/route";
import { POST as batch } from "@/app/api/archive-records/route";
import { GET as download, DELETE as remove } from "@/app/api/archive-records/[kind]/[id]/files/[fileId]/route";
const mock = vi.hoisted(() => ({ auth: vi.fn(), exists: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), findFile: vi.fn(), create: vi.fn(), delete: vi.fn(), put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mock.auth }));
vi.mock("@/server/archive/records", () => ({ parseArchiveKind: (kind: string) => ["order", "project"].includes(kind) ? kind : null, archiveTargetExists: mock.exists, archiveWhere: (kind: string, id: string) => kind === "project" ? { projectId: id } : { orderId: id } }));
vi.mock("@/server/db", () => ({ prisma: { archiveRegisterMark: { findUnique: mock.findUnique, findMany: mock.findMany, upsert: mock.upsert }, archiveDocument: { findMany: mock.findMany, findFirst: mock.findFile, create: mock.create, delete: mock.delete } } }));
vi.mock("@/server/file-storage", () => ({ putProjectFile: mock.put, getProjectFile: mock.get, deleteProjectFile: mock.del }));
const ctx = { params: Promise.resolve({ kind: "project", id: "project-1", fileId: "file-1" }) };
const req = (method: string, body?: unknown) => new Request("https://example.test", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(() => { vi.resetAllMocks(); mock.auth.mockResolvedValue({ ok: true, user: { id: "admin" } }); mock.exists.mockResolvedValue(true); mock.findMany.mockResolvedValue([]); mock.findUnique.mockResolvedValue(null); mock.upsert.mockResolvedValue({recorded:true}); mock.del.mockResolvedValue(undefined); });
describe("archive documents", () => {
  it("denies every operation before reading or writing data when role is forbidden", async () => {
    mock.auth.mockResolvedValue({ ok: false, response: new Response(null, {status:403}) });
    expect((await GET(req("GET"), ctx)).status).toBe(403);
    expect((await PATCH(req("PATCH", {recorded:true}), ctx)).status).toBe(403);
    expect((await POST(req("POST"), ctx)).status).toBe(403);
    expect((await batch(req("POST", {records:[]}))).status).toBe(403);
    expect((await download(req("GET"), ctx)).status).toBe(403);
    expect((await remove(req("DELETE"), ctx)).status).toBe(403);
    expect(mock.exists).not.toHaveBeenCalled(); expect(mock.upsert).not.toHaveBeenCalled();
  });
  it("rejects invalid marks and records which are not archived", async () => {
    expect((await PATCH(req("PATCH", {recorded:"yes"}), ctx)).status).toBe(400);
    mock.exists.mockResolvedValue(false);
    expect((await PATCH(req("PATCH", {recorded:true}), ctx)).status).toBe(404);
    expect(mock.upsert).not.toHaveBeenCalled();
  });
  it("persists a mark against the specified project and actor", async () => {
    expect((await PATCH(req("PATCH", {recorded:true}), ctx)).status).toBe(200);
    expect(mock.upsert).toHaveBeenCalledWith(expect.objectContaining({create: expect.objectContaining({ projectId:"project-1", recorded:true, updatedById:"admin" })}));
  });
  it("refuses unsupported files before uploading", async () => {
    const form = new FormData(); form.append("file", new File(["x"], "file.exe", {type:"application/x-msdownload"}));
    expect((await POST(new Request("https://example.test", {method:"POST", body:form}), ctx)).status).toBe(400);
    expect(mock.put).not.toHaveBeenCalled();
  });
  it("saves valid files and cleans up storage if the database write fails", async () => {
    const makeRequest = () => { const form = new FormData(); form.append("file", new File(["%PDF-test"], "акт.pdf", {type:"application/pdf"})); return new Request("https://example.test", {method:"POST", body:form}); };
    mock.create.mockResolvedValueOnce({ id:"file", originalName:"акт.pdf", sizeBytes:9, createdAt:new Date() });
    expect((await POST(makeRequest(), ctx)).status).toBe(200);
    expect(mock.put).toHaveBeenCalledOnce();
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({projectId:"project-1", uploadedById:"admin"})}));
    mock.create.mockRejectedValueOnce(new Error("database unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(makeRequest(), ctx)).status).toBe(500);
    expect(mock.del).toHaveBeenCalledOnce(); consoleError.mockRestore();
  });
  it("rejects file access when the document belongs to a different record", async () => {
    mock.findFile.mockResolvedValue(null);
    expect((await download(req("GET"), ctx)).status).toBe(404);
    expect(mock.findFile).toHaveBeenCalledWith({where: {id:"file-1", projectId:"project-1"}});
    expect(mock.get).not.toHaveBeenCalled();
  });
});
