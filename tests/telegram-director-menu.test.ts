import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureTelegramDirectorMenu, editTelegramMessageText, sendTelegramMessageDetailed } from "@/server/telegram";
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("undici", () => ({ Agent: class {}, ProxyAgent: class {}, FormData: class {}, fetch: transport.fetch }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("TELEGRAM_BOT_TOKEN", "qa-token-not-a-secret"); transport.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) }); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("private director menu provisioning", () => {
  it("sends a native persistent keyboard and edits inline views idempotently", async () => {
    const keyboard = { keyboard: [[{ text: "Новая задача" }]], is_persistent: true, resize_keyboard: true };
    await sendTelegramMessageDetailed("123", "Guide", { replyMarkup: keyboard });
    expect(JSON.parse(transport.fetch.mock.calls[0][1].body).reply_markup).toEqual(keyboard);
    await editTelegramMessageText({ chatId: "123", messageId: 20, text: "Details", replyMarkup: { inline_keyboard: [] } });
    expect(JSON.parse(transport.fetch.mock.calls[1][1].body)).toMatchObject({ chat_id: "123", message_id: 20, text: "Details", parse_mode: "HTML" });
    transport.fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => JSON.stringify({ ok: false, description: "Bad Request: message is not modified" }) });
    expect(await editTelegramMessageText({ chatId: "123", messageId: 20, text: "Details" })).toEqual({ ok: true });
  });
  it("sets chat-scoped commands in default/Russian languages and the private menu button", async () => {
    expect(await configureTelegramDirectorMenu("123")).toEqual({ ok: true });
    const calls = transport.fetch.mock.calls.map(([url, init]) => ({ method: String(url).split("/").at(-1), body: JSON.parse(init.body) }));
    expect(calls.filter(call => call.method === "setMyCommands").map(call => call.body.language_code)).toEqual(["", "ru"]);
    for (const call of calls.filter(call => call.method === "setMyCommands")) { expect(call.body.scope).toEqual({ type: "chat", chat_id: "123" }); expect(call.body.commands.map((entry: { command: string }) => entry.command)).toEqual(["task", "mytasks", "cancel", "help"]); }
    expect(calls.find(call => call.method === "setChatMenuButton")?.body).toEqual({ chat_id: 123, menu_button: { type: "commands" } });
  });
  it("removes only the old director's command scopes, not global commands", async () => {
    await configureTelegramDirectorMenu("123", false);
    expect(transport.fetch.mock.calls.filter(([url]) => String(url).endsWith("/deleteMyCommands"))).toHaveLength(2);
    expect(transport.fetch.mock.calls.every(([, init]) => JSON.parse(init.body).chat_id === 123 || JSON.parse(init.body).scope?.chat_id === "123")).toBe(true);
  });
  it("refuses group IDs and reports Telegram ok=false instead of assuming HTTP 200 means success", async () => {
    expect((await configureTelegramDirectorMenu("-100123")).ok).toBe(false); expect(transport.fetch).not.toHaveBeenCalled();
    transport.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, description: "Chat not found" }) });
    expect(await configureTelegramDirectorMenu("123")).toEqual({ ok: false, error: "Chat not found" });
  });
});
