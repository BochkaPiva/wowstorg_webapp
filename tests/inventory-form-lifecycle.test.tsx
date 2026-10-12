// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CollectionPage from "@/app/inventory/collections/[id]/page";
import PackagePage from "@/app/inventory/packages/[id]/page";
import WarehouseItemPage from "@/app/inventory/warehouse-items/[id]/page";
import PositionPage from "@/app/inventory/positions/[id]/page";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/inventory/positions/PositionRelatedItemsEditor", () => ({ PositionRelatedItemsEditor: () => null }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "WOWSTORG";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function render(element: React.ReactNode) { await act(async () => root.render(<React.StrictMode>{element}</React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest() { return flights.at(-1)!; }
function input(element: HTMLInputElement, value: string) {
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
function save() { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === "Сохранить")!; act(() => button.click()); }
const stock = { id: "one", name: "Исходное имя", description: null, type: "CONSUMABLE", internalOnly: true, isActive: true, total: 8, inRepair: 0, broken: 0, missing: 0, updatedAt: "2026-10-12T00:00:00.000Z" };
const cases = [
  { label: "collection", Page: CollectionPage, payload: { collection: { name: "Исходное имя", slug: "source", order: 2, items: [{ itemId: "one" }] }, items: [{ id: "one", name: "Позиция", isActive: true }] } },
  { label: "package", Page: PackagePage, payload: { kit: { name: "Исходное имя", description: "Описание", isActive: true, lines: [{ itemId: "one", defaultQty: 8 }] }, items: [{ id: "one", name: "Позиция", isActive: true, available: 3 }] } },
  { label: "warehouse item", Page: WarehouseItemPage, payload: { item: stock } },
  { label: "catalog position", Page: PositionPage, payload: { item: { ...stock, internalOnly: false, pricePerDay: "100", purchasePricePerUnit: "500", categories: [{ categoryId: "one" }], collections: [], photo1Key: null }, categories: [{ id: "one", name: "Категория", slug: "one" }] } },
];

describe.each(cases)("$label form lifecycle", ({ Page, payload, label }) => {
  it("preserves draft on unrelated render and failed save, then applies acknowledged reload", async () => {
    const params = Promise.resolve({ id: "one" });
    await render(<Page params={params} />);
    await respond(latest(), payload);
    const name = () => [...container.querySelectorAll<HTMLInputElement>("input")].find(entry => entry.value === "Исходное имя" || entry.value === "Ручное имя")!;
    input(name(), "Ручное имя");
    await render(<Page params={params} />);
    expect(name().value).toBe("Ручное имя");
    expect(flights.some(entry => entry.init?.method === "PATCH")).toBe(false);
    save();
    const failed = latest();
    expect(failed.init?.method).toBe("PATCH");
    const body = JSON.parse(String(failed.init?.body));
    expect(body.name).toBe("Ручное имя");
    if (label === "package") expect(body.lines).toEqual([{ itemId: "one", defaultQty: 3 }]);
    if (label === "collection") expect(body.itemIds).toEqual(["one"]);
    if (label === "catalog position") {
      expect(body.expectedUpdatedAt).toBe("2026-10-12T00:00:00.000Z");
      expect(body.pricePerDay).toBe(100);
      expect(body.purchasePricePerUnit).toBe(500);
      expect(body.categoryIds).toEqual(["one"]);
    }
    await respond(failed, { error: { message: "Не удалось сохранить черновик" } }, 409);
    expect(container.textContent).toContain("Не удалось сохранить черновик");
    save();
    expect(JSON.parse(String(latest().init?.body)).name).toBe("Ручное имя");
    await respond(latest(), {});
    const reload = latest();
    expect(reload.init?.method).toBeUndefined();
    await respond(reload, payload);
    expect(name().value).toBe("Исходное имя");
  });

  it("ignores old entity response after navigating to another id", async () => {
    await render(<Page params={Promise.resolve({ id: "one" })} />);
    const old = latest();
    await render(<Page params={Promise.resolve({ id: "two" })} />);
    const current = latest();
    expect(current.url).toContain("/two");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, payload);
    const name = [...container.querySelectorAll<HTMLInputElement>("input")].find(entry => entry.value === "Исходное имя")!;
    input(name, "Новый черновик");
    await respond(old, payload);
    expect(name.value).toBe("Новый черновик");
    expect(flights.some(entry => entry.init?.method === "PATCH" || entry.init?.method === "DELETE")).toBe(false);
  });

  it("does not load a protected form until authentication and role confirmation", async () => {
    const params = Promise.resolve({ id: "one" });
    auth.status = "loading";
    await render(<Page params={params} />);
    expect(flights).toHaveLength(0);
    auth.status = "authenticated"; auth.role = "GREENWICH";
    await render(<Page params={params} />);
    expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG";
    await render(<Page params={params} />);
    expect(flights.length).toBeGreaterThan(0);
  });
});
