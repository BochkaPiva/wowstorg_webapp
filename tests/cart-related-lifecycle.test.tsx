// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartRelatedSuggestions } from "@/app/cart/CartRelatedSuggestions";

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
const onAdd = vi.fn();
const props = { itemIds: ["source"], qtys: [1], startDate: "2026-10-12", endDate: "2026-10-13", rentalStartPartOfDay: "MORNING" as const, rentalEndPartOfDay: "EVENING" as const, onAdd };
const groups = (name = "Дополнение", id = "target") => [{ sourceItemId: "source", sourceItemName: "Основная позиция", sourcePhoto1Key: null, sourceQtyInCart: 1, suggestions: [{ relatedItemId: id, name, kind: "RECOMMENDED", note: null, suggestedQty: 3, pricePerDay: 100, photo1Key: null, availability: { availableNow: 9, availableForDates: 2 }, sourceItemNames: ["Основная позиция"] }] }];
beforeEach(() => {
  onAdd.mockClear(); localStorage.clear(); flights = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); });
function render(extra: Partial<React.ComponentProps<typeof CartRelatedSuggestions>> = {}) { act(() => root.render(<React.StrictMode><CartRelatedSuggestions {...props} {...extra} /></React.StrictMode>)); }
async function respond(flight: Flight, payload = groups()) { await act(async () => flight.resolve(new Response(JSON.stringify({ groups: payload })))); }
function latest() { return flights.at(-1)!; }
function click(text: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; act(() => button.click()); }

describe("recommendation request and dismiss lifecycle", () => {
  it("migrates legacy default preferences and isolates project/quick cart scope", async () => {
    localStorage.setItem("cartRelatedDismissed:default", JSON.stringify(["target"]));
    render(); await respond(latest());
    expect(container.textContent).not.toContain("Дополнение");
    expect(localStorage.getItem("cartRelatedDismissed:default")).toBeNull();
    expect(JSON.parse(localStorage.getItem("cartRelatedDismissed:cart")!)).toEqual(["target"]);
    render({ cartScope: "quick:one" });
    expect(container.textContent).toContain("Дополнение");
    click("Не нужно");
    expect(container.textContent).not.toContain("Дополнение");
    expect(JSON.parse(localStorage.getItem("cartRelatedDismissed:quick:one")!)).toEqual(["target"]);
    render({ cartScope: "project:two" });
    expect(container.textContent).toContain("Дополнение");
  });

  it("clears dismissals only when the same cart transitions from empty to a new composition", async () => {
    localStorage.setItem("cartRelatedDismissed:cart", JSON.stringify(["target"]));
    render(); await respond(latest()); expect(container.textContent).not.toContain("Дополнение");
    render({ itemIds: [], qtys: [] }); expect(container.textContent).toBe("");
    render(); await respond(latest());
    expect(container.textContent).toContain("Дополнение");
    expect(JSON.parse(localStorage.getItem("cartRelatedDismissed:cart")!)).toEqual([]);
    localStorage.setItem("cartRelatedDismissed:project:two", JSON.stringify(["target"]));
    render({ itemIds: [], qtys: [] });
    render({ cartScope: "project:two" }); await respond(latest());
    expect(container.textContent).not.toContain("Дополнение");
  });

  it("hides old availability immediately on period changes and ignores responses after disable", async () => {
    render(); const old = latest();
    render({ endDate: "2026-10-15", excludeOrderId: "parent" }); const current = latest();
    expect(old.init?.signal?.aborted).toBe(true);
    const params = new URL(current.url, "https://test.invalid").searchParams;
    expect(params.get("endDate")).toBe("2026-10-15"); expect(params.get("excludeOrderId")).toBe("parent");
    await respond(current, groups("Актуальное дополнение")); await respond(old, groups("Устаревшее дополнение"));
    expect(container.textContent).toContain("Актуальное дополнение");
    expect(container.textContent).not.toContain("Устаревшее дополнение");
    render({ endDate: "2026-10-16" }); const pending = latest();
    expect(container.textContent).not.toContain("Актуальное дополнение");
    render({ disabled: true }); const count = flights.length;
    await respond(pending); expect(container.textContent).toBe(""); expect(flights).toHaveLength(count);
  });

  it("preserves raw price/cap for explicit addition without automatically mutating orders", async () => {
    render({ displayMultiplier: 0.8 }); await respond(latest());
    expect(container.textContent).toContain("80 ₽/сут");
    click("+ 2"); expect(onAdd).toHaveBeenCalledWith("target", 2, 100, 2);
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
    click("Не нужно"); expect(container.textContent).not.toContain("Дополнение");
  });

  it("retains catalog drum dismiss/add behavior with the same persistent scope", async () => {
    render({ variant: "catalog", cartScope: "quick:one" }); await respond(latest());
    expect(container.textContent).toContain("Дополнение");
    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label^="Не показывать рекомендацию"]');
    expect(dismiss).toBeDefined(); act(() => dismiss!.click());
    expect(container.textContent).not.toContain("Дополнение");
    expect(JSON.parse(localStorage.getItem("cartRelatedDismissed:quick:one")!)).toEqual(["target"]);
  });
});
