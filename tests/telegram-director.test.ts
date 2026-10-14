import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIRECTOR_TASK_COLOR, DirectorSettingsSchema, handleDirectorMessage, parseDirectorTask, saveDirectorSettings } from "@/server/telegram-director";
import { notifyDirectorTaskMoved } from "@/server/work-task-notifications";

const mocks = vi.hoisted(() => ({
  settings: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  inbox: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  task: { create: vi.fn(), findFirst: vi.fn() }, column: { findFirst: vi.fn() }, activity: { create: vi.fn() },
  transaction: vi.fn(), query: vi.fn(), send: vi.fn(),
}));
const database = { telegramDirectorSettings: mocks.settings, telegramDirectorInbox: mocks.inbox, user: mocks.user, workTask: mocks.task, workTaskColumn: mocks.column, workTaskActivity: mocks.activity, $queryRaw: mocks.query, $transaction: mocks.transaction };
vi.mock("@/server/db", () => ({ prisma: { telegramDirectorSettings: mocks.settings, telegramDirectorInbox: mocks.inbox, user: mocks.user, workTask: mocks.task, workTaskColumn: mocks.column, workTaskActivity: mocks.activity, $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock("@/server/telegram", () => ({ escapeTelegramHtml: (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"), sendTelegramMessage: mocks.send, getWarehouseChatId: () => null, getWarehouseTopicId: () => null, isTelegramConfigured: () => true }));
function initial() { return { id: "primary", revision: 0, directorUserId: "director" as string | null, telegramChatId: "123" as string | null, boardId: "board", columnId: "inbox", lastMessageId: null as number | null, pendingAfterMessageId: null as number | null, pendingExpiresAt: null as Date | null, director: { id: "director", displayName: "Director <QA>", role: "WOWSTORG", isActive: true, telegramChatId: "123" }, board: { id: "board", title: "Board", archivedAt: null as Date | null }, column: { id: "inbox", title: "Inbox", boardId: "board", isDone: false } }; }
let state: ReturnType<typeof initial>;
let receipts: Map<string, { id: string; taskId?: string; directorUserId: string; telegramChatId: string; messageId: number; directorName: string }>;
beforeEach(() => {
  vi.clearAllMocks(); state = initial(); receipts = new Map();
  mocks.query.mockResolvedValue([{ id: "primary" }]);
  mocks.transaction.mockImplementation(async (operation: (tx: typeof database) => Promise<unknown>) => operation(database));
  mocks.settings.findUnique.mockImplementation(async () => structuredClone(state));
  mocks.settings.findUniqueOrThrow.mockImplementation(async () => structuredClone(state));
  mocks.settings.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const { revision, ...values } = data; Object.assign(state, values);
    if (revision) state.revision += 1;
    return { ...state };
  });
  mocks.inbox.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => receipts.get(where.id) ?? null);
  mocks.inbox.create.mockImplementation(async ({ data }: { data: { id: string; directorUserId: string; telegramChatId: string; messageId: number; directorName: string } }) => { receipts.set(data.id, data); return data; });
  mocks.inbox.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: { taskId: string } }) => Object.assign(receipts.get(where.id)!, data));
  mocks.inbox.findMany.mockResolvedValue([]);
  mocks.task.findFirst.mockResolvedValue({ sortOrder: 3000 }); mocks.task.create.mockResolvedValue({ id: "created" });
  mocks.activity.create.mockResolvedValue({}); mocks.user.findFirst.mockResolvedValue({ id: "director" });
  mocks.user.findUnique.mockResolvedValue({ displayName: "Actor <QA>" }); mocks.user.update.mockResolvedValue({});
  mocks.column.findFirst.mockResolvedValue({ id: "inbox" }); mocks.send.mockResolvedValue(true);
});
const message = (messageId: number, text?: string) => ({ messageId, text, chatId: "123", fromId: "123", chatType: "private", isBot: false });

describe("director Telegram tasks", () => {
  it("creates exactly one marked task from a prompt and multi-line reply", async () => {
    const prompt = await handleDirectorMessage(message(1, "/task")); expect(prompt.text).toContain("Какую задачу");
    expect(mocks.task.create).not.toHaveBeenCalled(); expect(state.pendingExpiresAt).toBeInstanceOf(Date);
    const created = await handleDirectorMessage(message(2, "Proposal <Sber>\nTwo budgets\nBy Friday"));
    expect(created.created).toBe(true); expect(created.text).toContain("Proposal &lt;Sber&gt;");
    expect(mocks.task.create).toHaveBeenCalledWith({ data: { title: "Proposal <Sber>", description: "Two budgets\nBy Friday", boardId: "board", columnId: "inbox", createdById: "director", color: DIRECTOR_TASK_COLOR, sortOrder: 4000 }, select: { id: true } });
    expect(receipts.get("123:2")?.taskId).toBe("created"); expect(state.pendingAfterMessageId).toBeNull();
    expect(mocks.activity.create).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" }); expect(mocks.query).toHaveBeenCalled();
    await handleDirectorMessage(message(2, "Proposal <Sber>\nTwo budgets"));
    expect(mocks.task.create).toHaveBeenCalledOnce();
  });
  it("supports a one-message /task and never recreates a deleted receipt's task", async () => {
    const result = await handleDirectorMessage(message(10, "/task@OurBot One message\nDetails")); expect(result.created).toBe(true);
    receipts.get("123:10")!.taskId = undefined; state.lastMessageId = null;
    expect(await handleDirectorMessage(message(10, "/task One message"))).toEqual({ handled: true });
    expect(mocks.task.create).toHaveBeenCalledOnce();
  });
  it.each(["group", "spoof", "bot", "inactive", "wrong-role", "changed-chat", "not-director"])("rejects %s before any write", async kind => {
    const incoming = message(1, "/task malicious");
    if (kind === "group") incoming.chatType = "supergroup";
    if (kind === "spoof") incoming.fromId = "456";
    if (kind === "bot") incoming.isBot = true;
    if (kind === "inactive") state.director.isActive = false;
    if (kind === "wrong-role") state.director.role = "GREENWICH";
    if (kind === "changed-chat") state.director.telegramChatId = "456";
    if (kind === "not-director") state.telegramChatId = "456";
    expect(await handleDirectorMessage(incoming)).toEqual({ handled: false });
    expect(mocks.inbox.create).not.toHaveBeenCalled(); expect(mocks.task.create).not.toHaveBeenCalled();
  });
  it("expires a draft, cancels it and ignores out-of-order messages", async () => {
    const now = new Date("2026-10-14T10:00:00Z");
    await handleDirectorMessage(message(1, "/task"), now);
    await handleDirectorMessage(message(2, "Expired"), new Date(now.getTime() + 31 * 60_000));
    expect(mocks.task.create).not.toHaveBeenCalled();
    await handleDirectorMessage(message(3, "/task"), now);
    await handleDirectorMessage(message(4, "/cancel"), now);
    await handleDirectorMessage(message(5, "Cancelled"), now);
    expect(mocks.task.create).not.toHaveBeenCalled();
    expect(await handleDirectorMessage(message(2, "/task old"), now)).toEqual({ handled: true });
  });
  it("preserves pending input after media/invalid text and refuses an archived or finished destination", async () => {
    await handleDirectorMessage(message(1, "/task"));
    expect((await handleDirectorMessage(message(2))).text).toContain("голосовые");
    expect(state.pendingAfterMessageId).toBe(1); expect(mocks.task.create).not.toHaveBeenCalled();
    state.column.isDone = true;
    expect((await handleDirectorMessage(message(3, "Valid title"))).text).toContain("недоступна");
    state.column.isDone = false; state.board.archivedAt = new Date();
    await handleDirectorMessage(message(4, "Valid title")); expect(mocks.task.create).not.toHaveBeenCalled();
  });
  it("lists only the director's receipts and escapes status/title text", async () => {
    mocks.inbox.findMany.mockResolvedValue([{ task: { title: "A < B", completedAt: null, column: { title: "Doing & QA" } } }]);
    const result = await handleDirectorMessage(message(1, "/mytasks"));
    expect(result.text).toContain("A &lt; B"); expect(result.text).toContain("Doing &amp; QA");
    expect(mocks.inbox.findMany.mock.calls[0][0].where).toMatchObject({ directorUserId: "director", telegramChatId: "123", task: { is: { archivedAt: null } } });
  });
  it("uses /start to initialize the private menu without creating a task", async () => {
    const result = await handleDirectorMessage(message(1, "/start")); expect(result.setupMenu).toBe(true); expect(result.text).toContain("/task");
    expect(mocks.task.create).not.toHaveBeenCalled();
  });
  it("validates title limits and private Telegram IDs", () => {
    expect(parseDirectorTask("\nTitle\nDescription")).toEqual({ title: "Title", description: "Description" });
    expect(parseDirectorTask("a".repeat(501))).toBeNull(); expect(parseDirectorTask(" ")).toBeNull();
    expect(DirectorSettingsSchema.safeParse({ expectedRevision: 0, directorUserId: "u", telegramChatId: "-100", boardId: "b", columnId: "c" }).success).toBe(false);
    expect(DirectorSettingsSchema.safeParse({ expectedRevision: 0, directorUserId: "u", telegramChatId: "9999999999999999", boardId: "b", columnId: "c" }).success).toBe(false);
  });
  it("validates the director and destination, rejects a duplicate Telegram binding and CAS mismatch", async () => {
    const input = { expectedRevision: 0, directorUserId: "director", telegramChatId: "123", boardId: "board", columnId: "inbox" };
    mocks.user.findFirst.mockResolvedValueOnce({ id: "director" }).mockResolvedValueOnce({ id: "other" });
    await expect(saveDirectorSettings(input)).rejects.toThrow("другому пользователю"); expect(mocks.user.update).not.toHaveBeenCalled();
    await expect(saveDirectorSettings({ ...input, expectedRevision: 9 })).rejects.toThrow("уже изменены");
    mocks.user.findFirst.mockResolvedValue(null); await expect(saveDirectorSettings(input)).rejects.toThrow("активным");
    mocks.user.findFirst.mockResolvedValue({ id: "director" }); mocks.column.findFirst.mockResolvedValue(null);
    await expect(saveDirectorSettings(input)).rejects.toThrow("колонка недоступна");
  });
  it("saves assignment and can disable the feature without unbinding the user's Telegram", async () => {
    mocks.user.findFirst.mockResolvedValueOnce({ id: "director" }).mockResolvedValueOnce(null);
    const result = await saveDirectorSettings({ expectedRevision: 0, directorUserId: "director", telegramChatId: "123", boardId: "board", columnId: "inbox" });
    expect(result.saved.revision).toBe(1); expect(mocks.user.update).toHaveBeenCalledOnce();
    const disabled = await saveDirectorSettings({ expectedRevision: 1, directorUserId: null, telegramChatId: null, boardId: null, columnId: null });
    expect(disabled.saved.directorUserId).toBeNull(); expect(mocks.user.update).toHaveBeenCalledOnce();
  });
  it("retries only a serialization conflict, not unexpected failures", async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "6" }));
    await handleDirectorMessage(message(1, "/task")); expect(mocks.transaction).toHaveBeenCalledTimes(2);
    mocks.transaction.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(handleDirectorMessage(message(2, "Task"))).rejects.toThrow("Database unavailable");
  });
});

