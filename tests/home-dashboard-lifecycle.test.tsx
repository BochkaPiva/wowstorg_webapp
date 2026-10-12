// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/home/page";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "GREENWICH" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/OrderServiceFeedback", () => ({ PendingOrderFeedbackCard: () => null }));
vi.mock("@/app/home/WowstorgIdleText", () => ({ WowstorgIdleText: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <span data-src={src}>{alt}</span> }));
vi.mock("next/dynamic", () => ({ default: () => function Launcher() { return <div data-testid="tower-launcher" />; } }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "GREENWICH";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render() { act(() => root.render(<React.StrictMode><HomePage /></React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest(url: string) { return flights.filter(entry => entry.url === url).at(-1)!; }
const operations = (title: string) => ({ today: [], upcomingDays: [], signals: [{ id: "signal", title, type: "ORDER_STAGE_STALE", severity: "warning", reason: "Проверить", href: "/orders/one", orderId: "one", entityKind: "order", canSnooze: true }], summary: { todayCount: 0, overdueCount: 0, signalCount: 1, nearestOrderTitle: null } });

describe("home dashboard lifecycle", () => {
  it("waits for authentication, gates game by actual activity and never revives old-role data", async () => {
    auth.status = "loading"; render(); expect(flights).toHaveLength(0);
    auth.status = "authenticated"; render();
    expect(container.querySelector('[data-testid="tower-launcher"]')).toBeNull();
    const old = latest("/api/dashboard/greenwich");
    for (const flight of flights.filter(entry => entry.url === "/api/dashboard/greenwich" && !entry.init?.signal?.aborted)) await respond(flight, { activeCount: 0, completedCount: 4, nearest: null });
    expect(container.querySelector('[data-testid="tower-launcher"]')).not.toBeNull();
    auth.role = "WOWSTORG"; render();
    await respond(old, { activeCount: 0, completedCount: 99, nearest: null });
    expect(container.querySelector('[data-testid="tower-launcher"]')).toBeNull();
    expect(container.textContent).not.toContain("Ближайшая заявка");
    const count = flights.length;
    auth.status = "anonymous"; render();
    expect(flights).toHaveLength(count);
    expect(container.textContent).not.toContain("Рабочий центр");
  });

  it("shows HTTP error instead of pretending the queue is empty or enabling the game", async () => {
    render();
    for (const flight of flights.filter(entry => entry.url === "/api/dashboard/greenwich" && !entry.init?.signal?.aborted)) await respond(flight, { error: { message: "Сводка временно недоступна" } }, 503);
    expect(container.textContent).toContain("Сводка временно недоступна");
    expect(container.textContent).not.toContain("Активных заявок пока нет");
    expect(container.querySelector('[data-testid="tower-launcher"]')).toBeNull();
  });

  it("keeps only the latest polling result without hiding the existing plan", async () => {
    auth.role = "WOWSTORG"; render();
    await respond(latest("/api/dashboard/wowstorg/operations"), operations("Начальный сигнал"));
    act(() => window.dispatchEvent(new Event("focus")));
    const old = latest("/api/dashboard/wowstorg/operations");
    act(() => window.dispatchEvent(new Event("focus")));
    const current = latest("/api/dashboard/wowstorg/operations");
    expect(container.textContent).toContain("Начальный сигнал");
    await respond(current, operations("Актуальный сигнал"));
    await respond(old, operations("Устаревший сигнал"));
    expect(container.textContent).toContain("Актуальный сигнал");
    expect(container.textContent).not.toContain("Устаревший сигнал");
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
  });

  it("does not resurrect a snoozed signal from a poll begun before the acknowledgement", async () => {
    auth.role = "WOWSTORG"; render();
    await respond(latest("/api/dashboard/wowstorg/operations"), operations("Отложенный сигнал"));
    act(() => window.dispatchEvent(new Event("focus")));
    const old = latest("/api/dashboard/wowstorg/operations");
    act(() => container.querySelector<HTMLButtonElement>('button[title="Отложить на 7 дней"]')!.click());
    const mutation = latest("/api/dashboard/wowstorg/order-attention");
    expect(mutation.init?.method).toBe("POST");
    expect(JSON.parse(String(mutation.init?.body))).toEqual({ orderId: "one", days: 7 });
    await respond(mutation, {});
    await respond(old, operations("Отложенный сигнал"));
    expect(container.textContent).not.toContain("Отложенный сигнал");
    expect(container.querySelector('.ops-metric[data-tone="attention"] strong')!.textContent).toBe("0");
  });
});
