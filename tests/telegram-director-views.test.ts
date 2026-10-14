import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDirectorView } from "@/server/telegram-director-views";
const mocks = vi.hoisted(() => ({ settings: vi.fn(), list: vi.fn(), detail: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { telegramDirectorSettings: { findUnique: mocks.settings }, telegramDirectorInbox: { findMany: mocks.list, findFirst: mocks.detail } } }));
const director = { id: "director", role: "WOWSTORG", isActive: true, telegramChatId: "123" };
const input = (data = "director:list:open:0") => ({ data, chatId: "123", fromId: "123", chatType: "private" });
beforeEach(() => { vi.clearAllMocks(); mocks.settings.mockResolvedValue({ telegramChatId: "123", director }); mocks.list.mockResolvedValue([]); mocks.detail.mockResolvedValue({ task: { title: "Task <QA>", description: "Details\nNext line", completedAt: null, dueDate: new Date("2026-10-20T00:00:00Z"), dueTimeMinutes: 780, assignee: null, assignees: [{ user: { displayName: "Owner & QA" } }], column: { title: "Doing" } } }); });
describe("private director task views", () => {
  it.each(["group", "spoof", "inactive", "role", "binding"])("rejects %s without reading tasks", async kind => {
    const args = input(); if (kind === "group") args.chatType = "supergroup"; if (kind === "spoof") args.fromId = "999";
    if (kind === "inactive") mocks.settings.mockResolvedValueOnce({ telegramChatId: "123", director: { ...director, isActive: false } });
    if (kind === "role") mocks.settings.mockResolvedValueOnce({ telegramChatId: "123", director: { ...director, role: "GREENWICH" } });
    if (kind === "binding") mocks.settings.mockResolvedValueOnce({ telegramChatId: "123", director: { ...director, telegramChatId: "999" } });
    expect((await handleDirectorView(args)).alert).toBeTruthy(); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
  });
  it("paginates six owner-scoped tasks and provides filter/detail/navigation buttons", async () => {
    mocks.list.mockResolvedValueOnce(Array.from({ length: 7 }, (_, index) => ({ task: { id: `task-${index}`, title: `Task <${index}>`, column: { title: "Doing" } } })));
    const result = await handleDirectorView(input("director:list:done:1")); expect(result.view?.text).toContain("Готовые поручения");
    expect(mocks.list.mock.calls[0][0]).toMatchObject({ where: { directorUserId: "director", telegramChatId: "123", task: { is: { archivedAt: null, completedAt: { not: null } } } }, skip: 6, take: 7 });
    const buttons = result.view!.replyMarkup.inline_keyboard.flat(); expect(buttons.some(button => button.text === "Дальше")).toBe(true); expect(buttons.some(button => button.text === "Назад")).toBe(true);
    expect(buttons.every(button => Buffer.byteLength(button.callback_data!) <= 64)).toBe(true); expect(result.view!.text).toContain("&lt;0&gt;");
  });
  it("shows current description, assignees and deadline without changing task state", async () => {
    const result = await handleDirectorView(input("director:task:task")); expect(result.view?.text).toContain("Details\nNext line"); expect(result.view?.text).toContain("Owner &amp; QA"); expect(result.view?.text).toContain("20.10.2026 · 13:00");
    expect(mocks.detail.mock.calls[0][0].where).toMatchObject({ taskId: "task", directorUserId: "director", telegramChatId: "123" });
  });
  it("never leaks an unavailable or foreign task and rejects malformed callbacks", async () => {
    mocks.detail.mockResolvedValueOnce(null); expect((await handleDirectorView(input("director:task:other"))).alert).toBeTruthy();
    expect((await handleDirectorView(input("director:list:open:10000"))).alert).toBeTruthy();
    expect((await handleDirectorView(input("director:task:../../private"))).alert).toBeTruthy(); expect(mocks.detail).toHaveBeenCalledOnce();
  });
});
