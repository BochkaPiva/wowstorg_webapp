// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ProjectEstimatePanel } from "@/app/projects/[id]/ProjectEstimatePanel";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/app/catalog/CatalogRentalPeriodPicker", () => ({ CatalogRentalPeriodPicker: () => null }));

type Flight = { url: string; init?: RequestInit; resolve: (r: Response) => void };
let flights: Flight[];
let root: Root;
let container: HTMLDivElement;
let channels: TestChannel[];
class TestChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) { channels.push(this); }
  emit(revision: number) { this.onmessage?.({ data: { revision } } as MessageEvent); }
}
const line = (id = "line", name = "Line") => ({ id, position: 0, lineNumber: 1, name, description: null, lineType: "OTHER", costClient: "100", costInternal: "20", unit: "шт", qty: 1, unitPriceClient: 100, paymentMethod: null, paymentStatus: null, contractorNote: null, contractorRequisites: null, internalExpenses: [], customValues: {}, orderLineId: null, itemId: null });
const section = (id = "local", title = "Local") => ({ id, sortOrder: 10, title, kind: "LOCAL", linkedOrderId: null, lines: [line()] });
const finance = { clientSubtotal: 100, internalSubtotal: 20, cashInternalCostTax: 0, internalExpensesTotal: 20, commission: 0, clientChargeTax: 0, revenueTotal: 100, tax: 0, grossMargin: 80, marginAfterTax: 80, marginAfterTaxPct: 80 };
function payload(version = 1, name = "Line", revision = 10) {
  return { projectTitle: "Project", projectOrders: [], versions: [1, 2].map(n => ({ id: `version-${n}`, versionNumber: n, title: `Estimate ${n}`, note: null, isPrimary: n === 1, sortOrder: n, includeInProjectTotals: true, createdAt: "2026-10-13T00:00:00Z", createdBy: { displayName: "Owner" }, financials: finance })), current: { id: `version-${version}`, versionNumber: version, revision, title: `Estimate ${version}`, note: null, sortOrder: version, includeInProjectTotals: true, createdAt: "2026-10-13T00:00:00Z", commissionEnabled: false, clientTaxEnabled: false, clientChargeTaxEnabled: false, customColumns: [], sections: [{ ...section(), lines: [line("line", name)] }] } };
}
const path = (project = "p") => `/api/projects/${project}/estimate`;
const key = (project = "p", version = 1) => `project-estimate-draft:${project}:v${version}`;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z")); localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("FormData", window.FormData);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)); vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", undefined); channels = []; vi.stubGlobal("BroadcastChannel", TestChannel);
  vi.spyOn(window, "confirm").mockReturnValue(true); vi.spyOn(window, "alert").mockImplementation(() => {});
  flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render(project = "p", version?: number | null, props: Partial<React.ComponentProps<typeof ProjectEstimatePanel>> = {}) { act(() => root.render(<React.StrictMode><ProjectEstimatePanel projectId={project} readOnly={false} workspaceMode selectedVersionNumber={version} {...props} /></React.StrictMode>)); }
