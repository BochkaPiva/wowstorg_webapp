// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ProjectDraftOrderPanel } from "@/app/projects/[id]/ProjectDraftOrderPanel";
import { ProjectEventBuilderPanel } from "@/app/projects/[id]/ProjectEventBuilderPanel";
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("next/image", () => ({ default: ({ src, onError }: { src: string; onError: () => void }) => <button data-photo={src} onClick={onError}>photo</button> }));
type Flight = { url: string; init?: RequestInit; resolve: (r: Response) => void };
let flights: Flight[], root: Root, host: HTMLDivElement;
const draft = { id: "draft", title: "Draft", comment: "Comment", createdAt: "2026-10-13", updatedAt: "2026-10-13", lines: [{ id: "line", sortOrder: 0, itemId: "item", itemName: "Item", qty: 2, comment: null, periodGroup: "Group", pricePerDaySnapshot: 100, availableNow: 8, lastAvailableQty: null, lastAvailabilityNote: null }] };
const proposal = { id: "proposal", title: "Proposal", status: "DRAFT", revision: 10, variants: [{ id: "first", title: "First", isRecommended: false, sections: [{ id: "section", title: "Section", description: null, category: null, items: [] }] }, { id: "second", title: "Second", isRecommended: false, sections: [{ id: "other", title: "Other section", description: null, category: null, items: [] }] }] };
const contractor = { id: "contractor", name: "Vendor", shortDescription: null, photoUrl: "https://example.test/photo", offers: [{ id: "offer", title: "Offer", description: null, priceType: "FIXED", clientPrice: 100, internalCost: 20, clientPriceMax: null, unitLabel: "шт", priceConfirmedAt: null, category: { id: "category", name: "Category" } }] };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z")); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });
  vi.stubGlobal("matchMedia", () => ({ matches: true })); window.matchMedia = vi.fn(() => ({ matches: true } as MediaQueryList));
  flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render(kind: "draft" | "builder", projectId = "p", readOnly = false) { const Panel = kind === "draft" ? ProjectDraftOrderPanel : ProjectEventBuilderPanel; act(() => root.render(<React.StrictMode><Panel projectId={projectId} readOnly={readOnly} /></React.StrictMode>)); }
function latest(url: string, method = "GET") { return flights.filter(f => f.url === url && (f.init?.method ?? "GET") === method).at(-1)!; }
async function respond(f: Flight, body: unknown, status = 200) { expect(f).toBeDefined(); await act(async () => f.resolve(new Response(JSON.stringify(body), { status }))); }
function el<T extends HTMLElement>(selector: string) { const found = document.querySelector<T>(selector); expect(found, selector).not.toBeNull(); return found!; }
function input(target: HTMLInputElement, value: string) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, value); act(() => target.dispatchEvent(new Event("input", { bubbles: true }))); }
function click(text: string) { const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text); expect(button, text).toBeDefined(); act(() => button!.click()); }
async function resolveDraft(project = "p", title = "Draft") {
  await respond(latest(`/api/projects/${project}/draft-order`), { draftOrder: { ...draft, title } }); await respond(latest("/api/catalog/items"), { items: [] });
}
async function resolveBuilder(project = "p", data = proposal, vendors = [contractor]) {
  await respond(latest(`/api/projects/${project}/proposals`), { proposal: data }); await respond(latest("/api/contractor-categories"), { categories: [] }); await respond(latest("/api/contractors"), { contractors: vendors });
}

