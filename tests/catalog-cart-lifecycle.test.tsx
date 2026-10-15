// @vitest-environment jsdom

import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatalogPage from "@/app/catalog/page";
import CartPage from "@/app/cart/page";

const ctx = vi.hoisted(() => ({ query: "", status: "authenticated", role: "WOWSTORG", id: "one", router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: ctx.status, user: { role: ctx.role, id: ctx.id } } }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(ctx.query), useRouter: () => ctx.router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/cart/CartRelatedSuggestions", () => ({ CartRelatedSuggestions: () => null }));
vi.mock("@/app/catalog/CatalogMiniCart", () => ({ CatalogMiniCart: () => null }));
vi.mock("@/app/catalog/ItemModal", () => ({ ItemModal: () => null }));
vi.mock("@/app/catalog/CatalogDateField", () => ({ CatalogDateField: () => null }));
vi.mock("@/app/catalog/CatalogSchedule", () => ({ CatalogSchedule: ({ onChange }: { onChange: (patch: { startDate: string; endDate: string }) => void }) => <button onClick={() => onChange({ startDate: "2026-12-10", endDate: "2026-12-12" })}>Change period</button> }));
vi.mock("@/app/catalog/CatalogItemCard", () => ({ CatalogItemCard: ({ item, qtyInCart, onAdd }: { item: { id: string; name: string; pricePerDay: string }; qtyInCart: number; onAdd: (id: string, price: number) => void }) => <article><output>{item.name}:{qtyInCart}</output><button onClick={() => onAdd(item.id, Number(item.pricePerDay))}>Add {item.id}</button></article> }));

type Flight = { url: string; init?: RequestInit; resolve: (r: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
const item = (id = "item", cap = 5) => ({ id, name: `Product ${id}`, description: null, type: "BULK", pricePerDay: "100", photo1Key: null, photo2Key: null, total: 5, inRepair: 0, broken: 0, missing: 0, availability: { availableNow: 5, availableForDates: cap } });
const savedDates = { readyByDate: "2026-11-19", startDate: "2026-11-20", endDate: "2026-11-22", rentalStartPartOfDay: "EVENING", rentalEndPartOfDay: "MORNING" };
const storageKeys = { readyByDate: "catalog_readyByDate", startDate: "catalog_startDate", endDate: "catalog_endDate", rentalStartPartOfDay: "catalog_rentalStartPart", rentalEndPartOfDay: "catalog_rentalEndPart" };
function storeDates() { for (const [field, key] of Object.entries(storageKeys)) localStorage.setItem(key, savedDates[field as keyof typeof savedDates]); }
beforeEach(() => {
  ctx.query = ""; ctx.status = "authenticated"; ctx.role = "WOWSTORG"; ctx.id = "one"; ctx.router.replace.mockReset(); ctx.router.push.mockReset();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z")); localStorage.clear(); storeDates();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)); vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); });
function render(Page = CatalogPage) { act(() => root.render(<React.StrictMode><Page /></React.StrictMode>)); }
function latest(prefix = "/api/catalog/items?") { return flights.filter(f => f.url.startsWith(prefix)).at(-1)!; }
function params(f = latest()) { return Object.fromEntries(new URL(f.url, "https://test.invalid").searchParams); }
async function respond(f: Flight, body: unknown, status = 200) { await act(async () => f.resolve(new Response(JSON.stringify(body), { status }))); }
function click(text: string) { const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text); expect(button, text).toBeDefined(); act(() => button!.click()); }
function change(input: HTMLInputElement, value: string) { act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function stored(key = "cart") { return JSON.parse(localStorage.getItem(key) ?? "[]"); }

describe("catalog and cart scope ownership", () => {
  it.each([CatalogPage, CartPage])("hydrates the empty SSR snapshot before restoring a scoped draft", async Page => {
    localStorage.setItem("cart:quick:parent", JSON.stringify([{ itemId: "quick", qty: 2 }])); ctx.query = "quickParentId=parent";
    const errors: unknown[] = [];
    act(() => root.unmount()); container.innerHTML = renderToString(<Page />);
    await act(async () => { root = hydrateRoot(container, <Page />, { onRecoverableError: error => errors.push(error) }); });
    expect(errors).toEqual([]); expect(params()).toMatchObject(Page === CartPage ? { ids: "quick", excludeOrderId: "parent" } : { ids: "quick" });
    expect(stored("cart:quick:parent")[0].qty).toBe(2); expect(stored()).toEqual([]);
  });

  it.each([CatalogPage, CartPage])("uses an empty SSR snapshot and waits for authentication", Page => {
    expect(() => renderToString(<Page />)).not.toThrow(); expect(flights).toHaveLength(0);
    ctx.status = "loading"; render(Page); expect(flights).toHaveLength(0);
    ctx.status = "authenticated"; render(Page);
    expect(flights.length).toBeGreaterThan(0);
    ctx.status = "anonymous"; render(Page);
    expect(container.querySelector('input[type="search"]')).toBeNull();
  });

  it("loads saved catalog dates before any dated request or write", () => {
    render();
    expect(params()).toMatchObject({ startDate: savedDates.startDate, endDate: savedDates.endDate, rentalStartPartOfDay: "EVENING", rentalEndPartOfDay: "MORNING" });
    for (const [field, key] of Object.entries(storageKeys)) expect(localStorage.getItem(key)).toBe(savedDates[field as keyof typeof savedDates]);
  });
  it("keeps the explicitly selected warehouse preparation date at checkout", async () => {
    localStorage.setItem("catalog_readyByDate", "2026-11-16");
    localStorage.setItem("cart", JSON.stringify([{ itemId: "item", qty: 1 }]));
    render(CartPage); await respond(latest(), { items: [item()] });
    expect(container.querySelector('.cart-dateCell strong')?.textContent).toBe("16.11.2026");
    expect(localStorage.getItem("catalog_readyByDate")).toBe("2026-11-16");
  });

  it("adds once per event in StrictMode, accumulates rapid clicks and respects caps", async () => {
    render(); await respond(latest(), { items: [item("item", 2)] });
    const write = vi.spyOn(Storage.prototype, "setItem");
    const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Add item")!;
    act(() => { button.click(); button.click(); });
    expect(stored()).toEqual([{ itemId: "item", qty: 2, pricePerDay: 100 }]);
    expect(write.mock.calls.filter(call => call[0] === "cart")).toHaveLength(2);
    click("Add item"); expect(stored()[0].qty).toBe(2);
  });

  it("debounces catalog search and discards the previous result", async () => {
    render(); const old = latest();
    const search = container.querySelector<HTMLInputElement>('.mk-search')!;
    change(search, " lamp "); const count = flights.length;
    act(() => vi.advanceTimersByTime(249)); expect(flights).toHaveLength(count);
    act(() => vi.advanceTimersByTime(1)); const current = latest(); expect(params().query).toBe("lamp");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, { items: [item("new")] }); await respond(old, { items: [item("old")] });
    expect(container.textContent).toContain("Product new"); expect(container.textContent).not.toContain("Product old");
  });

  it("prefills confirmed project dates once and keeps a later user-selected period", async () => {
    ctx.query = "projectId=p"; render();
    const body = { project: { title: "Project", eventDateConfirmed: true, eventStartDate: "2026-12-01", eventEndDate: "2026-12-03" } };
    await respond(latest("/api/projects/p"), body);
    expect(params().startDate).toBe("2026-12-01");
    click("Change period"); expect(params().startDate).toBe("2026-12-10");
    await respond(latest("/api/projects/p"), body);
    expect(params().startDate).toBe("2026-12-10");
  });

  it("adds a kit atomically with the item cap and one storage write", async () => {
    render();
    await respond(latest("/api/catalog/kits"), { kits: [{ id: "kit", name: "Kit", description: null, lines: [{ defaultQty: 3, item: { id: "item", name: "Item" } }] }] });
    await respond(latest("/api/catalog/categories"), { categories: [] });
    await respond(latest(), { items: [item("item", 2)] });
    click("Пакеты");
    const write = vi.spyOn(Storage.prototype, "setItem");
    click("Добавить набор в корзину");
    expect(stored()).toEqual([{ itemId: "item", qty: 2, pricePerDay: 100 }]);
    expect(write.mock.calls.filter(call => call[0] === "cart")).toHaveLength(1);
  });

  it("isolates demo and dated project catalogs and never persists demo dates", async () => {
    localStorage.setItem("cart", JSON.stringify([{ itemId: "normal", qty: 4 }]));
    ctx.query = "projectId=p&projectMode=demo&estimateVersionId=v&returnTo=%2Fwork"; render();
    const draft = latest("/api/projects/p/draft-order");
    expect(params()).not.toHaveProperty("startDate");
    await respond(draft, { draftOrder: { lines: [{ itemId: "demo", qty: 2, pricePerDaySnapshot: 80 }] } });
    expect(stored("cart:project-demo:p")).toEqual([{ itemId: "demo", qty: 2, pricePerDay: 80 }]);
    expect(stored()[0].itemId).toBe("normal");
    ctx.query = "projectId=p"; render(); expect(params().startDate).toBe(savedDates.startDate);
    expect(localStorage.getItem("catalog_startDate")).toBe(savedDates.startDate);
    expect(stored("cart:project:p")).toEqual([]);
  });

  it("uses parent dates in quick mode without overwriting normal catalog preferences", async () => {
    ctx.query = "quickParentId=parent"; render();
    await respond(latest("/api/orders/parent/quick-supplement/parent"), { ...savedDates, startDate: "2026-10-10", endDate: "2026-10-20" });
    expect(params().startDate).toBe("2026-10-10"); expect(localStorage.getItem("catalog_startDate")).toBe(savedDates.startDate);
    expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("restores the cart and applies stock caps from the acknowledged response only", async () => {
    localStorage.setItem("cart", JSON.stringify([{ itemId: "item", qty: 4, pricePerDay: 100 }])); render(CartPage);
    expect(params()).toMatchObject({ ids: "item", startDate: savedDates.startDate, rentalStartPartOfDay: "EVENING" });
    await respond(latest(), { items: [item("item", 2)] });
    expect(stored()[0].qty).toBe(2);
    const qty = container.querySelector<HTMLInputElement>('input[aria-label="Количество"]')!; expect(qty.value).toBe("2");
    change(qty, ""); render(CartPage); expect(qty.value).toBe("");
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Уменьшить"]')!.click());
    expect(stored()[0].qty).toBe(1);
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Количество"]')!.value).toBe("");
  });

  it("keeps an unchanged quantity when the field is focused and blurred after restoring", async () => {
    localStorage.setItem("cart", JSON.stringify([{ itemId: "item", qty: 3 }])); render(CartPage);
    await respond(latest(), { items: [item()] });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Количество"]')!;
    act(() => { input.focus(); input.blur(); });
    expect(stored()[0].qty).toBe(3);
  });

  it("does not cap or persist a new cart from an old mode's late response", async () => {
    localStorage.setItem("cart", JSON.stringify([{ itemId: "normal", qty: 3 }]));
    localStorage.setItem("cart:quick:parent", JSON.stringify([{ itemId: "quick", qty: 4 }]));
    render(CartPage); const old = latest(); ctx.query = "quickParentId=parent"; render(CartPage);
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(old, { items: [item("normal", 0), item("quick", 0)] });
    expect(stored()[0].qty).toBe(3); expect(stored("cart:quick:parent")[0].qty).toBe(4);
    await respond(latest("/api/orders/parent/quick-supplement/parent"), savedDates);
    expect(params()).toMatchObject({ excludeOrderId: "parent", startDate: savedDates.startDate });
  });

  it("retains local demo quantities and server line metadata in the explicit save payload", async () => {
    ctx.query = "projectId=p&projectMode=demo&estimateVersionId=url-version";
    localStorage.setItem("cart:project-demo:p", JSON.stringify([{ itemId: "item", qty: 3, pricePerDay: 90 }])); render(CartPage);
    await respond(latest("/api/projects/p/draft-order"), { draftOrder: { id: "draft", estimateVersionId: "server-version", title: "Draft title", comment: "Client comment", lines: [{ id: "line", itemId: "item", qty: 1, plannedDays: 7, comment: "Line comment", periodGroup: "Group", pricePerDaySnapshot: 80 }] } });
    await respond(flights.filter(f => f.url === "/api/projects/p").at(-1)!, { project: { id: "p", title: "Project", customer: { id: "client", name: "Client" } } });
    await respond(latest(), { items: [item()] });
    expect(params()).not.toHaveProperty("startDate"); expect(stored("cart:project-demo:p")[0].qty).toBe(3);
    click("Сохранить demo-черновик"); const mutation = flights.at(-1)!;
    expect(mutation.init?.method).toBe("PATCH");
    expect(JSON.parse(mutation.init!.body as string)).toMatchObject({ estimateVersionId: "server-version", comment: "Client comment", lines: [{ id: "line", itemId: "item", qty: 3, plannedDays: 7, comment: "Line comment", periodGroup: "Group", pricePerDaySnapshot: 90 }] });
    await respond(mutation, {}, 409); expect(stored("cart:project-demo:p")[0].qty).toBe(3); expect(ctx.router.replace).not.toHaveBeenCalled();
  });
});
