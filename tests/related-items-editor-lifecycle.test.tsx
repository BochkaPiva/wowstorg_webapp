// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionRelatedItemsEditor } from "@/app/inventory/positions/PositionRelatedItemsEditor";

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function render(id = "one") { act(() => root.render(<React.StrictMode><PositionRelatedItemsEditor positionId={id} /></React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest() { return flights.at(-1)!; }
function type(value: string) {
  const input = container.querySelector<HTMLInputElement>("#pos-related-search")!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
function click(text: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; act(() => button.click()); }
const item = (id: string, name: string) => ({ id, name, isActive: true, internalOnly: false });
describe("related items draft and search lifecycle", () => {
  it("debounces real search, drops stale results immediately and filters self/existing relations locally", async () => {
    render(); await respond(latest(), { relations: [] });
    type("стол");
    const before = flights.length;
    act(() => vi.advanceTimersByTime(249));
    expect(flights).toHaveLength(before);
    act(() => vi.advanceTimersByTime(1));
    const old = latest();
    type("свет");
    expect(old.init?.signal?.aborted).toBe(true);
    expect(container.textContent).toContain("Поиск…");
    act(() => vi.advanceTimersByTime(250));
    await respond(latest(), { items: [item("one", "Сама позиция"), item("light", "Нужный свет")] });
    await respond(old, { items: [item("table", "Старый стол")] });
    expect(container.textContent).not.toContain("Старый стол");
    expect(container.textContent).not.toContain("Сама позиция");
    click("Нужный свет");
    expect(container.querySelector(".pos-edit-related-row-name")!.textContent).toBe("Нужный свет");
    type("свет");
    await respond(latest(), { items: [item("one", "Сама позиция"), item("light", "Нужный свет")] });
    // The newly added draft relation is excluded from the next search result.
    expect(container.querySelectorAll(".pos-edit-related-dropdown button")).toHaveLength(0);
    expect(container.querySelector(".pos-edit-related-dropdown")!.textContent).toContain("Ничего не найдено");
    expect(flights.some(entry => entry.init?.method === "PUT")).toBe(false);
  });

  it("retains unsaved relation after failed save and sends it again on explicit retry", async () => {
    render(); await respond(latest(), { relations: [] });
    type("свет"); act(() => vi.advanceTimersByTime(250));
    await respond(latest(), { items: [item("light", "Нужный свет")] });
    click("Нужный свет");
    render();
    click("Сохранить связи");
    const first = latest();
    expect(first.init?.method).toBe("PUT");
    expect(JSON.parse(String(first.init?.body))).toEqual({ relations: [{ relatedItemId: "light", kind: "RECOMMENDED", sortOrder: 0, defaultSuggestedQty: 1, note: null }] });
    await respond(first, { error: { message: "Повторите сохранение" } }, 500);
    expect(container.textContent).toContain("Повторите сохранение");
    expect(container.textContent).toContain("Нужный свет");
    click("Сохранить связи");
    expect(latest().init?.body).toBe(first.init?.body);
  });

  it("resets the editor identity and ignores old relations when another position opens", async () => {
    render("one"); const old = latest();
    type("черновик");
    render("two"); const current = latest();
    expect(container.querySelector<HTMLInputElement>("#pos-related-search")!.value).toBe("");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, { relations: [] });
    await respond(old, { relations: [{ relatedItemId: "late", kind: "REQUIRED", sortOrder: 0, defaultSuggestedQty: 2, note: null, relatedItem: item("late", "Старые связи") }] });
    expect(container.textContent).not.toContain("Старые связи");
    expect(flights.some(entry => entry.init?.method === "PUT")).toBe(false);
  });
});
