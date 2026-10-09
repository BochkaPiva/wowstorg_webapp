import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), activity: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/server/projects/activity-log", () => ({ appendProjectActivityLog: mocks.activity }));

import { POST } from "@/app/api/projects/[id]/workspace/items/batch/route";
import { createProjectFreeBoardLinkedItem } from "@/lib/projects/project-free-board";

const types = ["CONTRACTOR", "CONTACT", "SCHEDULE_SLOT", "PROPOSAL"] as const;
const models = { CONTRACTOR: "projectContractor", CONTACT: "projectContact", SCHEDULE_SLOT: "projectScheduleSlot", PROPOSAL: "projectProposal" } as const;
const ctx = { params: Promise.resolve({ id: "project-a" }) };
function transactionFixture() {
  return {
    projectMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    project: { findUnique: vi.fn().mockResolvedValue({ archivedAt: null, widgets: [{ id: "board-a" }] }) },
    projectWorkspaceItem: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    projectContractor: { findMany: vi.fn().mockResolvedValue([]) },
    projectContact: { findMany: vi.fn().mockResolvedValue([]) },
    projectScheduleSlot: { findMany: vi.fn().mockResolvedValue([]) },
    projectProposal: { findMany: vi.fn().mockResolvedValue([]) },
  };
}
function request(item: ReturnType<typeof createProjectFreeBoardLinkedItem>) {
  return new Request("http://local", { method: "POST", body: JSON.stringify({ mutationId: crypto.randomUUID(), operations: [{ op: "UPSERT", item }] }) });
}
function itemFor(type: typeof types[number]) {
  return createProjectFreeBoardLinkedItem(type, { id: "entity-1", label: "Участник", meta: "", href: "" }, { x: 0, y: 0 });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "actor" } });
});

describe("project board typed entity links", () => {
  it.each(types)("rejects a foreign/missing %s before writing and scopes the lookup", async (type) => {
    const tx = transactionFixture();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    const result = await POST(request(itemFor(type)), ctx);
    expect(result.status).toBe(400);
    expect(tx[models[type]].findMany).toHaveBeenCalledWith({ where: { id: { in: ["entity-1"] }, ...(type === "SCHEDULE_SLOT" ? { day: { projectId: "project-a" } } : { projectId: "project-a" }) }, select: { id: true } });
    expect(tx.projectWorkspaceItem.create).not.toHaveBeenCalled();
    expect(tx.projectMutationReceipt.create).not.toHaveBeenCalled();
  });
  it.each(types)("accepts an in-project %s as a reference, without copying source fields", async (type) => {
    const tx = transactionFixture();
    tx[models[type]].findMany.mockResolvedValue([{ id: "entity-1" }]);
    mocks.transaction.mockImplementation((callback) => callback(tx));
    expect((await POST(request(itemFor(type)), ctx)).status).toBe(200);
    expect(tx.projectWorkspaceItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "project-a", widgetId: "board-a", type, payload: expect.objectContaining({ entityId: "entity-1" }), linkedTaskId: null, linkedOrderId: null }) });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(tx.projectMutationReceipt.create).toHaveBeenCalledOnce();
  });
  it("allows moving an existing orphan, but rejects retargeting it to another missing entity", async () => {
    const tx = transactionFixture();
    const base = itemFor("CONTRACTOR");
    if (base.type !== "CONTRACTOR") throw new Error("Expected contractor card");
    const item = { ...base, expectedRevision: 3 };
    const stored = { ...item, projectId: "project-a", widgetId: "board-a", revision: 3, deletedAt: null };
    tx.projectWorkspaceItem.findMany.mockResolvedValueOnce([stored]).mockResolvedValue([]);
    mocks.transaction.mockImplementation((callback) => callback(tx));
    expect((await POST(request({ ...item, x: 2 }), ctx)).status).toBe(200);
    expect(tx.projectWorkspaceItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: item.id, revision: 3 } }));
    tx.projectWorkspaceItem.findMany.mockResolvedValueOnce([stored]);
    const retargeted = { ...item, payload: { ...item.payload, entityId: "foreign-2" } };
    expect((await POST(request(retargeted), ctx)).status).toBe(400);
  });
  it("rejects an item from another board even if its referenced entity exists", async () => {
    const tx = transactionFixture();
    tx.projectWorkspaceItem.findMany.mockResolvedValue([{ projectId: "foreign", widgetId: "other" }]);
    mocks.transaction.mockImplementation((callback) => callback(tx));
    expect((await POST(request(itemFor("CONTRACTOR")), ctx)).status).toBe(400);
    expect(tx.projectContractor.findMany).not.toHaveBeenCalled();
  });
  it("rejects edits to archived projects before querying entities", async () => {
    const tx = transactionFixture();
    tx.project.findUnique.mockResolvedValue({ archivedAt: new Date(), widgets: [{ id: "board-a" }] });
    mocks.transaction.mockImplementation((callback) => callback(tx));
    expect((await POST(request(itemFor("CONTACT")), ctx)).status).toBe(400);
    expect(tx.projectContact.findMany).not.toHaveBeenCalled();
  });
  it("authenticates before parsing or opening a transaction", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(new Request("http://local", { method: "POST", body: "invalid" }), ctx)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("replays the receipt without checking or writing source entities again", async () => {
    const tx = transactionFixture();
    tx.projectMutationReceipt.findUnique.mockResolvedValue({ result: { changedItems: [], deletedIds: [], deletedRevisions: {} } });
    mocks.transaction.mockImplementation((callback) => callback(tx));
    const result = await POST(request(itemFor("PROPOSAL")), ctx);
    expect(result.status).toBe(200);
    expect((await result.json()).duplicate).toBe(true);
    expect(tx.project.findUnique).not.toHaveBeenCalled();
    expect(tx.projectProposal.findMany).not.toHaveBeenCalled();
  });
});
