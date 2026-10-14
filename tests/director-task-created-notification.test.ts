import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyDirectorTaskCreated } from "@/server/work-task-notifications";

const mocks = vi.hoisted(() => ({ receipt: vi.fn(), send: vi.fn(), configured: true, chatId: "warehouse" as string | null }));
vi.mock("@/server/db", () => ({ prisma: { telegramDirectorInbox: { findUnique: mocks.receipt } } }));
vi.mock("@/server/telegram", () => ({
  escapeTelegramHtml: (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  getWarehouseChatId: () => mocks.chatId, getWarehouseTopicId: () => "fallback", isTelegramConfigured: () => mocks.configured, sendTelegramMessage: mocks.send,
}));
const request = () => ({ directorName: "Директор <QA>", task: { title: "Тест", description: "Тестовое задание\n\nПроверить & ответить", board: { title: "Рабочая доска" }, column: { title: "Задачи" } } });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks(); mocks.configured = true; mocks.chatId = "warehouse"; mocks.receipt.mockResolvedValue(request()); mocks.send.mockResolvedValue(true);
  vi.stubEnv("TELEGRAM_TASKS_TOPIC_ID", "42"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
});

describe("new director task team notification", () => {
  it("uses the existing tasks topic and includes author, title, description, board and column", async () => {
    await notifyDirectorTaskCreated("task");
    expect(mocks.receipt.mock.calls[0][0].where).toEqual({ taskId: "task" });
    expect(mocks.send).toHaveBeenCalledOnce(); const [chat, text, options] = mocks.send.mock.calls[0];
    expect(chat).toBe("warehouse"); expect(options).toEqual({ messageThreadId: "42" });
    for (const fragment of ["Новое поручение директора", "Директор &lt;QA&gt;", "Тестовое задание\n\nПроверить &amp; ответить", "Рабочая доска", "Задачи", 'href="https://example.test/tasks"']) expect(text).toContain(fragment);
  });
  it("never announces an ordinary or deleted task without a director receipt", async () => {
    mocks.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ directorName: "Director", task: null });
    await notifyDirectorTaskCreated("ordinary"); await notifyDirectorTaskCreated("deleted"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("bounds long escaped text without breaking entities or emoji", async () => {
    const entry = request(); entry.directorName = "<&".repeat(500); entry.task.title = "<".repeat(500); entry.task.description = "🦖<&\"".repeat(1000); entry.task.board.title = "&".repeat(500); entry.task.column.title = "<".repeat(500);
    mocks.receipt.mockResolvedValueOnce(entry); await notifyDirectorTaskCreated("long");
    const text = mocks.send.mock.calls[0][1] as string; expect(text.length).toBeLessThanOrEqual(3900); expect(text).not.toMatch(/&(?:a|am|amp|l|lt|g|gt|q|qu|quo|quot)\u2026/u); expect(text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
  });
  it("does not send when the bot or warehouse chat is missing", async () => {
    mocks.configured = false; await notifyDirectorTaskCreated("task"); mocks.configured = true; mocks.chatId = null; await notifyDirectorTaskCreated("task"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("logs delivery and database failures without throwing", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.send.mockRejectedValueOnce(new Error("Network unavailable")); await expect(notifyDirectorTaskCreated("task")).resolves.toBeUndefined();
    mocks.receipt.mockRejectedValueOnce(new Error("Database unavailable")); await expect(notifyDirectorTaskCreated("task")).resolves.toBeUndefined(); expect(warning).toHaveBeenCalledTimes(2);
  });
  it("falls back to the established warehouse topic and accepts a title-only task", async () => {
    vi.stubEnv("TELEGRAM_TASKS_TOPIC_ID", ""); vi.stubEnv("TELEGRAM_PROJECTS_TOPIC_ID", ""); vi.stubEnv("TELEGRAM_PROJECT_TOPIC_ID", "");
    mocks.receipt.mockResolvedValueOnce({ ...request(), task: { ...request().task, description: null } });
    await notifyDirectorTaskCreated("task"); expect(mocks.send.mock.calls[0][2]).toEqual({ messageThreadId: "fallback" });
  });
});
