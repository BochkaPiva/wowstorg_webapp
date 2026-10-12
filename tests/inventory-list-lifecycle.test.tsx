// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PositionsPage from "@/app/inventory/positions/page";
import WarehouseItemsPage from "@/app/inventory/warehouse-items/page";
import WarehouseLossesPage from "@/app/warehouse/losses/page";
import WarehouseRepairPage from "@/app/warehouse/repair/page";
import { IssuanceCalendar } from "@/app/home/IssuanceCalendar";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG" }));
const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "WOWSTORG";
  navigation.query = "";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render(element: React.ReactNode) { act(() => root.render(<React.StrictMode>{element}</React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown) { await act(async () => flight.resolve(new Response(JSON.stringify(payload)))); }
function latest() { return flights.at(-1)!; }
function params() { return new URL(latest().url, "https://test.invalid").searchParams; }
function input(element: HTMLInputElement, value: string) {
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!;
  act(() => button.click());
}
const item = (name: string) => ({ id: name, name, description: null, type: "BULK", isActive: true, internalOnly: true, pricePerDay: "10", purchasePricePerUnit: null, total: 5, inRepair: 0, broken: 0, missing: 0, photo1Key: null, categories: [], collections: [], updatedAt: "2026-10-12T00:00:00Z" });

describe("inventory list lifecycle", () => {
  it("submits position search explicitly and captures current input when visibility changes", async () => {
    render(<PositionsPage />);
    await respond(latest(), { items: [item("Первый список")] });
    const search = container.querySelector<HTMLInputElement>("#pos-list-search")!;
    const before = flights.length;
    input(search, " стол ");
    expect(flights).toHaveLength(before);
    act(() => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(params().get("query")).toBe("стол");
    const old = latest();
    input(search, " свет ");
    click("Внутренние");
    expect(params().get("query")).toBe("свет");
    expect(params().get("internalOnly")).toBe("true");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest(), { items: [item("Текущий список")] });
    await respond(old, { items: [item("Устаревший список")] });
    expect(container.textContent).toContain("Текущий список");
    expect(container.textContent).not.toContain("Устаревший список");
    const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"]')!;
    act(() => toggle.click());
    expect(params().get("includeInactive")).toBe("true");
    expect(params().get("query")).toBe("свет");
  });

  it("keeps warehouse filters as a draft until Find and preserves quantity CAS during refresh", async () => {
    render(<WarehouseItemsPage />);
    await respond(latest(), { items: [item("Расходник")] });
    const before = flights.length;
    input(container.querySelector<HTMLInputElement>('input[placeholder^="Например"]')!, " скотч ");
    act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(flights).toHaveLength(before);
    click("Найти");
    expect(params().get("query")).toBe("скотч");
    expect(params().get("includeInactive")).toBe("true");
    expect(params().get("internalOnly")).toBe("true");
    await respond(latest(), { items: [item("Расходник")] });
    expect(flights.some(entry => entry.init?.method === "PATCH")).toBe(false);
    const plus = container.querySelector<HTMLButtonElement>('button[title="Плюс 1 (докупили)"]')!;
    act(() => plus.click());
    const mutation = latest();
    expect(mutation.init?.method).toBe("PATCH");
    expect(JSON.parse(String(mutation.init?.body))).toEqual({ total: 6, expectedUpdatedAt: "2026-10-12T00:00:00Z" });
    await respond(mutation, {});
    expect(latest().init?.method).toBeUndefined();
    await respond(latest(), { items: [{ ...item("Расходник"), total: 6 }] });
    expect(container.querySelector('button[title="Изменить количество"]')!.textContent).toBe("6");
  });

  it("filters losses locally, never automatically writes them off, and refreshes after explicit found action", async () => {
    render(<WarehouseLossesPage />);
    const loss = { id: "loss", qty: 2, foundQty: 0, writtenOffQty: 0, remainingQty: 2, createdAt: "2026-10-12", item: { id: "one", name: "Утерянная стойка" } };
    await respond(latest(), { losses: [loss] });
    const before = flights.length;
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Поиск утерянного"]')!;
    input(search, "Нет совпадений");
    expect(container.textContent).not.toContain("Утерянная стойка");
    expect(flights).toHaveLength(before);
    input(search, "");
    input(container.querySelector<HTMLInputElement>('input[aria-label="Количество: Утерянная стойка"]')!, "1");
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
    click("Найдено");
    const mutation = latest();
    expect(mutation.url).toBe("/api/warehouse/losses/loss/found");
    expect(JSON.parse(String(mutation.init?.body))).toEqual({ qty: 1 });
    await respond(mutation, {});
    expect(latest().url).toBe("/api/warehouse/losses");
    await respond(latest(), { losses: [{ ...loss, foundQty: 1, remainingQty: 1 }] });
    expect(container.querySelector<HTMLInputElement>('input[aria-label^="Количество"]')!.value).toBe("");
    expect(flights.some(entry => entry.url.endsWith("/write-off"))).toBe(false);
  });

  it("replaces calendar data only with the selected year, even when old requests ignore abort", async () => {
    render(<IssuanceCalendar />);
    const old = latest();
    const select = container.querySelector("select")!;
    const year = Number(select.value) - 1;
    act(() => { select.value = String(year); select.dispatchEvent(new Event("change", { bubbles: true })); });
    const current = latest();
    expect(params().get("year")).toBe(String(year));
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, { year, days: {}, maxCount: 1, orderCount: 17 });
    await respond(old, { year: year + 1, days: {}, maxCount: 1, orderCount: 99 });
    expect(container.textContent).toContain("Учтено заявок в году: 17");
    expect(container.textContent).not.toContain("Учтено заявок в году: 99");
  });

  it("reads both repair sources atomically, resets open action on condition change and reads history without manual stock", async () => {
    navigation.query = "condition=BROKEN";
    render(<WarehouseRepairPage />);
    const latestUrl = (part: string) => flights.filter(entry => entry.url.includes(part)).at(-1)!;
    const manual = latestUrl("repair-items");
    const incidents = latestUrl("incidents");
    expect(manual.url).toContain("condition=BROKEN");
    await respond(manual, { items: [{ id: "manual", name: "Ручная поломка", qty: 2 }], discrepancies: [{ id: "one", name: "Для сверки", recorded: 1, linked: 2 }] });
    expect(container.textContent).not.toContain("Ручная поломка");
    await respond(incidents, { incidents: [] });
    expect(container.textContent).toContain("Ручная поломка");
    expect(container.textContent).toContain("Для сверки");
    click("Восстановить");
    expect(container.textContent).toContain("Вернуть в доступный остаток");
    click("Требует ремонта");
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Ручная поломка");
    const pendingManual = latestUrl("repair-items");
    const pendingIncidents = latestUrl("incidents");
    const count = flights.length;
    click("История заявок");
    expect(flights.length).toBe(count + 1);
    const history = latest();
    expect(history.url).toContain("status=CLOSED");
    await respond(history, { incidents: [] });
    await respond(pendingManual, { items: [{ id: "late", name: "Старая поломка", qty: 1 }] });
    await respond(pendingIncidents, { incidents: [] });
    expect(container.textContent).not.toContain("Старая поломка");
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
    navigation.query = "condition=BROKEN";
    render(<WarehouseRepairPage />);
    // Identical URL does not reset the user's local condition choice.
    expect(container.querySelector('button[aria-pressed="true"]')!.textContent).toBe("Требует ремонта");
    navigation.query = "condition=NEEDS_REPAIR";
    render(<WarehouseRepairPage />);
    navigation.query = "condition=BROKEN";
    render(<WarehouseRepairPage />);
    expect(latest().url).toContain("condition=BROKEN");
  });

  it.each([PositionsPage, WarehouseItemsPage, WarehouseLossesPage, WarehouseRepairPage])("gates protected inventory reads until role confirmation", Page => {
    auth.status = "loading";
    render(<Page />);
    expect(flights).toHaveLength(0);
    auth.status = "authenticated"; auth.role = "GREENWICH";
    render(<Page />);
    expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG";
    render(<Page />);
    expect(flights.length).toBeGreaterThan(0);
  });
});
