// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionEditor } from "@/app/inventory/positions/PositionEditor";
import { positionFormValues, positionPayload, sortPositions, type Position } from "@/app/inventory/positions/position-form";
const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { id: "user", role: auth.role } } }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root, container: HTMLDivElement, flights: Flight[];
const item: Position = { id: "one", name: "Стул", description: null, type: "ASSET", internalOnly: false, isActive: true, pricePerDay: "150", purchasePricePerUnit: "1000", total: 8, inRepair: 1, broken: 1, missing: 0, photo1Key: null, updatedAt: "2026-10-14T00:00:00.000Z", categories: [{ categoryId: "cat" }], collections: [{ collectionId: "collection", position: 0 }] };
const data = { item, categories: [{ id: "cat", name: "Мебель" }], collections: [{ id: "collection", name: "Встреча" }] };
beforeEach(() => { auth.status = "authenticated"; auth.role = "WOWSTORG"; flights = []; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve })))); vi.stubGlobal("confirm", vi.fn(() => true)); URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render(element: React.ReactNode) { act(() => root.render(<React.StrictMode>{element}</React.StrictMode>)); }
async function respond(payload: unknown, status = 200) { await act(async () => flights.at(-1)!.resolve(new Response(JSON.stringify(payload), { status }))); }
function input(label: string, value: string) { const entry = [...container.querySelectorAll("label")].find(node => node.textContent?.startsWith(label))!.querySelector("input")!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(entry, value); entry.dispatchEvent(new Event("input", { bubbles: true })); }); }
function submit() { act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
describe("inventory editor recovery", () => {
  it("preserves collection membership and CAS, retains draft after conflict, acknowledges a fresh result", async () => {
    const saved = vi.fn(); render(<PositionEditor id="one" onCancel={vi.fn()} onSaved={saved} />); await respond(data); input("Название", "Стул новый"); submit();
    const body = JSON.parse(String(flights.at(-1)?.init?.body)); expect(body).toMatchObject({ name: "Стул новый", expectedUpdatedAt: item.updatedAt, collectionIds: ["collection"], categoryIds: ["cat"] });
    await respond({ error: { message: "Карточка уже изменилась" } }, 409); expect(container.textContent).toContain("Карточка уже изменилась"); expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("Стул новый"); expect(saved).not.toHaveBeenCalled();
    submit(); await respond({ updatedAt: "2026-10-14T01:00:00.000Z" }); await respond({ ...data, item: { ...item, name: "Стул новый" } }); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: "Стул новый" }), false);
  });
  it("retries only the photo after creation succeeds and photo upload fails", async () => {
    const saved = vi.fn(); render(<PositionEditor onCancel={vi.fn()} onSaved={saved} />); await respond({ categories: [], collections: [] }); input("Название", "Новая стойка"); input("Цена аренды", "125,5");
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!; act(() => { Object.defineProperty(fileInput, "files", { value: [new File(["image"], "photo.png", { type: "image/png" })] }); fileInput.dispatchEvent(new Event("change", { bubbles: true })); });
    submit(); expect(flights.at(-1)?.init?.method).toBe("POST"); await respond({ id: "created", updatedAt: item.updatedAt }); expect(flights.at(-1)?.url).toBe("/api/inventory/positions/created/photo"); await respond({ error: { message: "Фото не загрузилось" } }, 500); expect(container.textContent).toContain("Данные позиции уже сохранены");
    submit(); expect(flights.at(-1)?.url).toBe("/api/inventory/positions/created/photo"); await respond({ ok: true }); await respond({ ...data, item: { ...item, id: "created" } }); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: "created" }), true); expect(flights.filter(entry => entry.url === "/api/inventory/positions" && entry.init?.method === "POST")).toHaveLength(1);
  });
  it("does not silently accept a newer revision when correcting a partial save", async () => {
    render(<PositionEditor id="one" onCancel={vi.fn()} onSaved={vi.fn()} />); await respond(data); input("Название", "Изменение"); submit(); await respond({ updatedAt: "2026-10-14T01:00:00.000Z" }); await respond({ error: { message: "Сеть" } }, 500); input("Название", "Следующее изменение"); submit(); await respond({ ...data, item: { ...item, updatedAt: "2026-10-14T02:00:00.000Z" } }); expect(container.textContent).toContain("Карточка уже изменилась"); expect(flights.filter(entry => entry.init?.method === "PATCH")).toHaveLength(1);
  });
  it("refuses invalid stock and sorts without mutating the server snapshot", () => {
    expect(() => positionPayload({ ...positionFormValues(item), total: "1" })).toThrow("не могут превышать"); expect(() => positionPayload({ ...positionFormValues(item), total: "1.5" })).toThrow("целое");
    const items = [item, { ...item, id: "two", name: "Газон", pricePerDay: "5000", total: 2 }]; expect(sortPositions(items, "price-desc").map(x => x.id)).toEqual(["two", "one"]); expect(sortPositions(items, "stock").map(x => x.id)).toEqual(["two", "one"]); expect(items[0].id).toBe("one");
  });
});
