// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersPage from "@/app/admin/users/page";
import AdminQualityPage from "@/app/admin/quality/page";
import InventoryAuditAdminPage from "@/app/admin/inventory-audit/page";
import AdminCustomersPage from "@/app/admin/customers/page";
import AdminCleanupPage from "@/app/admin/order-cleanup/page";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: ({ children, actions }: { children?: React.ReactNode; actions?: React.ReactNode }) => <div>{actions}{children}</div> }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "WOWSTORG";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve) => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render(element: React.ReactNode) { act(() => root.render(<React.StrictMode>{element}</React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest(prefix: string) { return flights.filter((entry) => entry.url.startsWith(prefix)).at(-1)!; }
function clickText(text: string) {
  const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.click());
}
function changeSelect(label: string, value: string) {
  const input = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  act(() => { input.value = value; input.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("admin list lifecycle", () => {
  it("publishes customer directory and duplicate groups together, without triggering merges", async () => {
    render(<AdminCustomersPage />);
    await respond(latest("/api/customers?all=true"), { customers: [{ id: "one", name: "Проверенный заказчик" }] });
    expect(container.textContent).not.toContain("Проверенный заказчик");
    await respond(latest("/api/customers/merge"), { summary: { groups: 0, duplicateCards: 0 }, groups: [], history: [] });
    expect(container.textContent).toContain("Проверенный заказчик");
    expect(flights.some((entry) => entry.init?.method === "POST")).toBe(false);
  });

  it("cannot delete while the selected-set preview is pending or unavailable", async () => {
    render(<AdminCleanupPage />);
    const order = { id: "one", parentOrderId: null, projectId: null, status: "CLOSED", source: "WOWSTORG_EXTERNAL", startDate: "2026-10-07", endDate: "2026-10-13", customerName: "Клиент", eventName: "Проверка", totalAmount: 100 };
    await respond(latest("/api/admin/order-cleanup?"), { orders: [order], preview: null });
    clickText("Выбрать видимые");
    const pending = latest("/api/admin/order-cleanup?");
    const confirmation = container.querySelector<HTMLInputElement>('input[placeholder="DELETE"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(confirmation, "DELETE");
      confirmation.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const deletion = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === "Удалить заявки")!;
    expect(deletion.disabled).toBe(true);
    await respond(pending, { orders: [order], preview: { totalOrdersToDelete: 1, rootOrdersToDelete: 1, quickSupplementsToDelete: 0, linesCount: 0, returnSplitsCount: 0, incidentsCount: 0, remindersCount: 0, blockingProjectLinkedOrders: [] } });
    expect(deletion.disabled).toBe(false);
    expect(flights.some((entry) => entry.init?.method === "POST")).toBe(false);
  });
  const user = (id: string, name: string) => ({ id, displayName: name, login: id, role: "GREENWICH", telegramChatId: null, isActive: true, mustSetPassword: false, createdAt: "2026-10-12T00:00:00Z" });
  it("does not fetch user data before authentication or for a forbidden role", async () => {
    auth.status = "loading";
    render(<AdminUsersPage />);
    expect(flights).toHaveLength(0);
    auth.status = "authenticated";
    render(<AdminUsersPage />);
    await respond(latest("/api/admin/users"), { users: [user("one", "Первый коллега")] });
    expect(container.textContent).toContain("Первый коллега");
    const count = flights.length;
    auth.role = "GREENWICH";
    render(<AdminUsersPage />);
    expect(flights).toHaveLength(count);
    expect(container.textContent).not.toContain("Первый коллега");
  });

  it("loads only the chosen user's achievements and ignores a late response after closing", async () => {
    render(<AdminUsersPage />);
    await respond(latest("/api/admin/users"), { users: [user("one", "Первый"), user("two", "Второй")] });
    const edit = () => [...container.querySelectorAll("button")].filter((entry) => entry.textContent?.trim() === "Изменить");
    act(() => edit()[0]!.click());
    const old = latest("/api/admin/users/one/achievements");
    clickText("Отмена");
    act(() => edit()[1]!.click());
    const current = latest("/api/admin/users/two/achievements");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, { applicable: true, cards: [], unreadNotifications: 2 });
    await respond(old, { applicable: true, cards: [], unreadNotifications: 17 });
    expect(document.body.textContent).toContain("Непрочитанных уведомлений в приложении: 2");
    expect(document.body.textContent).not.toContain("Непрочитанных уведомлений в приложении: 17");
    expect(flights.some((entry) => entry.init?.method === "POST")).toBe(false);
  });

  it("resets quality pagination before dispatching a query for new filters", async () => {
    render(<AdminQualityPage />);
    const payload = { summary: { averageRating: 5, responseCount: 0, eligibleOrders: 0, responseRate: 0, lowRatings: 0, skipped: 0, distribution: [] }, feedback: [], pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 } };
    await respond(latest("/api/admin/quality"), payload);
    clickText("Раньше →");
    const old = latest("/api/admin/quality");
    expect(new URL(old.url, "https://test.invalid").searchParams.get("page")).toBe("2");
    changeSelect("Фильтр по оценке", "3");
    const current = latest("/api/admin/quality");
    const params = new URL(current.url, "https://test.invalid").searchParams;
    expect(params.get("page")).toBe("1");
    expect(params.get("rating")).toBe("3");
    expect(flights.some((entry) => { const p = new URL(entry.url, "https://test.invalid").searchParams; return p.get("rating") === "3" && p.get("page") === "2"; })).toBe(false);
    await respond(current, { ...payload, summary: { ...payload.summary, averageRating: 3 } });
    await respond(old, payload);
    expect(container.querySelector(".quality-average strong")!.textContent).toContain("3.00");
  });

  it("selects audit details without reloading the run list or showing previous-run items", async () => {
    render(<InventoryAuditAdminPage />);
    const runs = [{ id: "one", kind: "AUTO", severity: "OK", startedAt: "2026-10-12T00:00:00Z", finishedAt: null, summaryJson: null, errorText: null }, { id: "two", kind: "MANUAL", severity: "OK", startedAt: "2026-10-13T00:00:00Z", finishedAt: null, summaryJson: null, errorText: null }];
    await respond(latest("/api/admin/inventory-audit/runs?"), { rows: runs });
    const first = latest("/api/admin/inventory-audit/runs/one");
    const listRequests = flights.filter((entry) => entry.url.includes("runs?")).length;
    const item = (name: string) => ({ id: name, severity: "OK", item: { name }, actualJson: {}, expectedJson: {}, deltaJson: {}, explanationJson: null });
    await respond(first, { run: { itemResults: [item("Первый результат")] } });
    expect(container.textContent).toContain("Первый результат");
    const manual = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.includes("MANUAL"))!;
    act(() => manual.click());
    expect(container.textContent).not.toContain("Первый результат");
    expect(flights.filter((entry) => entry.url.includes("runs?")).length).toBe(listRequests);
    await respond(latest("/api/admin/inventory-audit/runs/two"), { run: { itemResults: [item("Второй результат")] } });
    expect(container.textContent).toContain("Второй результат");
    expect(flights.some((entry) => entry.init?.method === "POST")).toBe(false);
  });

  it("preserves legacy string error messages from the audit API", async () => {
    render(<InventoryAuditAdminPage />);
    await respond(latest("/api/admin/inventory-audit/runs?"), { error: "Аудит временно недоступен" }, 500);
    expect(container.textContent).toContain("Аудит временно недоступен");
  });
});
