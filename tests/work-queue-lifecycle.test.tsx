// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkQueuePage from "@/app/work/page";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/work/WorkQueueHeader", () => ({ WorkQueueHeader: ({ onCreate, tabs, metrics }: { onCreate: (kind: string) => void; tabs: React.ReactNode; metrics?: { value: number }[] }) => <div><button onClick={() => onCreate("project")}>New project</button>{tabs}<output data-testid="project-count">{metrics?.[0]?.value}</output></div> }));
vi.mock("@/app/work/WorkCreateDialog", () => ({ WorkCreateDialog: ({ customerField }: { customerField: React.ReactNode }) => <div role="dialog">{customerField}</div> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "WOWSTORG";
  vi.useFakeTimers(); localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function render() { act(() => root.render(<React.StrictMode><WorkQueuePage /></React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown) { await act(async () => flight.resolve(new Response(JSON.stringify(payload)))); }
function latest(prefix: string) { return flights.filter(entry => entry.url.startsWith(prefix)).at(-1)!; }
function input(element: HTMLInputElement, value: string) { act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
function click(text: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; act(() => button.click()); }
const payload = (projects: number) => ({ items: [], meta: { total: 0, projects, standaloneOrders: 0, estimates: 0, undated: 0, from: "2026-10-01", to: "2026-10-31" } });
const saved = { id: "one", name: "Архив сентября", view: "archive", kind: "project", phase: "DONE", from: "2026-09-01", to: "2026-09-30", sort: "amount" };

describe("work queue lifecycle", () => {
  it("gates queue and customer reads until the warehouse role is known", async () => {
    auth.status = "loading"; render(); expect(flights).toHaveLength(0);
    auth.status = "authenticated"; auth.role = "GREENWICH"; render(); expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG"; render();
    const queue = latest("/api/work-queue?");
    expect(latest("/api/customers")).toBeDefined();
    auth.status = "anonymous"; render();
    expect(queue.init?.signal?.aborted).toBe(true);
    await respond(queue, payload(99));
    expect(container.querySelector('[data-testid="project-count"]')!.textContent).toBe("");
  });

  it("debounces queue queries and ignores old aggregates after rapid filter changes", async () => {
    render(); await respond(latest("/api/work-queue?"), payload(1));
    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const count = flights.length;
    input(search, " клиент "); act(() => vi.advanceTimersByTime(249));
    expect(flights).toHaveLength(count);
    act(() => vi.advanceTimersByTime(1));
    const old = latest("/api/work-queue?");
    expect(new URL(old.url, "https://test.invalid").searchParams.get("q")).toBe("клиент");
    const select = container.querySelector<HTMLSelectElement>(".work-filters select")!;
    act(() => { select.value = "project"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const current = latest("/api/work-queue?");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, payload(2)); await respond(old, payload(99));
    expect(container.querySelector('[data-testid="project-count"]')!.textContent).toBe("2");
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
  });

  it("safely restores valid saved views, applies their exact scope and updates from another tab", () => {
    localStorage.setItem("wowstorg.work.saved-views.v1", JSON.stringify([null, { name: "Повреждённый вид" }, saved]));
    render();
    expect(container.textContent).toContain("Архив сентября");
    expect(container.textContent).not.toContain("Повреждённый вид");
    click("Архив сентября");
    const params = new URL(latest("/api/work-queue?").url, "https://test.invalid").searchParams;
    expect(Object.fromEntries(params)).toEqual({ view: "archive", kind: "project", phase: "DONE", from: "2026-09-01", to: "2026-09-30" });
    const count = flights.length;
    act(() => { localStorage.setItem("wowstorg.work.saved-views.v1", JSON.stringify([{ ...saved, name: "Внешний вид" }])); window.dispatchEvent(new StorageEvent("storage", { key: "wowstorg.work.saved-views.v1" })); });
    expect(container.textContent).toContain("Внешний вид");
    expect(container.textContent).not.toContain("Архив сентября");
    expect(flights).toHaveLength(count);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Удалить вид Внешний вид"]')!.click());
    expect(container.textContent).not.toContain("Внешний вид");
    expect(JSON.parse(localStorage.getItem("wowstorg.work.saved-views.v1")!)).toEqual([]);
  });

  it("resets the highlighted customer option before rendering a changed search", async () => {
    render();
    await respond(latest("/api/customers"), { customers: [{ id: "one", name: "Авангард" }, { id: "two", name: "Сбер" }] });
    click("New project");
    const customer = container.querySelector<HTMLInputElement>("#create-work-customer")!;
    input(customer, "А");
    act(() => customer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(customer.getAttribute("aria-activedescendant")).toBe("create-work-customer-options-0");
    input(customer, "Сб");
    expect(customer.hasAttribute("aria-activedescendant")).toBe(false);
    act(() => customer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    act(() => customer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(customer.value).toBe("Сбер");
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
  });
});