describe("director task status notifications", () => {
  const move = { taskId: "task", actorUserId: "actor", fromColumnTitle: "A < old", toColumnTitle: "B & new" };
  it("sends the author's private chat the committed transition, even for equally named columns", async () => {
    mocks.inbox.findUnique.mockResolvedValue({ telegramChatId: "123", director: state.director, task: { title: "A < B" } });
    await notifyDirectorTaskMoved(move);
    expect(mocks.send).toHaveBeenCalledWith("123", expect.stringContaining("A &lt; old → <b>B &amp; new</b>"));
    expect(mocks.send.mock.calls[0][1]).toContain("Actor &lt;QA&gt;");
    await notifyDirectorTaskMoved({ ...move, fromColumnTitle: "Same", toColumnTitle: "Same" }); expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it("does not notify ordinary tasks, inactive users, changed Telegram bindings or a disabled feature", async () => {
    mocks.inbox.findUnique.mockResolvedValue(null); await notifyDirectorTaskMoved(move);
    mocks.inbox.findUnique.mockResolvedValue({ telegramChatId: "123", director: { ...state.director, isActive: false }, task: { title: "Task" } }); await notifyDirectorTaskMoved(move);
    mocks.inbox.findUnique.mockResolvedValue({ telegramChatId: "123", director: { ...state.director, telegramChatId: "456" }, task: { title: "Task" } }); await notifyDirectorTaskMoved(move);
    mocks.inbox.findUnique.mockResolvedValue({ telegramChatId: "123", director: state.director, task: { title: "Task" } }); state.directorUserId = null; await notifyDirectorTaskMoved(move);
    state.directorUserId = "new-director"; await notifyDirectorTaskMoved(move);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps delivery failures best-effort", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.inbox.findUnique.mockResolvedValue({ telegramChatId: "123", director: state.director, task: { title: "Task" } });
    mocks.send.mockRejectedValueOnce(new Error("Telegram timeout"));
    await expect(notifyDirectorTaskMoved(move)).resolves.toBeUndefined(); vi.restoreAllMocks();
  });
});
