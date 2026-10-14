import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/tasks/tasks/[id]/route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), current: vi.fn(), update: vi.fn(), column: vi.fn(), transaction: vi.fn(), query: vi.fn(), activity: vi.fn(), schedule: vi.fn(), notify: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: { workTask: { findUnique: mocks.read }, workTaskColumn: { findUnique: mocks.column }, $transaction: mocks.transaction } }));
vi.mock("@/server/work-task-data", () => ({ workTaskCardSelect: { id: true }, serializeWorkTaskCard: (task: unknown) => task }));
vi.mock("@/server/work-task-activity", () => ({ appendWorkTaskActivity: mocks.activity }));
vi.mock("@/server/notifications/schedule-after-response", () => ({ scheduleAfterResponse: mocks.schedule }));
vi.mock("@/server/work-task-notifications", () => ({ notifyWorkTaskAssigned: vi.fn(), notifyWorkTaskStatusChanged: mocks.notify }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "actor" } });
  mocks.read.mockResolvedValue({ title: "Task", description: null, assignees: [], assigneeUserId: null, completedAt: null, archivedAt: null, column: { id: "stale", title: "Stale source" } });
  mocks.column.mockResolvedValue({ id: "target", boardId: "board", title: "Target" }); mocks.update.mockResolvedValue({});
  mocks.current.mockResolvedValueOnce({ column: { id: "actual", title: "Actual source" } }).mockResolvedValue({ id: "task", title: "Task" });
  mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation({ $queryRaw: mocks.query, workTask: { update: mocks.update, findUniqueOrThrow: mocks.current } }));
});
function request(body: unknown = { columnId: "target", sortOrder: 1000 }) { return new Request("https://example.test/api/tasks/tasks/task", { method: "PATCH", body: JSON.stringify(body) }); }
const params = { params: Promise.resolve({ id: "task" }) };
describe("director task committed move boundary", () => {
  it("reports the locked current source, not a stale pre-transaction read, only after commit", async () => {
    const response = await PATCH(request(), params); expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalled(); expect(mocks.activity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "MOVED", message: "Перемещено: Actual source → Target", metadata: { fromColumnId: "actual", toColumnId: "target" } }));
    expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.schedule).toHaveBeenCalledOnce();
    await mocks.schedule.mock.calls[0][1](); expect(mocks.notify).toHaveBeenCalledWith({ taskId: "task", actorUserId: "actor", fromColumnTitle: "Actual source", toColumnTitle: "Target" });
  });
  it("does not notify for reordering/no-op updates already in the target column", async () => {
    mocks.current.mockReset().mockResolvedValueOnce({ column: { id: "target", title: "Target" } }).mockResolvedValue({ id: "task" });
    expect((await PATCH(request(), params)).status).toBe(200); expect(mocks.schedule).not.toHaveBeenCalled(); expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("does not notify on a failed database commit", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("Commit failed"));
    await expect(PATCH(request(), params)).rejects.toThrow("Commit failed"); expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("rejects attempts to forge the director sticker through a normal task patch", async () => {
    expect((await PATCH(request({ title: "Forged", directorRequest: { directorName: "Director" } }), params)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires warehouse authorization before reading task data", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await PATCH(request(), params)).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled();
  });
});
