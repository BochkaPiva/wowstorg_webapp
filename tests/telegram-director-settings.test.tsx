// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorSettingsPanel } from "@/app/admin/telegram/DirectorSettingsPanel";
const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG", id: "one" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { id: auth.id, role: auth.role } } }) }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root, container: HTMLDivElement, flights: Flight[];
const fixture = { settings: { revision: 0, directorUserId: null as string | null, telegramChatId: null as string | null, boardId: null as string | null, columnId: null as string | null }, users: [{ id: "director", displayName: "Director QA", telegramChatId: "123" }], boards: [{ id: "a", title: "Board A", columns: [{ id: "a-open", title: "Inbox A" }] }, { id: "b", title: "Board B", columns: [{ id: "b-open", title: "Inbox B" }] }] };
beforeEach(() => { auth.status = "authenticated"; auth.role = "WOWSTORG"; auth.id = "one"; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => { expect(url).toMatch(/^\/api\/admin\/telegram\/director(?:\/notify)?$/u); return new Promise<Response>(resolve => flights.push({ url, init, resolve })); })); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render() { act(() => root.render(<React.StrictMode><DirectorSettingsPanel botReady /></React.StrictMode>)); }
async function respond(payload: unknown, status = 200, flight = flights.at(-1)!) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function select(index: number, value: string) { act(() => { const node = container.querySelectorAll("select")[index]; node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }); }
function click(label: string) { const node = [...container.querySelectorAll("button")].find(button => button.textContent === label)!; expect(node).toBeDefined(); act(() => node.click()); }
describe("director settings form", () => {
  it("notifies only the saved selection, reports the correct busy state and preserves retry on failure", async () => {
    render(); await respond({ ...fixture, settings: { revision: 2, directorUserId: "director", telegramChatId: "123", boardId: "a", columnId: "a-open" } });
    click("Оповестить о назначении"); expect(flights.at(-1)?.url).toBe("/api/admin/telegram/director/notify");
    expect(JSON.parse(flights.at(-1)!.init!.body as string)).toEqual({ expectedRevision: 2, directorUserId: "director" });
    expect(container.textContent).toContain("Отправляем…"); expect(container.textContent).not.toContain("Сохраняем…");
    await respond({ error: { message: "Delivery failed" } }, 502); expect(container.textContent).toContain("Delivery failed");
    click("Оповестить о назначении"); await respond({ ok: true }); expect(container.textContent).toContain("Инструкция и кнопки отправлены");
    select(0, ""); expect([...container.querySelectorAll("button")].find(button => button.textContent === "Оповестить о назначении")!.disabled).toBe(true);
  });
  it("waits for warehouse authorization and ignores an old account's result", async () => {
    auth.status = "loading"; render(); expect(flights).toHaveLength(0); auth.status = "authenticated"; auth.role = "GREENWICH"; render(); expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG"; render(); const old = flights.at(-1)!;
    auth.id = "two"; render(); expect(old.init?.signal?.aborted).toBe(true);
    await respond(fixture); await respond({ ...fixture, users: [{ id: "old", displayName: "Old director", telegramChatId: "456" }] }, 200, old);
    expect(container.textContent).not.toContain("Old director"); expect(container.textContent).toContain("Director QA");
  });
  it("selects the matching board column, keeps a failed save draft and saves with CAS", async () => {
    render(); await respond(fixture); select(0, "director"); select(1, "b");
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("123"); expect(container.querySelectorAll("select")[2].value).toBe("b-open");
    click("Сохранить назначение"); const failed = flights.at(-1)!;
    expect(JSON.parse(failed.init!.body as string)).toEqual({ expectedRevision: 0, directorUserId: "director", telegramChatId: "123", boardId: "b", columnId: "b-open" });
    await respond({ error: { message: "Conflict" } }, 409); expect(container.textContent).toContain("Conflict"); expect(container.querySelectorAll("select")[1].value).toBe("b");
    click("Сохранить назначение"); await respond({ revision: 1 });
    expect(flights.at(-1)!.init?.method).toBeUndefined();
    await respond({ ...fixture, settings: { revision: 1, directorUserId: "director", telegramChatId: "123", boardId: "b", columnId: "b-open" } });
    expect(container.textContent).toContain("Сохранено");
    click("Проверить меню бота"); expect(flights.at(-1)!.init?.method).toBe("POST"); await respond({ ok: true }); expect(container.textContent).toContain("Меню команд подключено");
  });
  it("does not refresh or reveal a previous owner's write after logout", async () => {
    render(); await respond(fixture); select(0, "director"); click("Сохранить назначение"); const pending = flights.at(-1)!;
    auth.status = "anonymous"; render(); const before = flights.length; await respond({ revision: 1 }, 200, pending);
    expect(flights).toHaveLength(before); expect(container.textContent).toBe("");
  });
  it("disables assignment without deleting Telegram binding, and prevents menu checks on an unsaved change", async () => {
    render(); await respond({ ...fixture, settings: { revision: 2, directorUserId: "director", telegramChatId: "123", boardId: "a", columnId: "a-open" } });
    select(0, ""); expect([...container.querySelectorAll("button")].find(button => button.textContent === "Проверить меню бота")!.disabled).toBe(true);
    click("Отключить поручения"); expect(JSON.parse(flights.at(-1)!.init!.body as string)).toEqual({ expectedRevision: 2, directorUserId: null, telegramChatId: null, boardId: null, columnId: null });
  });
});
