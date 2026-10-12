// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "@/app/admin/analytics/page";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG", id: "one" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role, id: auth.id } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: ({ children, tabs }: { children?: React.ReactNode; tabs?: React.ReactNode }) => <div>{tabs}{children}</div> }));
vi.mock("@/app/admin/analytics/AnalyticsOverview", () => ({ AnalyticsOverview: ({ data }: { data: { marker: string } }) => <output>{data.marker}</output> }));
vi.mock("@/app/admin/analytics/AnalyticsSections", () => {
  const report = ({ data }: { data: { marker: string } }) => <output>{data.marker}</output>;
  return { AnalyticsDataQuality: ({ onDatesChanged }: { onDatesChanged: () => void }) => <button onClick={onDatesChanged}>Dates changed</button>, AnalyticsBonuses: report, AnalyticsCustomers: report, AnalyticsProjects: report, AnalyticsRequisites: report };
});
vi.mock("@/app/admin/analytics/AnalyticsReconciliation", () => ({ AnalyticsReconciliation: ({ scope }: { scope: { from: string; to: string } }) => <output>{scope.from}:{scope.to}</output> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
const july = { from: "2026-07-01", to: "2026-07-31" };
const august = { from: "2026-08-01", to: "2026-08-31" };
function storeScopes() { localStorage.setItem("wowstorg.analytics.scopes.v3", JSON.stringify({ overview: july, bonuses: august, reconciliation: august })); }
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "WOWSTORG"; auth.id = "one";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear(); flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); });
function render() { act(() => root.render(<React.StrictMode><AnalyticsPage /></React.StrictMode>)); }
async function respond(flight: Flight, marker: string, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify({ marker }), { status }))); }
function latest() { return flights.at(-1)!; }
function period(flight = latest()) { return Object.fromEntries(new URL(flight.url, "https://test.invalid").searchParams); }
function click(text: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; act(() => button.click()); }
function date(label: string, value: string) { const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }

describe("analytics scopes and request lifecycle", () => {
  it("migrates v2 from the overview period before requesting, keeping bonus and reconciliation independent", () => {
    localStorage.setItem("wowstorg.analytics.scopes.v2", JSON.stringify({ overview: july, customers: { from: "2026-01-01", to: "2026-01-31" }, bonuses: august, reconciliation: august }));
    render();
    expect(flights.length).toBeGreaterThan(0);
    expect(flights.every(flight => JSON.stringify(period(flight)) === JSON.stringify(july))).toBe(true);
    const saved = JSON.parse(localStorage.getItem("wowstorg.analytics.scopes.v3")!);
    for (const tab of ["overview", "customers", "projects", "requisites"]) expect(saved[tab]).toEqual(july);
    expect(saved.bonuses).toEqual(august); expect(saved.reconciliation).toEqual(august);
  });

  it("uses one acknowledged result across common tabs and caches independent periods", async () => {
    storeScopes(); render(); await respond(latest(), "July fact");
    const count = flights.length;
    for (const tab of ["Клиенты", "Проекты", "Реквизит"]) { click(tab); expect(container.textContent).toContain("July fact"); }
    expect(flights).toHaveLength(count);
    click("Бонусы"); expect(period()).toEqual(august); await respond(latest(), "August bonus");
    click("Обзор"); expect(container.textContent).toContain("July fact");
    expect(flights).toHaveLength(count + 1);
    click("Сверка"); expect(container.textContent).toContain("2026-08-01:2026-08-31");
    expect(flights).toHaveLength(count + 1);
  });

  it("preserves incomplete date input and sends no invalid period", async () => {
    storeScopes(); render(); await respond(latest(), "July fact");
    const before = flights.length;
    date("Начало периода", "");
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Начало периода"]')!.value).toBe("");
    expect(container.textContent).toContain("Укажите обе даты");
    expect(flights).toHaveLength(before);
    date("Начало периода", "2026-08-01");
    expect(flights).toHaveLength(before);
    date("Конец периода", "2026-08-31");
    expect(period()).toEqual(august);
    expect(JSON.parse(localStorage.getItem("wowstorg.analytics.scopes.v3")!).customers).toEqual(august);
  });

  it("does not publish an aborted response into a newer period and retries an HTTP failure explicitly", async () => {
    storeScopes(); render(); const old = latest();
    date("Конец периода", "2026-07-30"); const current = latest();
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, "New fact"); await respond(old, "Stale fact");
    expect(container.textContent).toContain("New fact"); expect(container.textContent).not.toContain("Stale fact");
    click("Обновить"); await respond(latest(), "Failure", 503);
    expect(container.textContent).toContain("Не удалось загрузить аналитику");
    click("Повторить"); await respond(latest(), "Retried fact");
    expect(container.textContent).toContain("Retried fact");
  });

  it("invalidates every cached period after a date correction", async () => {
    storeScopes(); render(); await respond(latest(), "July old");
    click("Бонусы"); await respond(latest(), "August old");
    click("Обзор"); click("Dates changed"); await respond(latest(), "July corrected");
    const count = flights.length;
    click("Бонусы"); expect(flights).toHaveLength(count + 1);
    expect(container.textContent).not.toContain("August old");
  });

  it("gates reads and discards the cache when authentication changes", async () => {
    storeScopes(); auth.status = "loading"; render(); expect(flights).toHaveLength(0);
    auth.status = "authenticated"; auth.role = "GREENWICH"; render(); expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG"; render(); await respond(latest(), "Private fact");
    auth.id = "two"; render();
    expect(container.textContent).not.toContain("Private fact");
    const pending = latest();
    auth.status = "anonymous"; render();
    expect(pending.init?.signal?.aborted).toBe(true);
    await respond(pending, "Other private fact");
    expect(container.textContent).not.toContain("Other private fact");
  });

  it("keeps only eight cached periods", async () => {
    storeScopes(); render(); await respond(latest(), "Original");
    for (let day = 1; day <= 9; day++) {
      date("Конец периода", `2026-07-${String(day).padStart(2, "0")}`);
      await respond(latest(), `Fact ${day}`);
    }
    const before = flights.length;
    date("Конец периода", "2026-07-01");
    expect(flights).toHaveLength(before + 1);
    expect(container.textContent).not.toContain("Fact 1");
  });
});