describe("demo order and legacy proposal lifecycle", () => {
  it("ignores old StrictMode demo/catalog responses and isolates project form scope", async () => {
    render("draft"); const old = flights.slice(0, 2); await resolveDraft(); input(el('input[placeholder="Например, Сцена / мебель / бренд-зона"]'), "Unsaved"); render("draft", "other");
    await resolveDraft("other", "Other"); await respond(old[0], { draftOrder: draft }); await respond(old[1], { items: [] });
    expect(old.every(f => f.init?.signal?.aborted)).toBe(true); expect(el<HTMLInputElement>('input[placeholder="Например, Сцена / мебель / бренд-зона"]').value).toBe("Other");
  });
  it("retains partial quantity and comment on a failed demo PATCH", async () => {
    render("draft"); await resolveDraft(); input(el('input[inputmode="numeric"]'), ""); input(el('input[placeholder="Описание / примечание"]'), "Keep me"); click("Сохранить demo-черновик");
    const save = latest("/api/projects/p/draft-order", "PATCH"); expect(JSON.parse(save.init!.body as string).lines[0]).toMatchObject({ qty: 1, comment: "Keep me", periodGroup: "Group" });
    await respond(save, { error: { message: "Rejected" } }, 503); expect(el<HTMLInputElement>('input[inputmode="numeric"]').value).toBe(""); expect(el<HTMLInputElement>('input[placeholder="Описание / примечание"]').value).toBe("Keep me");
  });
  it("seeds manual periods on entering the mode but preserves repeated selections and other field input", async () => {
    render("draft"); await resolveDraft(); click("Подтвердить даты"); click("Разбить по периодам");
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="date"]')]; expect(inputs[0].value).toBe("2026-10-13"); input(inputs[0], "2026-10-20"); input(inputs[1], "2026-10-21");
    click("Разбить по периодам"); expect(inputs[0].value).toBe("2026-10-20"); click("Закрыть"); click("Подтвердить даты"); expect(el<HTMLInputElement>('input[type="date"]').value).toBe("2026-10-13");
  });
  it("sends manual groups through materialize and preserves the period inputs on rejection", async () => {
    render("draft"); await resolveDraft(); click("Подтвердить даты"); click("Разбить по периодам"); input(el('input[type="date"]'), "2026-10-20");
    const buttons = [...document.querySelectorAll("button")]; const submit = buttons.find(b => /Создать.*заявк|Подтвердить и/.test(b.textContent ?? "")); expect(submit).toBeDefined(); act(() => submit!.click());
    const save = latest("/api/projects/p/draft-order/materialize", "POST"); expect(JSON.parse(save.init!.body as string).periods[0]).toMatchObject({ key: "Group", startDate: "2026-10-20", lineIds: ["line"] });
    await respond(save, { error: { message: "Dates rejected" } }, 409); expect(el<HTMLInputElement>('input[type="date"]').value).toBe("2026-10-20");
  });
  it("blocks materialization of an unsaved demo and never writes in read-only mode", async () => {
    render("draft"); await resolveDraft(); input(el('input[placeholder="Описание / примечание"]'), "Dirty"); click("Подтвердить даты");
    const submit = [...document.querySelectorAll("button")].find(b => /Создать.*заявк|Подтвердить и/.test(b.textContent ?? "")); expect(submit).toBeDefined(); act(() => submit!.click());
    expect(host.textContent).toContain("Сначала сохрани"); expect(flights.every(f => !f.init?.method)).toBe(true); render("draft", "other", true); await resolveDraft("other"); expect([...document.querySelectorAll("button")].some(b => b.textContent === "Подтвердить даты")).toBe(false);
  });
  it("matches legacy builder SSR/hydration and ignores cancelled initial responses", async () => {
    act(() => root.unmount()); host.innerHTML = renderToString(<ProjectEventBuilderPanel projectId="p" readOnly={false} />); const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(host, <React.StrictMode><ProjectEventBuilderPanel projectId="p" readOnly={false} /></React.StrictMode>, { onRecoverableError: e => errors.push(e) }); });
    const old = flights.slice(0, 3); await resolveBuilder(); await respond(old[0], { proposal: { ...proposal, title: "Stale" } }); await respond(old[1], { categories: [] }); await respond(old[2], { contractors: [] });
    expect(errors).toEqual([]); expect(host.textContent).toContain("Proposal"); expect(host.textContent).not.toContain("Stale");
  });
  it("selects a valid section synchronously when switching variants", async () => {
    render("builder"); await resolveBuilder(); click("Добавить подрядчика или услугуОткроется каталог с фото и ценами");
    expect(el<HTMLSelectElement>("select").value).toBe("section"); click("Second"); expect(el<HTMLSelectElement>("select").value).toBe("other");
    click("Добавить"); const save = latest("/api/projects/p/proposals/proposal/structure", "PATCH"); expect(JSON.parse(save.init!.body as string)).toMatchObject({ action: "ADD_CATALOG_ITEM", sectionId: "other", offerId: "offer", expectedRevision: 10 });
  });
  it("keeps a manual proposal draft after a rejected mutation", async () => {
    render("builder"); await resolveBuilder(); click("Добавить подрядчика или услугуОткроется каталог с фото и ценами"); click("+ Своя позиция"); input(el('[placeholder="Название своей позиции"]'), "Manual draft"); input(el('[placeholder="Цена клиенту"]'), "250");
    const add = [...document.querySelectorAll("button")].find(b => b.textContent === "Добавить"); act(() => add!.click());
    await respond(latest("/api/projects/p/proposals/proposal/structure", "PATCH"), { error: { message: "Manual rejected" } }, 503); expect(el<HTMLInputElement>('[placeholder="Название своей позиции"]').value).toBe("Manual draft"); expect(host.textContent).toContain("Manual rejected");
  });
  it("owns failed photo fallback by source and resets it only for a new source", async () => {
    render("builder"); await resolveBuilder(); click("Добавить подрядчика или услугуОткроется каталог с фото и ценами"); act(() => el<HTMLButtonElement>('[data-photo]').click());
    expect(host.querySelector("[data-photo]")).toBeNull(); input(el('[aria-label="Поиск в каталоге"]'), "Offer"); expect(host.querySelector("[data-photo]")).toBeNull();
    click("Дублировать вариант"); const failed = respond(latest("/api/projects/p/proposals/proposal/structure", "PATCH"), { error: { message: "Conflict" } }, 409);
    await failed; await resolveBuilder("p", proposal, [{ ...contractor, photoUrl: "https://example.test/other" }]);
    expect(el('[data-photo]').getAttribute("data-photo")).toBe("https://example.test/other");
  });
});
