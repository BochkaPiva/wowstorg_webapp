import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/telegram/webhook/route";
const hooks = vi.hoisted(() => ({ handle: vi.fn(), send: vi.fn(), menu: vi.fn(), schedule: vi.fn(), linked: vi.fn(), notifyCreated: vi.fn(), view: vi.fn(), edit: vi.fn(), answer: vi.fn() }));
vi.mock("@/server/telegram-director-views", () => ({ handleDirectorView: hooks.view }));
vi.mock("@/server/work-task-notifications", () => ({ notifyDirectorTaskCreated: hooks.notifyCreated }));
vi.mock("@/server/telegram-director", () => ({ handleDirectorMessage: hooks.handle }));
vi.mock("@/server/db", () => ({ prisma: { user: { findFirst: hooks.linked } } }));
vi.mock("@/server/notifications/schedule-after-response", () => ({ scheduleAfterResponse: hooks.schedule }));
vi.mock("@/server/telegram", () => ({ getTelegramWebhookSecret: () => "qa-webhook-secret", escapeTelegramHtml: (value: string) => value, sendTelegramMessage: hooks.send, sendTelegramMessageDetailed: hooks.send, configureTelegramDirectorMenu: hooks.menu, editTelegramMessageText: hooks.edit, answerTelegramCallbackQuery: hooks.answer }));
beforeEach(() => { vi.clearAllMocks(); hooks.handle.mockResolvedValue({ handled: true, text: "Saved", created: true }); hooks.send.mockResolvedValue({ ok: true }); hooks.menu.mockResolvedValue({ ok: true }); hooks.linked.mockResolvedValue(null); });
const update = { update_id: 1, message: { message_id: 2, text: "/task Task", chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false, first_name: "QA" } } };
function request(body: unknown = update, secret = "qa-webhook-secret") { return new Request("https://example.test/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(body) }); }
describe("director webhook boundary", () => {
  it("edits authorized private views without creating new messages or tasks", async () => {
    hooks.view.mockResolvedValue({ view: { text: "Details", replyMarkup: { inline_keyboard: [] } } });
    const callback = { callback_query: { id: "cb", data: "director:task:task", from: { id: 123 }, message: { message_id: 15, chat: { id: 123, type: "private" } } } };
    expect((await POST(request(callback))).status).toBe(200); expect(hooks.handle).not.toHaveBeenCalled(); expect(hooks.send).not.toHaveBeenCalled(); expect(hooks.edit).not.toHaveBeenCalled();
    expect(hooks.view).toHaveBeenCalledWith({ data: "director:task:task", chatId: "123", fromId: "123", chatType: "private" });
    await hooks.schedule.mock.calls[0][1](); expect(hooks.edit).toHaveBeenCalledWith({ chatId: "123", messageId: 15, text: "Details", replyMarkup: { inline_keyboard: [] } });
    hooks.view.mockResolvedValueOnce({ alert: "Access denied" }); await POST(request(callback)); expect(hooks.answer).toHaveBeenLastCalledWith({ callbackQueryId: "cb", text: "Access denied", showAlert: true }); expect(hooks.schedule).toHaveBeenCalledOnce();
  });
  it("notifies the task topic only after a newly committed task, independently of the private reply", async () => {
    hooks.handle.mockResolvedValueOnce({ handled: true, text: "Saved", created: true, taskId: "created" });
    expect((await POST(request())).status).toBe(200);
    expect(hooks.notifyCreated).not.toHaveBeenCalled();
    const notify = hooks.schedule.mock.calls.find(([label]) => label === "notifyDirectorTaskCreated");
    expect(notify).toBeDefined(); await notify![1]();
    expect(hooks.notifyCreated).toHaveBeenCalledExactlyOnceWith("created");
    expect(hooks.send).not.toHaveBeenCalled();
    hooks.handle.mockResolvedValueOnce({ handled: true }); await POST(request());
    expect(hooks.schedule.mock.calls.filter(([label]) => label === "notifyDirectorTaskCreated")).toHaveLength(1);
  });
  it("never announces a prompt, invalid input or rejected director message as a task", async () => {
    for (const result of [{ handled: true, text: "Prompt" }, { handled: true, created: false }, { handled: false }]) {
      hooks.handle.mockResolvedValueOnce(result); await POST(request());
    }
    expect(hooks.schedule.mock.calls.some(([label]) => label === "notifyDirectorTaskCreated")).toBe(false);
  });
  it("requires the webhook secret before processing a director command", async () => {
    expect((await POST(request(update, "wrong"))).status).toBe(401);
    expect(hooks.handle).not.toHaveBeenCalled(); expect(hooks.schedule).not.toHaveBeenCalled();
  });
  it("passes the real sender and private chat to the service, acknowledging before Telegram delivery", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, director: true, created: true });
    expect(hooks.handle).toHaveBeenCalledWith({ messageId: 2, chatId: "123", fromId: "123", chatType: "private", isBot: false, text: "/task Task" });
    expect(hooks.send).not.toHaveBeenCalled();
    await hooks.schedule.mock.calls[0][1](); expect(hooks.send).toHaveBeenCalledWith("123", "Saved", undefined);
  });
  it("provisions the menu for /start only and never sends duplicate-task replies", async () => {
    hooks.handle.mockResolvedValueOnce({ handled: true, setupMenu: true, text: "Help" });
    await POST(request()); await hooks.schedule.mock.calls[0][1]();
    expect(hooks.menu).toHaveBeenCalledWith("123");
    hooks.handle.mockResolvedValueOnce({ handled: true }); await POST(request()); await hooks.schedule.mock.calls[1][1]();
    expect(hooks.send).toHaveBeenCalledOnce();
  });
  it("keeps the existing non-director /start and ignores unrecognized updates", async () => {
    hooks.handle.mockResolvedValue({ handled: false });
    const response = await POST(request({ ...update, message: { ...update.message, text: "/start" } }));
    expect(response.status).toBe(200); expect(hooks.linked).toHaveBeenCalled(); expect(hooks.send).toHaveBeenCalledOnce();
    expect((await POST(request({ edited_message: update.message }))).status).toBe(200);
    expect(hooks.handle).toHaveBeenCalledOnce();
  });
  it("does not acknowledge a failed database operation as a created task", async () => {
    hooks.handle.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(POST(request())).rejects.toThrow("Database unavailable"); expect(hooks.schedule).not.toHaveBeenCalled();
  });
});
