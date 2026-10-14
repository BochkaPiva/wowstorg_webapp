import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "@/app/api/admin/telegram/director/route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), save: vi.fn(), menu: vi.fn(), schedule: vi.fn() }));
vi.mock("@/server/auth/require", () => ({ requireRole: mocks.auth }));
vi.mock("@/server/telegram-director", async importOriginal => ({ ...await importOriginal<typeof import("@/server/telegram-director")>(), readDirectorSettings: mocks.read, saveDirectorSettings: mocks.save }));
vi.mock("@/server/telegram", () => ({ configureTelegramDirectorMenu: mocks.menu, isTelegramConfigured: () => true }));
vi.mock("@/server/notifications/schedule-after-response", () => ({ scheduleAfterResponse: mocks.schedule }));
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "actor" } }); mocks.read.mockResolvedValue({ settings: { directorUserId: "director", telegramChatId: "123" }, users: [{ id: "director", telegramChatId: "123" }] }); mocks.save.mockResolvedValue({ saved: { revision: 1, telegramChatId: "123" }, oldChatId: "456" }); mocks.menu.mockResolvedValue({ ok: true }); });
function request(body: unknown) { return new Request("https://example.test/api/admin/telegram/director", { method: "PATCH", body: JSON.stringify(body) }); }
describe("director admin route", () => {
  it("keeps all methods behind warehouse authorization", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await GET()).status).toBe(403); expect((await POST()).status).toBe(403); expect((await PATCH(request({}))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.menu).not.toHaveBeenCalled();
  });
  it("rejects invalid input and persists before scheduling chat-specific menu changes", async () => {
    expect((await PATCH(request({ directorUserId: "director" }))).status).toBe(400); expect(mocks.save).not.toHaveBeenCalled();
    expect((await PATCH(request({ expectedRevision: 0, directorUserId: "director", telegramChatId: "123", boardId: "board", columnId: "inbox" }))).status).toBe(200);
    expect(mocks.menu).not.toHaveBeenCalled(); await mocks.schedule.mock.calls[0][1]();
    expect(mocks.menu.mock.calls).toEqual([["456", false], ["123"]]);
  });
  it("explicitly checks menu delivery and rejects a changed user binding", async () => {
    expect((await POST()).status).toBe(200); mocks.read.mockResolvedValueOnce({ settings: { directorUserId: "director", telegramChatId: "123" }, users: [{ id: "director", telegramChatId: "456" }] });
    expect((await POST()).status).toBe(400); expect(mocks.menu).toHaveBeenCalledOnce();
  });
});
