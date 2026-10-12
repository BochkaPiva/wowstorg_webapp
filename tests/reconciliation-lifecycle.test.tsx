// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsReconciliation } from "@/app/admin/analytics/AnalyticsReconciliation";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function render(from = "2026-07-01") { act(() => root.render(<React.StrictMode><AnalyticsReconciliation scope={{ from, to: "2026-07-31" }} /></React.StrictMode>)); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest() { return flights.at(-1)!; }
function button(text: string) { return [...container.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; }
function click(text: string) { act(() => button(text).click()); }
function file() { const input = container.querySelector<HTMLInputElement>('input[type="file"]')!; act(() => { Object.defineProperty(input, "files", { configurable: true, value: [new File(["fixture"], "QA.xlsx", { lastModified: 1 })] }); input.dispatchEvent(new Event("change", { bubbles: true })); }); }
const totals = { revenue: 100, expenses: 20, profit: 80, bonusPool: 12 };
const preview = { fileName: "QA.xlsx", sheetName: "Лист", totals, matched: 0, conflicts: 0, unmatched: 1, rows: [{ rowNumber: 1, projectName: "Строка QA", ...totals, marginPercent: 80, matchStatus: "UNMATCHED", matchedEntityType: null, matchedEntityId: null, matchNote: null }] };

describe("financial reconciliation lifecycle", () => {
  it("loads only snapshots, ignores aborted StrictMode result and retries failed reads", async () => {
    render(); const old = flights[0]!;
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest(), { error: { message: "Не удалось прочитать снимки" } }, 503);
    expect(container.textContent).toContain("Не удалось прочитать снимки");
    click("Обновить снимки"); await respond(latest(), { batches: [], selected: null });
    await respond(old, { batches: [{ id: "old", title: "Устаревший снимок" }], selected: null });
    expect(container.textContent).not.toContain("Устаревший снимок");
    expect(flights.some(entry => entry.init?.method === "POST")).toBe(false);
  });

  it("binds preview to file/name/period and prohibits committing a changed context", async () => {
    render(); await respond(latest(), { batches: [], selected: null }); file();
    click("Проверить файл"); const request = latest();
    expect(request.init?.method).toBe("POST");
    const form = request.init?.body as FormData;
    expect(form.get("mode")).toBe("preview"); expect(form.get("from")).toBe("2026-07-01");
    render("2026-07-10"); await respond(request, { preview });
    expect(container.textContent).toContain("Строка QA");
    expect(container.textContent).toContain("Параметры изменились");
    expect(button("Сохранить снимок").disabled).toBe(true);
    expect(flights.filter(entry => entry.init?.method === "POST")).toHaveLength(1);
  });

  it("does not automatically repeat an unconfirmed commit", async () => {
    render(); await respond(latest(), { batches: [], selected: null }); file();
    click("Проверить файл"); await respond(latest(), { preview });
    click("Сохранить снимок");
    const commit = latest();
    expect((commit.init?.body as FormData).get("mode")).toBe("commit");
    await act(async () => commit.resolve(new Response("unconfirmed", { status: 502 })));
    expect(container.textContent).toContain("Сохранение не подтверждено");
    expect(button("Сохранить снимок").disabled).toBe(true);
    const posts = flights.filter(entry => entry.init?.method === "POST").length;
    render(); act(() => button("Сохранить снимок").click());
    expect(flights.filter(entry => entry.init?.method === "POST")).toHaveLength(posts);
    click("Обновить снимки");
    expect(latest().init?.method).toBeUndefined();
  });
});
