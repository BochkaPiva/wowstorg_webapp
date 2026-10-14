import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/telegram/director/notify/route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), send: vi.fn(), configured: true }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/telegram-director", () => ({ readDirectorSettings: mocks.read }));
vi.mock("@/server/telegram", () => ({ escapeTelegramHtml: (value: string) => value, isTelegramConfigured: () => mocks.configured, sendTelegramMessageDetailed: mocks.send }));
const data = () => ({ settings: { revision: 4, directorUserId: "director", telegramChatId: "123", boardId: "board", columnId: "inbox" }, users: [{ id: "director", telegramChatId: "123" }], boards: [{ id: "board", columns: [{ id: "inbox" }] }] });
const request = (body: unknown = { expectedRevision: 4, directorUserId: "director" }) => new Request("https://example.test/api/admin/telegram/director/notify", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.configured = true; mocks.auth.mockResolvedValue({ ok: true }); mocks.read.mockResolvedValue(data()); mocks.send.mockResolvedValue({ ok: true }); });
describe("director appointment notice", () => {
  it("requires warehouse authorization before sending", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) }); expect((await POST(request())).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects arbitrary chat targets, stale revisions and a changed selection", async () => {
    expect((await POST(request({ expectedRevision: 4, directorUserId: "director", telegramChatId: "999" }))).status).toBe(400);
    expect((await POST(request({ expectedRevision: 3, directorUserId: "director" }))).status).toBe(409);
    expect((await POST(request({ expectedRevision: 4, directorUserId: "other" }))).status).toBe(409); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("checks active binding and destination, and handles Telegram failure without a false success", async () => {
    mocks.read.mockResolvedValueOnce({ ...data(), users: [] }); expect((await POST(request())).status).toBe(400);
    mocks.read.mockResolvedValueOnce({ ...data(), users: [{ id: "director", telegramChatId: "999" }] }); expect((await POST(request())).status).toBe(400);
    mocks.read.mockResolvedValueOnce({ ...data(), boards: [] }); expect((await POST(request())).status).toBe(400);
    mocks.send.mockResolvedValueOnce({ ok: false, error: "Forbidden" }); expect((await POST(request())).status).toBe(502);
  });
  it("sends a plain-language guide and working keyboard to the server-selected private chat", async () => {
    expect((await POST(request())).status).toBe(200); const [chat, text, options] = mocks.send.mock.calls[0]; expect(chat).toBe("123");
    expect(text).toContain("Новая задача"); expect(text).toContain("Мои поручения"); expect(text).toContain("Отменить ввод"); expect(text).not.toMatch(/\/task|webhook|Telegram ID|Метка/u);
    expect(options.replyMarkup.keyboard[0].map((entry: { text: string }) => entry.text)).toEqual(["Новая задача", "Мои поручения"]);
  });
});
