// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsPage from "@/app/projects/page";

const context = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG", id: "one", query: "", router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: context.status, user: { role: context.role, id: context.id } } }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(context.query), usePathname: () => "/projects", useRouter: () => context.router }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: ({ children, tabs, actions }: { children: React.ReactNode; tabs: React.ReactNode; actions: React.ReactNode }) => <div>{tabs}{actions}{children}</div> }));

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  context.status = "authenticated"; context.role = "WOWSTORG"; context.id = "one"; context.query = "";
  context.router.replace.mockReset(); context.router.push.mockReset();
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function render() { act(() => root.render(<React.StrictMode><ProjectsPage /></React.StrictMode>)); }
function latestList() { return flights.filter(f => f.url === "/api/projects" || f.url.startsWith("/api/projects?")).at(-1)!; }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function click(text: string) { const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text); expect(button, text).toBeDefined(); act(() => button!.click()); }
function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Найти проект"]')!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const project = (id: string) => ({ id, title: id, mode: "FULL", leadCustomerName: null, status: "LEAD", ball: "CLIENT", archivedAt: null, archiveNote: null, eventStartDate: null, eventEndDate: null, eventDateConfirmed: false, updatedAt: "2026-10-01", createdAt: "2026-10-01", customer: null, owner: { id: "one", displayName: "Owner" }, _count: { orders: 0 }, finance: { revenueTotal: 123, marginAfterTax: 100, marginAfterTaxPct: 81 } });

describe("projects list lifecycle", () => {
  it("waits for the warehouse role and discards results after logout", async () => {
    context.status = "loading"; render(); expect(flights).toHaveLength(0);
    context.status = "authenticated"; context.role = "GREENWICH"; render(); expect(flights).toHaveLength(0);
    context.role = "WOWSTORG"; render(); const pending = latestList();
    expect(flights.some(f => f.url.startsWith("/api/customers"))).toBe(true);
    context.status = "anonymous"; render(); expect(pending.init?.signal?.aborted).toBe(true);
    await respond(pending, { projects: [project("Private project")] });
    expect(container.textContent).not.toContain("Private project");
  });

  it("restores external URL filters together and suppresses old results", async () => {
    render(); const old = latestList();
    context.query = "tab=archive&q=September&sort=title_asc&stage=completion&ball=NONE"; render();
    const current = latestList();
    expect(Object.fromEntries(new URL(current.url, "https://test.invalid").searchParams)).toEqual({ archive: "1", q: "September", sort: "title_asc", stage: "completion", ball: "NONE" });
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, { projects: [project("New scope")] }); await respond(old, { projects: [project("Stale scope")] });
    expect(container.textContent).toContain("New scope"); expect(container.textContent).not.toContain("Stale scope");
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe("September");
  });

  it("debounces search for 320 ms and keeps newer input when its URL is acknowledged", async () => {
    render(); await respond(latestList(), { projects: [] }); const count = flights.length;
    search("One"); act(() => vi.advanceTimersByTime(319)); expect(flights).toHaveLength(count);
    act(() => vi.advanceTimersByTime(1)); expect(latestList().url).toBe("/api/projects?q=One");
    search("One more"); context.query = "q=One"; render();
    expect(container.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe("One more");
    act(() => vi.advanceTimersByTime(320)); expect(latestList().url).toBe("/api/projects?q=One+more");
    expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("shows the server error and retries only on an explicit action", async () => {
    render(); await respond(latestList(), { error: { message: "Unavailable" } }, 503);
    expect(container.textContent).toContain("Unavailable"); const count = flights.length;
    act(() => vi.advanceTimersByTime(5000)); expect(flights).toHaveLength(count);
    click("Повторить"); await respond(latestList(), { projects: [project("Recovered")] });
    expect(container.textContent).toContain("Recovered"); expect(container.textContent).not.toContain("Unavailable");
  });

  it("keeps the acknowledged local archive removal across unrelated renders", async () => {
    render(); await respond(latestList(), { projects: [project("Archive me")] });
    click("Завершить / отменить");
    const confirm = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Завершить и в архив");
    expect(confirm).toBeDefined(); act(() => confirm!.click());
    const mutation = flights.at(-1)!;
    expect(mutation.init?.method).toBe("PATCH");
    expect(JSON.parse(mutation.init!.body as string)).toEqual({ status: "COMPLETED", archive: true, archiveNote: null });
    await respond(mutation, { ok: true }); render();
    expect(container.textContent).not.toContain("Archive me");
    expect(container.textContent).toContain("Пока нет проектов");
    expect(flights.filter(f => f.init?.method)).toHaveLength(1);
  });
});