function latest(url = path(), method = "GET") { return flights.filter(f => f.url.split("?")[0] === url && (f.init?.method ?? "GET") === method).at(-1)!; }
async function respond(f: Flight, body: unknown, status = 200) { expect(f).toBeDefined(); await act(async () => f.resolve(new Response(JSON.stringify(body), { status }))); }
async function load(data = payload(), props: Partial<React.ComponentProps<typeof ProjectEstimatePanel>> = {}) { render("p", undefined, props); await respond(latest(), data); }
function element<T extends HTMLElement>(selector: string) { const result = container.querySelector<T>(selector); expect(result, selector).not.toBeNull(); return result!; }
function field(column = "name", id = "line") { return element<HTMLInputElement | HTMLTextAreaElement>(`[data-estimate-line="${id}"][data-estimate-column="${column}"]`); }
function input(target: HTMLInputElement | HTMLTextAreaElement, value: string) { const prototype = target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(target, value); target.dispatchEvent(new Event("input", { bubbles: true })); }
function change(column: string, value: string, id = "line") { act(() => input(field(column, id), value)); }
function click(selector: string) { act(() => element<HTMLButtonElement>(selector).click()); }
function clickText(text: string) { const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text); expect(result, text).toBeDefined(); act(() => result!.click()); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
function mutation(f = latest(path(), "PATCH")) { return JSON.parse(f.init!.body as string); }
const activeChannel = () => channels.filter(c => !c.close.mock.calls.length).at(-1)!;
function labeledInput(text: string) {
  const label = [...container.querySelectorAll("label")].find(l => l.textContent?.trim() === text && l.querySelector("input"));
  expect(label, text).toBeDefined(); return label!.querySelector<HTMLInputElement>("input")!;
}
function blur(target: HTMLInputElement) { act(() => target.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))); }
function demoPayload() {
  const data = payload();
  return { ...data, current: { ...data.current, sections: [section(), { ...section("demo", "Demo"), kind: "DRAFT_REQUISITE", linkedDraftOrderId: "draft", lines: [{ ...line("demo-line", "Demo item"), itemId: "item", plannedDays: 2, pricePerDaySnapshot: 50, maxQtyPhysical: 10 }] }] } };
}
function requisitePayload(orderId = "order") {
  const data = payload();
  return { ...data, current: { ...data.current, sections: [section(), { ...section("requ", "Requisite"), kind: "REQUISITE", linkedOrderId: orderId, lines: [{ ...line("saved"), lineType: "RENTAL", orderLineId: "order-line", itemId: "item" }] }] } };
}
const requisiteOrder = (id = "order") => ({ id, status: "SUBMITTED", source: "WOWSTORG", readyByDate: "2026-10-19", startDate: "2026-10-20", endDate: "2026-10-21", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING", eventName: "Requisite", comment: null, payMultiplier: 1, clientPaymentMethod: "CASH", deliveryEnabled: false, montageEnabled: false, demontageEnabled: false, lines: [{ id: "order-line", itemId: "item", requestedQty: 1, approvedQty: null, issuedQty: null, pricePerDaySnapshot: 100, payMultiplierSnapshot: 1, warehouseComment: null, item: { id: "item", name: "Stock item", type: "BULK", total: 10, inRepair: 0, broken: 0, missing: 0 } }] });
async function loadRequisite() {
  render(); await respond(latest(), requisitePayload()); await respond(latest("/api/orders/order"), { order: requisiteOrder() });
  const catalog = latest("/api/catalog/items");
  await respond(catalog, { items: [{ id: "item", name: "Stock item", total: 10, inRepair: 0, broken: 0, missing: 0, availability: { availableNow: 10, availableForDates: 3 } }] });
  const block = [...container.querySelectorAll<HTMLDetailsElement>("details.project-estimate-section")].at(-1)!;
  expect(block).toBeDefined(); act(() => { block.open = true; block.dispatchEvent(new Event("toggle")); }); return catalog;
}

describe("project estimate lifecycle", () => {
  it("keeps SSR/hydration consistent and ignores the cancelled StrictMode response", async () => {
    act(() => root.unmount()); container.innerHTML = renderToString(<ProjectEstimatePanel projectId="p" readOnly={false} workspaceMode />); expect(flights).toHaveLength(0);
    const errors: unknown[] = []; await act(async () => { root = hydrateRoot(container, <React.StrictMode><ProjectEstimatePanel projectId="p" readOnly={false} workspaceMode /></React.StrictMode>, { onRecoverableError: e => errors.push(e) }); });
    const old = flights[0]; await respond(latest(), payload()); if (old !== latest()) await respond(old, payload(1, "Stale"));
    expect(errors).toEqual([]); expect(field().value).toBe("Line"); expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("isolates project/version scope and cannot publish an old read or old history", async () => {
    render(); const old = latest(); render("other", 2); expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest(path("other")), payload(2, "Other")); await respond(old, payload()); expect(field().value).toBe("Other");
    change("name", "Edited"); expect(element<HTMLButtonElement>('[aria-label="Отменить последнее изменение"]').disabled).toBe(false);
    render("other", 1); await respond(latest(path("other")), payload(1, "First")); expect(field().value).toBe("First"); expect(element<HTMLButtonElement>('[aria-label="Отменить последнее изменение"]').disabled).toBe(true);
  });

  it("uses the latest same-frame draft for two cell edits and sends one autosave", async () => {
    await load(); act(() => { input(field("qty"), "2"); input(field("unitPriceClient"), "150"); }); await advance(1399);
    expect(flights.filter(f => f.init?.method === "PATCH")).toHaveLength(0); await advance(1);
    expect(mutation()).toMatchObject({ versionNumber: 1, saveMode: "AUTO", expectedRevision: 10, localSections: [{ lines: [{ qty: 2, unitPriceClient: 150, costClient: 300 }] }] });
    await respond(latest(path(), "PATCH"), { revision: 11 }); expect(container.textContent).toContain("Сохранено автоматически"); expect(localStorage.getItem(key())).toBeNull();
  });

  it("groups repeated typing in undo and clears redo when branching", async () => {
    await load(); change("name", "A"); change("name", "AB"); change("name", "ABC"); click('[aria-label="Отменить последнее изменение"]');
    expect(field().value).toBe("Line"); expect(element<HTMLButtonElement>('[aria-label="Отменить последнее изменение"]').disabled).toBe(true);
    click('[aria-label="Вернуть отменённое изменение"]'); expect(field().value).toBe("ABC"); click('[aria-label="Отменить последнее изменение"]'); change("name", "Branch");
    expect(element<HTMLButtonElement>('[aria-label="Вернуть отменённое изменение"]').disabled).toBe(true);
  });

  it("preserves edits made during an in-flight save and advances CAS for the next save", async () => {
    await load(); change("name", "First"); await advance(1400); const first = latest(path(), "PATCH"); change("name", "Latest");
    await respond(first, { revision: 11 }); expect(field().value).toBe("Latest"); expect(localStorage.getItem(key())).not.toBeNull(); await advance(1400);
    const next = latest(path(), "PATCH"); expect(next).not.toBe(first); expect(mutation(next)).toMatchObject({ expectedRevision: 11, localSections: [{ lines: [{ name: "Latest" }] }] });
    await respond(next, { revision: 12 }); expect(localStorage.getItem(key())).toBeNull(); expect(activeChannel().postMessage).toHaveBeenLastCalledWith({ revision: 12 });
  });

  it("blocks automatic rebase on a server conflict and retains the local copy", async () => {
    await load(); change("name", "Local"); await advance(1400); await respond(latest(path(), "PATCH"), { error: { message: "CAS conflict" } }, 409); await advance(5000);
    expect(flights.filter(f => f.init?.method === "PATCH")).toHaveLength(1); expect(field().value).toBe("Local"); expect(container.textContent).toContain("Конфликт версий");
    expect(JSON.parse(localStorage.getItem(key())!).sections[0].lines[0].name).toBe("Local");
  });

  it("detects a cross-tab conflict in the same frame as a user edit", async () => {
    await load(); const before = flights.length; act(() => { input(field(), "Local"); activeChannel().emit(11); });
    expect(flights).toHaveLength(before); expect(container.textContent).toContain("Конфликт версий"); await advance(5000); expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("refreshes a clean tab and ignores an older parallel refresh", async () => {
    await load(); act(() => activeChannel().emit(11)); const old = latest(); act(() => window.dispatchEvent(new Event("project-activity-refresh"))); const current = latest();
    await respond(current, payload(1, "Current", 12)); await respond(old, payload(1, "Older", 11)); expect(field().value).toBe("Current");
    expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("recovers a stored draft but does not auto-delete every saved section", async () => {
    const saved = { schemaVersion: 7, versionNumber: 1, sections: [{ ...section(), lines: [{ ...line(), name: "Recovered", qty: "1", unitPriceClient: "100" }] }], customColumns: [], commissionEnabled: false, clientTaxEnabled: false, clientChargeTaxEnabled: false };
    localStorage.setItem(key(), JSON.stringify(saved)); await load(); expect(field().value).toBe("Recovered"); await advance(1400); expect(mutation().localSections[0].lines[0].name).toBe("Recovered");
  });

  it("discards a destructive empty stored draft and requires explicit confirmation for deletion", async () => {
    localStorage.setItem(key(), JSON.stringify({ schemaVersion: 7, versionNumber: 1, sections: [] })); await load(); expect(field().value).toBe("Line"); expect(localStorage.getItem(key())).toBeNull();
    click('[aria-label="Удалить раздел"]'); await advance(1400); expect(flights.every(f => !f.init?.method)).toBe(true); expect(container.textContent).toContain("Локальный черновик");
    clickText("Загрузить с сервера"); await respond(latest(), payload()); expect(field().value).toBe("Line"); expect(element<HTMLButtonElement>('[aria-label="Отменить последнее изменение"]').disabled).toBe(true);
  });

  it("does not autosave an unnamed newly inserted row", async () => {
    await load(); click('[aria-label="Выбрать строку 1"]'); clickText("Строка ниже"); await advance(1400);
    expect(flights.every(f => !f.init?.method)).toBe(true); expect(container.textContent).toContain("Локальный черновик"); expect(container.querySelectorAll('[data-estimate-grid-row]')).toHaveLength(2);
  });

  it("prunes deleted row selection without losing selection on unrelated renders", async () => {
    const data = payload(); data.current.sections[0].lines.push(line("second", "Second")); await load(data); click('[aria-label="Выбрать строку 1"]');
    change("name", "Second edited", "second"); expect(container.textContent).toContain("Выбрано: 1"); click('[aria-label="Удалить строку 1"]');
    expect(container.textContent).not.toContain("Выбрано:"); expect(container.querySelectorAll('[data-estimate-grid-row]')).toHaveLength(1);
  });

  it("keeps read-only estimates free of writes even with recovered draft data", async () => {
    localStorage.setItem(key(), JSON.stringify({ schemaVersion: 7, versionNumber: 1, sections: [{ ...section(), lines: [{ ...line(), name: "Recovered", qty: "1", unitPriceClient: "100" }] }] }));
    await load(payload(), { readOnly: true }); await advance(5000); expect(container.textContent).toContain("Recovered"); expect(container.querySelector('[aria-label="Отменить последнее изменение"]')).toBeNull();
    expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("loads standalone estimates from their own API without project CAS fields", async () => {
    render("standalone", undefined, { standalone: true, apiBase: "/api/standalone-estimates/standalone" }); await respond(latest("/api/standalone-estimates/standalone/estimate"), payload());
    change("name", "Independent"); await advance(1400); const body = mutation(latest("/api/standalone-estimates/standalone/estimate", "PATCH"));
    expect(body).not.toHaveProperty("expectedRevision"); expect(body).not.toHaveProperty("customColumns"); expect(body.localSections[0].lines[0].name).toBe("Independent"); expect(channels).toHaveLength(0);
  });

  it("keeps edits after a failed save and retries manually with current CAS", async () => {
    await load(); change("name", "Unsaved"); await advance(1400); await respond(latest(path(), "PATCH"), { error: { message: "Unavailable" } }, 503);
    expect(container.textContent).toContain("Не сохранено"); expect(field().value).toBe("Unsaved"); await advance(5000); expect(flights.filter(f => f.init?.method === "PATCH")).toHaveLength(1);
    clickText("Повторить"); expect(mutation()).toMatchObject({ expectedRevision: 10, saveMode: "MANUAL" }); await respond(latest(path(), "PATCH"), { revision: 11 });
    expect(container.textContent).toContain("Сохранено автоматически");
  });

  it("retains an open section title draft across unrelated grid edits", async () => {
    await load(); click('button[title="Нажмите, чтобы переименовать"]');
    act(() => input(element<HTMLInputElement>('[aria-label="Название раздела"]'), "New title")); change("qty", "2");
    expect(element<HTMLInputElement>('[aria-label="Название раздела"]').value).toBe("New title");
    blur(element('[aria-label="Название раздела"]')); await advance(1400);
    expect(mutation().localSections[0]).toMatchObject({ title: "New title", lines: [{ qty: 2 }] });
  });

  it("preserves demo partial input and a failed save across copied parent props", async () => {
    render(); await respond(latest(), demoPayload()); await respond(latest("/api/catalog/items"), { items: [] });
    await respond(latest("/api/projects/p"), { project: {} });
    act(() => input(labeledInput("Дней"), "")); change("name", "Parent changed");
    expect(labeledInput("Дней").value).toBe(""); act(() => input(labeledInput("Дней"), "3"));
    clickText("Сохранить demo"); const save = latest("/api/projects/p/draft-order", "PATCH");
    expect(mutation(save).lines[0]).toMatchObject({ qty: 1, plannedDays: 3, pricePerDaySnapshot: 50 });
    await respond(save, { error: { message: "Demo rejected" } }, 503); change("qty", "2");
    expect(container.textContent).toContain("Demo rejected"); expect(labeledInput("Дней").value).toBe("3");
  });

  it("keeps requisite units/partial quantity through parent edits and respects dated stock caps", async () => {
    const catalog = await loadRequisite(); const url = new URL(catalog.url, "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ startDate: "2026-10-20", endDate: "2026-10-21", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING", excludeOrderId: "order" });
    act(() => { input(labeledInput("Ед."), "компл"); input(labeledInput("Кол-во"), ""); }); change("name", "Parent changed");
    expect(labeledInput("Ед.").value).toBe("компл"); expect(labeledInput("Кол-во").value).toBe("");
    act(() => input(labeledInput("Кол-во"), "99")); blur(labeledInput("Кол-во")); expect(labeledInput("Кол-во").value).toBe("3");
    blur(labeledInput("Ед.")); const save = latest("/api/projects/p/estimate/sections/requ", "PATCH");
    expect(mutation(save)).toMatchObject({ lineLocalExtras: { "order-line": { unit: "компл" } } });
    await respond(save, { error: { message: "Unit rejected" } }, 503); expect(labeledInput("Ед.").value).toBe("компл");
    expect(container.textContent).toContain("Unit rejected");
  });

  it("aborts a linked order read on project changes without publishing its dependent catalog", async () => {
    render(); await respond(latest(), requisitePayload()); const old = latest("/api/orders/order"); render("other");
    expect(old.init?.signal?.aborted).toBe(true); await respond(latest(path("other")), payload()); await respond(old, { order: requisiteOrder() });
    expect(flights.filter(f => f.url.includes("excludeOrderId=order"))).toHaveLength(0); expect(container.textContent).not.toContain("Stock item");
  });

  it("does not let a completed save from an unmounted version erase its recovered journal", async () => {
    await load(); change("name", "Pending"); await advance(1400); const pending = latest(path(), "PATCH");
    render("p", 2); await respond(latest(), payload(2, "Version two")); render("p", 1); await respond(latest(), payload());
    expect(field().value).toBe("Pending"); change("name", "Recovered newer draft"); const stored = localStorage.getItem(key());
    await respond(pending, { revision: 11 }); expect(localStorage.getItem(key())).toBe(stored); expect(field().value).toBe("Recovered newer draft");
  });
});
