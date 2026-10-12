// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProposalsPage from "@/app/proposals/page";

const navigation = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.search), useRouter: () => ({ push: navigation.push }) }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: "authenticated", user: { role: "WOWSTORG" } } }) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  navigation.search = "new=1&seedOfferId=offer&contractorId=contractor";
  navigation.push.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve) => flights.push({ url, init, resolve }))));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function render() { act(() => root.render(<React.StrictMode><ProposalsPage /></React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown) { await act(async () => flight.resolve(new Response(JSON.stringify(payload)))); }
function latest(url: string) { return flights.filter((entry) => entry.url === url).at(-1)!; }
function clickText(text: string) {
  const button = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.click());
}
function typeTitle() {
  const input = container.querySelector<HTMLInputElement>('input[name="title"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Корпоратив");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const offer = { id: "offer", title: "Звук и свет", priceType: "ON_REQUEST", clientPrice: null, category: { id: "equipment", name: "Оборудование" } };

describe("proposal list resource and seed lifecycle", () => {
  it("opens from URL, loads the seed and submits it only after explicit creation", async () => {
    render();
    expect(container.querySelector("form")).toBeTruthy();
    expect(container.textContent).toContain("Подготавливаем выбранную услугу");
    await respond(latest("/api/proposals?scope=all"), { proposals: [] });
    await respond(latest("/api/contractors/contractor"), { contractor: { name: "Дима", offers: [offer] } });
    expect(container.textContent).toContain("Звук и свет");
    expect(flights.some((entry) => entry.init?.method === "POST")).toBe(false);
    typeTitle();
    act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const creation = latest("/api/proposals");
    expect(JSON.parse(String(creation.init?.body))).toEqual({ title: "Корпоратив", seedOfferId: "offer" });
    await respond(creation, { proposal: { id: "draft" } });
    expect(navigation.push).toHaveBeenCalledWith("/proposals/draft");
  });

  it("can remove a seed without a write and creates an empty proposal afterwards", async () => {
    render();
    await respond(latest("/api/contractors/contractor"), { contractor: { name: "Дима", offers: [offer] } });
    clickText("Убрать услугу");
    expect(container.textContent).not.toContain("Звук и свет");
    typeTitle();
    act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(JSON.parse(String(latest("/api/proposals").init?.body))).toEqual({ title: "Корпоратив" });
  });

  it("does not fetch an invalid seed and allows explicitly starting without it", () => {
    navigation.search = "new=1&seedOfferId=missing";
    render();
    expect(container.textContent).toContain("Услуга не найдена");
    expect(flights.some((entry) => entry.url.startsWith("/api/contractors"))).toBe(false);
    clickText("Начать пустое КП");
    expect(container.textContent).not.toContain("Услуга не найдена");
    expect(flights.some((entry) => entry.init?.method === "POST")).toBe(false);
  });

  it("does not let an aborted scope response replace the new list", async () => {
    navigation.search = "";
    render();
    const old = latest("/api/proposals?scope=all");
    clickText("Без проекта");
    const current = latest("/api/proposals?scope=standalone");
    const proposal = { id: "one", title: "Новый список", status: "DRAFT", updatedAt: "2026-10-12T00:00:00Z", owner: { type: "STANDALONE", customer: null, leadCustomerName: null }, summary: { knownTotal: 0, preliminary: false, unresolvedCount: 0, variantCount: 1, sectionCount: 0 } };
    await respond(current, { proposals: [proposal] });
    await respond(old, { proposals: [{ ...proposal, title: "Устаревший список" }] });
    expect(container.textContent).toContain("Новый список");
    expect(container.textContent).not.toContain("Устаревший список");
  });
});
