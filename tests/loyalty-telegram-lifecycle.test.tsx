// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoyaltyPage from "@/app/admin/loyalty/page";
import TelegramPage from "@/app/admin/telegram/page";

const auth = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG", id: "one" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { role: auth.role, id: auth.id } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: ({ children, actions, tabs }: { children?: React.ReactNode; actions?: React.ReactNode; tabs?: React.ReactNode }) => <div>{actions}{tabs}{children}</div> }));
vi.mock("@/app/admin/loyalty/TeamRatingPanel", () => ({ TeamRatingPanel: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
const policy = { startingScore: 70, confirmationResponseReward: 1, repeatMissedPenalty: -1, finalMissedPenalty: -2, overduePenaltyPerDay: -1, overduePenaltyCap: -20, perfectReturnReward: 1, dirtyPenaltyPerUnit: -1, repairPenaltyPerUnit: -2, brokenPenaltyPerUnit: -4, lostPenaltyPerUnit: -6, incidentPenaltyCap: -20, approvalLeadDays: 14, approvalWarningDays: 3, approvalMissedPenalty: -1, reminderHourOmsk: 13, recoveryGraceDays: 7, recoveryDurationDays: 30, tiers: [{ id: "tier", name: "Старт", minScore: 0, discountPercent: 10, sortOrder: 0 }], updatedAt: "2026-10-12" };
const users = [{ id: "one", displayName: "Первый", isActive: true, hasTelegramChatId: true }, { id: "two", displayName: "Второй", isActive: true, hasTelegramChatId: true }];
const loyalty = { policy, users, leaderboard: [], offers: [], events: [], reminders: { counts: {}, recent: [] }, items: [] };
const telegram = (order = "first") => ({ telegram: { hasBotToken: false, warehouseChatId: null, warehouseTopicId: null, webhookUrl: null, webhookSecretConfigured: false }, greenwich: { activeUsers: 2, withTelegramChatId: 2, users }, scenarios: [], ratingPolicy: policy, liveConfirmation: { checkpoints: [], recent: [], orders: [{ id: order, eventName: order, customerName: "Клиент", status: "ISSUED", startDate: "2026-10-12", endDate: "2026-10-13", greenwichUserId: "two", greenwichUser: { id: "two", displayName: "Второй", hasTelegramChatId: true } }] } });
beforeEach(() => {
  auth.status = "authenticated"; auth.role = "WOWSTORG"; auth.id = "one";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render(Page: React.ComponentType) { act(() => root.render(<React.StrictMode><Page /></React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest() { return flights.filter(flight => flight.url !== "/api/admin/telegram/director").at(-1)!; }
function click(text: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; act(() => button.click()); }
function startingScore() { return [...container.querySelectorAll("label")].find(entry => entry.textContent?.includes("Стартовый рейтинг"))!.querySelector<HTMLInputElement>("input")!; }

describe("loyalty and Telegram read lifecycle", () => {
  it.each([LoyaltyPage, TelegramPage])("does not request admin information before warehouse authorization", Page => {
    auth.status = "loading"; render(Page); expect(flights).toHaveLength(0);
    auth.status = "authenticated"; auth.role = "GREENWICH"; render(Page); expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG"; render(Page); expect(flights.length).toBeGreaterThan(0);
  });

  it("preserves policy draft on unrelated render and failed POST, with explicit retry", async () => {
    render(LoyaltyPage); await respond(latest(), loyalty); click("Правила");
    act(() => { const field = startingScore(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "80"); field.dispatchEvent(new Event("input", { bubbles: true })); });
    render(LoyaltyPage); expect(startingScore().value).toBe("80");
    click("Сохранить правила"); const failed = latest();
    expect(JSON.parse(String(failed.init?.body)).policy.startingScore).toBe(80);
    await respond(failed, { error: { message: "Правила не сохранены" } }, 409);
    expect(startingScore().value).toBe("80");
    click("Сохранить правила"); expect(latest().init?.body).toBe(failed.init?.body);
    await respond(latest(), { ok: true });
    await respond(latest(), { ...loyalty, policy: { ...policy, startingScore: 80 } });
    expect(startingScore().value).toBe("80");
    expect(flights.some(entry => entry.url.includes("send"))).toBe(false);
  });

  it("chooses an eligible live recipient/order and ignores an aborted Telegram read", async () => {
    render(TelegramPage); const old = flights.find(flight => flight.url === "/api/admin/telegram")!;
    await respond(latest(), telegram()); await respond(old, telegram("stale"));
    const selects = container.querySelectorAll<HTMLSelectElement>("select");
    expect(selects[0]!.value).toBe("two"); expect(selects[1]!.value).toBe("first");
    expect(container.textContent).not.toContain("stale");
    click("Обновить статус"); const pending = latest();
    auth.status = "anonymous"; render(TelegramPage);
    expect(pending.init?.signal?.aborted).toBe(true);
    await respond(pending, telegram("late"));
    expect(container.textContent).not.toContain("late");
    expect(flights.some(entry => entry.init?.method === "POST" || entry.init?.method === "PATCH")).toBe(false);
  });
});
