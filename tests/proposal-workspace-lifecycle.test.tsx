// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ProposalWorkspace } from "@/app/proposals/ProposalWorkspace";
import type { Proposal, ProposalItem } from "@/lib/proposals";
import type { ProposalRecovery } from "@/lib/proposal-recovery";

const auth = vi.hoisted(() => ({ status: "authenticated", id: "actor", role: "WOWSTORG" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: auth.status, user: { id: auth.id, role: auth.role } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
// A click explicitly delivers Image's error callback; jsdom does not load images.
vi.mock("next/image", () => ({ default: ({ src, alt, onError }: { src: string; alt: string; onError: React.ReactEventHandler }) => <span role="img" data-src={src} aria-label={alt} onClick={event => { event.stopPropagation(); onError(event); }} /> }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div> }));
vi.mock("@/app/proposals/ProposalExportPanel", () => ({ ProposalExportPanel: ({ revision }: { revision: number }) => <div data-export-revision={revision} /> }));

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let flights: Flight[];
let root: Root;
let container: HTMLDivElement;
const category = { id: "equipment", name: "Equipment" };
const baseItem: ProposalItem = { id: "existing", offerId: "existing-offer", selectionRole: "PRIMARY", qty: 1, clientUnitPrice: 100, internalUnitCost: 20, priceTypeSnapshot: "FIXED", unitLabel: "шт.", contractorNameSnapshot: "Existing contractor", offerTitleSnapshot: "Existing service", offerDescriptionSnapshot: "Description", clientNote: "Keep note", assetSnapshot: [{ url: "/old.png" }] };
function model(id = "p", revision = 10): Proposal { return { id, revision, title: `Proposal ${id}`, status: "DRAFT", clientIntro: "Intro", clientOutro: null, owner: { type: "STANDALONE", customer: null, leadCustomerName: null, convertedAt: null }, variants: [{ id: "v", title: "Main", isRecommended: true, sections: [{ id: "s", title: "Equipment", category, items: [{ ...baseItem }] }, { id: "s2", title: "Hosts", category: { id: "hosts", name: "Hosts" }, items: [] }] }] }; }
const contractor = (id = "one", title = "Catalog service") => ({ id, name: `Contractor ${id}`, photoUrl: "/catalog.png", offers: [{ id: `offer-${id}`, title, description: "Catalog description", clientPrice: 300, clientPriceMax: null, priceType: "FIXED", unitLabel: "шт.", priceConfirmedAt: "2026-10-13", category }] });
const key = (actor = "actor", id = "p") => `wowstorg:proposal-recovery:v1:${actor}:${id}`;
function journal(patch: Partial<ProposalRecovery> = {}): ProposalRecovery { return { version: 1, revision: 10, savedAt: "2026-10-13", variantId: "v", sectionId: "s", drawer: null, sectionFields: null, undo: [], redo: [], pending: null, queued: [], ...patch }; }
beforeEach(() => {
  auth.status = "authenticated"; auth.id = "actor"; auth.role = "WOWSTORG";
  vi.useFakeTimers(); localStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("FormData", window.FormData);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0)); vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(HTMLElement.prototype, "showPopover", { configurable: true, value() { this.setAttribute("data-test-popover", ""); } });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", { configurable: true, value() { this.removeAttribute("data-test-popover"); } });
  const matches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (this: HTMLElement, selector) { return selector === ":popover-open" ? this.hasAttribute("data-test-popover") : matches.call(this, selector); });
  flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render(id = "p", embedded = false) { act(() => root.render(<React.StrictMode><ProposalWorkspace proposalId={id} embedded={embedded} /></React.StrictMode>)); }
function latest(path: string, method = "GET") { return flights.filter(f => f.url.split("?")[0] === path && (f.init?.method ?? "GET") === method).at(-1)!; }
async function respond(f: Flight, body: unknown, status = 200) { expect(f).toBeDefined(); await act(async () => f.resolve(new Response(JSON.stringify(body), { status }))); }
async function load(proposal = model()) { render(proposal.id); await respond(latest(`/api/proposals/${proposal.id}`), { proposal }); await respond(latest("/api/contractor-categories"), { categories: [category, { id: "hosts", name: "Hosts" }] }); }
function element<T extends HTMLElement>(selector: string) { const value = container.querySelector<T>(selector); expect(value, selector).not.toBeNull(); return value!; }
function click(selector: string) { act(() => element<HTMLButtonElement>(selector).click()); }
function clickText(text: string) { const value = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text); expect(value, text).toBeDefined(); act(() => value!.click()); }
function change(selector: string, value: string) { act(() => { const target = element<HTMLInputElement | HTMLTextAreaElement>(selector); Object.getOwnPropertyDescriptor(target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(target, value); target.dispatchEvent(new Event("input", { bubbles: true })); }); }
function submit() { act(() => element<HTMLFormElement>('[role="dialog"] form').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
function command(f = latest("/api/proposals/p/mutations", "POST")) { return JSON.parse(f.init!.body as string); }
async function catalog(rows = [contractor()], cursor: string | null = null, section = "Equipment") { click(`button[aria-label="Подобрать услуги: ${section}"]`); await respond(latest("/api/contractors"), { contractors: rows, nextCursor: cursor }); }
function selectOffer(id = "one") { click(`input[aria-label="Выбрать ${id === "one" ? "Catalog service" : "Other service"} — Contractor ${id}"]`); }
function created(proposal: Proposal, id = "created") { const next = structuredClone(proposal); next.revision += 1; next.variants[0].sections[0].items.push({ ...baseItem, id, offerId: "offer-one", offerTitleSnapshot: "Catalog service", contractorNameSnapshot: "Contractor one", clientUnitPrice: 300, assetSnapshot: [{ url: "/catalog.png" }] }); return next; }

describe("proposal workspace lifecycle", () => {
  it("hydrates consistently and does not fetch or read recovery before authorization", async () => {
    auth.status = "loading"; act(() => root.unmount()); container.innerHTML = renderToString(<ProposalWorkspace proposalId="p" />); const errors: unknown[] = [];
    const read = vi.spyOn(Storage.prototype, "getItem"); await act(async () => { root = hydrateRoot(container, <ProposalWorkspace proposalId="p" />, { onRecoverableError: error => errors.push(error) }); });
    expect(errors).toEqual([]); expect(flights).toHaveLength(0); expect(read).not.toHaveBeenCalled(); auth.status = "authenticated"; auth.role = "GREENWICH"; render(); expect(flights).toHaveLength(0);
    auth.role = "WOWSTORG"; render(); expect(latest("/api/proposals/p")).toBeDefined(); auth.status = "anonymous"; render(); expect(latest("/api/proposals/p").init?.signal?.aborted).toBe(true);
  });

  it("isolates proposal and actor scopes and ignores cancelled GET results", async () => {
    render(); const old = latest("/api/proposals/p"); render("next", true); expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest("/api/proposals/next"), { proposal: model("next") }); await respond(old, { proposal: model() });
    expect(container.textContent).toContain("Proposal next"); expect(container.textContent).not.toContain("Proposal p"); expect(container.querySelector("[data-shell]")).toBeNull();
    auth.id = "other"; render("next", true); expect(container.querySelector("[data-proposal-workspace]")?.textContent).not.toContain("Proposal next");
  });

  it("recovers fields only on explicit action without server writes", async () => {
    localStorage.setItem(key(), JSON.stringify(journal({ drawer: { kind: "document", fields: { title: "Local title", intro: "Local intro" } } })));
    await load(); expect(container.textContent).toContain("Есть локальная копия"); expect(container.querySelector('[role="dialog"]')).toBeNull();
    clickText("Восстановить поля"); expect(element<HTMLInputElement>('[role="dialog"] input[name="title"]').value).toBe("Local title");
    expect(element<HTMLTextAreaElement>('[role="dialog"] textarea[name="intro"]').value).toBe("Local intro"); expect(flights.every(f => f.init?.method === "GET")).toBe(true);
  });

  it("does not overwrite a newer server revision with a local journal", async () => {
    localStorage.setItem(key(), JSON.stringify(journal({ drawer: { kind: "document", fields: { title: "Old draft" } } })));
    await load(model("p", 11)); expect(container.textContent).toContain("На сервере новая версия");
    expect([...container.querySelectorAll("button")].some(b => b.textContent === "Восстановить поля")).toBe(false); clickText("Оставить серверную версию");
    expect(localStorage.getItem(key())).toBeNull(); expect(flights.every(f => f.init?.method === "GET")).toBe(true);
  });

  it("restores matching history and dispatches undo with server CAS", async () => {
    const id = crypto.randomUUID(); localStorage.setItem(key(), JSON.stringify(journal({ undo: [{ id, label: "Saved action" }] }))); await load();
    click('button[aria-label="Отменить действие"]'); expect(command()).toMatchObject({ action: "RESTORE_CHANGE", changeId: id, expectedRevision: 10 });
    await respond(latest("/api/proposals/p/mutations", "POST"), { proposal: model("p", 11), changeId: crypto.randomUUID() });
    expect(element<HTMLButtonElement>('button[aria-label="Отменить действие"]').disabled).toBe(true); expect(element<HTMLButtonElement>('button[aria-label="Вернуть действие"]').disabled).toBe(false);
  });

  it("projects selected catalog details instantly and sends only identifiers", async () => {
    await load(); await catalog(); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST");
    expect(element<HTMLInputElement>('[role="dialog"] input[type="checkbox"]').checked).toBe(true);
    expect(container.querySelector('button[disabled] h3')?.textContent).toBe("Catalog service");
    expect(command(first)).toMatchObject({ action: "ADD_CATALOG_ITEM", sectionId: "s", offerId: "offer-one", expectedRevision: 10 });
    expect(command(first)).not.toHaveProperty("assetSnapshot"); expect(command(first)).not.toHaveProperty("clientUnitPrice");
    await respond(first, { proposal: created(model()), changeId: crypto.randomUUID() }); expect(element<HTMLInputElement>('[role="dialog"] input[type="checkbox"]').checked).toBe(true);
  });

  it("queues deselection during ADD and resolves its temporary id only after acknowledgement", async () => {
    await load(); await catalog(); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST"); selectOffer();
    expect(element<HTMLInputElement>('[role="dialog"] input[type="checkbox"]').checked).toBe(false); expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(1);
    await respond(first, { proposal: created(model()), changeId: crypto.randomUUID() }); const remove = latest("/api/proposals/p/mutations", "POST");
    expect(remove).not.toBe(first); expect(command(remove)).toMatchObject({ action: "REMOVE_ITEM", itemId: "created", expectedRevision: 11 });
    expect(command(remove).mutationId).not.toBe(command(first).mutationId); const next = model("p", 12);
    await respond(remove, { proposal: next, changeId: crypto.randomUUID() }); expect(element<HTMLInputElement>('[role="dialog"] input[type="checkbox"]').checked).toBe(false);
  });

  it("cancels an unsent add locally without recording a second server command", async () => {
    await load(); await catalog([contractor(), contractor("two", "Other service")]); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST"); selectOffer("two"); selectOffer("two");
    expect(container.querySelector('button[disabled] h3')?.textContent).toBe("Catalog service");
    await respond(first, { proposal: created(model()), changeId: crypto.randomUUID() }); expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(key())!).queued).toEqual([]);
  });

  it("keeps a new form open and retains its draft when an old save acknowledges", async () => {
    await load(); await catalog(); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST"); clickText("Готово");
    const existing = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.querySelector("h3")?.textContent === "Existing service")!; act(() => existing.click());
    change('[role="dialog"] textarea[name="note"]', "New unsaved note"); await respond(first, { proposal: created(model()), changeId: crypto.randomUUID() });
    expect(element<HTMLTextAreaElement>('[role="dialog"] textarea[name="note"]').value).toBe("New unsaved note");
    expect(JSON.parse(localStorage.getItem(key())!).drawer.fields.note).toBe("New unsaved note"); submit();
    expect(command()).toMatchObject({ action: "UPDATE_ITEM", itemId: "existing", clientNote: "New unsaved note", expectedRevision: 11 });
  });

  it("pauses on conflict without sending queued changes or losing the journal", async () => {
    await load(); await catalog([contractor(), contractor("two", "Other service")]); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST"); selectOffer("two");
    await respond(first, { error: { message: "Revision conflict" } }, 409); await advance(5000);
    expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(1); expect(container.textContent).toContain("Revision conflict"); expect(container.textContent).toContain("Конфликт версий");
    expect(JSON.parse(localStorage.getItem(key())!).queued).toHaveLength(2);
  });

  it("retries an uncertain commit with exactly the same payload and UUID", async () => {
    await load(); await catalog(); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST");
    await respond(first, { error: { message: "Unavailable" } }, 503); await advance(400); const second = latest("/api/proposals/p/mutations", "POST");
    expect(second.init?.body).toBe(first.init?.body); await respond(second, { error: { message: "Unavailable" } }, 503); await advance(1200);
    const third = latest("/api/proposals/p/mutations", "POST"); expect(third.init?.body).toBe(first.init?.body); await respond(third, { error: { message: "Unavailable" } }, 503);
    expect(JSON.parse(localStorage.getItem(key())!).pending.operation).toEqual(command(first)); clickText("Проверить сохранение");
    const checked = latest("/api/proposals/p/mutations", "POST"); expect(checked.init?.body).toBe(first.init?.body);
    await respond(checked, { proposal: created(model()), changeId: crypto.randomUUID() }); expect(container.textContent).not.toContain("Связь прервалась");
  });

  it("does not replay a queue against a newer revision returned by a receipt", async () => {
    await load(); await catalog([contractor(), contractor("two", "Other service")]); selectOffer(); const first = latest("/api/proposals/p/mutations", "POST"); selectOffer("two");
    const next = created(model()); next.revision = 15; await respond(first, { proposal: next, changeId: crypto.randomUUID() }); await advance(2000);
    expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(1); expect(container.textContent).toContain("На сервере новая версия");
    const saved = JSON.parse(localStorage.getItem(key())!); expect(saved.revision).toBe(11); expect(saved.queued).toHaveLength(1); expect(saved.pending).toBeNull();
  });

  it("resets photo failure only when its source changes", async () => {
    await load(); act(() => container.querySelectorAll<HTMLElement>('[data-src="/old.png"]').forEach(node => node.click()));
    expect(container.querySelector('[data-src="/old.png"]')).toBeNull(); await catalog(); expect(container.querySelector('[data-src="/old.png"]')).toBeNull(); selectOffer();
    const next = created(model()); next.variants[0].sections[0].items[0].assetSnapshot = [{ url: "/new.png" }];
    await respond(latest("/api/proposals/p/mutations", "POST"), { proposal: next, changeId: crypto.randomUUID() });
    expect(container.querySelector('[data-src="/new.png"]')).not.toBeNull(); expect(container.querySelector('[data-src="/old.png"]')).toBeNull();
  });

  it("does not accept mutations when recovery storage cannot be written", async () => {
    await load(); await catalog(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); }); selectOffer();
    expect(container.textContent).toContain("Изменение не отправлено"); expect(element<HTMLInputElement>('[role="dialog"] input[type="checkbox"]').checked).toBe(false);
    expect(flights.every(f => f.init?.method === "GET")).toBe(true);
  });

  it("debounces search and ignores the previous catalog result", async () => {
    await load(); click('button[aria-label="Подобрать услуги: Equipment"]'); const old = latest("/api/contractors");
    change('input[aria-label="Найти подрядчика или услугу"]', "Lighting"); await advance(249); expect(latest("/api/contractors")).toBe(old); await advance(1);
    const next = latest("/api/contractors"); expect(new URL(next.url, "https://test.invalid").searchParams.get("search")).toBe("Lighting"); expect(old.init?.signal?.aborted).toBe(true);
    await respond(next, { contractors: [contractor("two", "Other service")], nextCursor: null }); await respond(old, { contractors: [contractor()], nextCursor: "stale" });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Other service"); expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain("Catalog service");
  });

  it("cancels paginated reads on filter change and isolates a new page flight", async () => {
    await load(); await catalog([contractor()], "next-page"); clickText("Показать ещё услуги"); const old = latest("/api/contractors");
    change('input[aria-label="Найти подрядчика или услугу"]', "Hosts"); await advance(250); expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest("/api/contractors"), { contractors: [contractor("two", "Other service")], nextCursor: "new-page" }); clickText("Показать ещё услуги"); const current = latest("/api/contractors");
    await respond(old, { contractors: [contractor("old", "Stale service")], nextCursor: null }); expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain("Stale service");
    await respond(current, { contractors: [contractor("three", "Third service")], nextCursor: null }); expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Third service");
  });

  it("shows a catalog failure and retries without sending a proposal command", async () => {
    await load(); click('button[aria-label="Подобрать услуги: Equipment"]'); await respond(latest("/api/contractors"), { error: { message: "Catalog unavailable" } }, 503);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Catalog unavailable"); clickText("Повторить загрузку каталога");
    await respond(latest("/api/contractors"), { contractors: [contractor()], nextCursor: null }); expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain("Catalog unavailable"); expect(flights.every(f => f.init?.method === "GET")).toBe(true);
  });

  it("protects archived projects and opens exports only from an acknowledged revision", async () => {
    const archived = model(); archived.owner = { type: "PROJECT", projectId: "project", title: "Archived", archivedAt: "2026-10-13" }; await load(archived);
    expect(element<HTMLButtonElement>('button[aria-label="Подобрать услуги: Equipment"]').disabled).toBe(true); clickText("Скачать КП");
    expect(element('[data-export-revision]').getAttribute("data-export-revision")).toBe("10"); expect(flights.every(f => f.init?.method === "GET")).toBe(true);
  });
});
