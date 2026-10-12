// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectFreeBoard } from "@/app/projects/[id]/ProjectFreeBoard";
import { createProjectFreeBoardGroup, createProjectFreeBoardItem, type ProjectFreeBoardItemInput } from "@/lib/projects/project-free-board";
import { queueProjectBoardInsertion, takeProjectBoardInsertion } from "@/lib/projects/project-board-insertion";
import type { ProjectFreeBoardMutationEnvelope } from "@/lib/projects/project-free-board-queue";

const recovery = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/projects/project-free-board-storage", () => ({ readProjectBoardRecovery: recovery.read, writeProjectBoardRecovery: recovery.write }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/app/contractors/catalog-ui", () => ({ ContractorPhoto: () => null }));
vi.mock("react-grid-layout/legacy", () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-grid>{children}</div> }));
vi.mock("react-grid-layout", () => ({ useContainerWidth: () => ({ width: 1200, mounted: true, containerRef: React.useRef<HTMLDivElement>(null) }) }));

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let flights: Flight[];
let root: Root;
let container: HTMLDivElement;
const path = "/api/projects/p/workspace/items";
const linkables = { tasks: [], orders: [], files: [], estimateSections: [], contractors: [{ id: "contractor", label: "Contractor", meta: "Confirmed", href: "/projects/p" }] };
const note = (text = "Note") => {
  const item = createProjectFreeBoardItem("NOTE", { x: 0, y: 0 });
  if (item.type !== "NOTE") throw new Error("Expected note");
  return { ...item, expectedRevision: 1, payload: { ...item.payload, text } };
};
function dto(item: ProjectFreeBoardItemInput, revision = 1) {
  const { expectedRevision: _revision, ...value } = item;
  void _revision;
  return { ...value, revision, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" };
}
function board(items: ProjectFreeBoardItemInput[] = [], readOnly = false) { return { board: { items: items.map(item => dto(item)), readOnly, invalidItemIds: [], linkables } }; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  recovery.read.mockReset().mockResolvedValue(null); recovery.write.mockReset().mockResolvedValue(undefined);
  takeProjectBoardInsertion("p");
  flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); takeProjectBoardInsertion("p"); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render(readOnly = false) { act(() => root.render(<React.StrictMode><ProjectFreeBoard projectId="p" actorUserId="actor" readOnly={readOnly} /></React.StrictMode>)); }
function latest(method = "GET") { return flights.filter(f => f.url === (method === "GET" ? path : `${path}/batch`) && (f.init?.method ?? "GET") === method).at(-1)!; }
async function respond(flight: Flight, body: unknown, status = 200) { expect(flight).toBeDefined(); await act(async () => flight.resolve(new Response(JSON.stringify(body), { status }))); }
async function load(items: ProjectFreeBoardItemInput[] = [], readOnly = false) { render(readOnly); await respond(latest(), board(items, readOnly)); }
function button(label: string) { const result = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); expect(result, label).not.toBeNull(); return result!; }
function click(label: string) { act(() => button(label).click()); }
function input(id?: string) { const value = container.querySelector<HTMLTextAreaElement>(id ? `[data-board-item-id="${id}"] textarea` : 'textarea[aria-label="Заметка"]'); expect(value).not.toBeNull(); return value!; }
function change(value: string, id?: string) { act(() => { const target = input(id); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(target, value); target.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
function envelope(flight = latest("POST")): ProjectFreeBoardMutationEnvelope { return JSON.parse(flight.init!.body as string); }
async function acknowledge(flight = latest("POST"), revision = 2) {
  const operations = envelope(flight).operations;
  await respond(flight, { duplicate: false, result: { changedItems: operations.flatMap(op => op.op === "UPSERT" ? [dto(op.item, revision)] : []), deletedIds: operations.flatMap(op => op.op === "DELETE" ? [op.itemId] : []) } });
}

describe("free project board lifecycle", () => {
  it("hydrates without mismatches or server-side recovery reads", async () => {
    act(() => root.unmount()); container.innerHTML = renderToString(<ProjectFreeBoard projectId="p" actorUserId="actor" readOnly={false} />);
    expect(flights).toHaveLength(0); expect(recovery.read).not.toHaveBeenCalled(); const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(container, <ProjectFreeBoard projectId="p" actorUserId="actor" readOnly={false} />, { onRecoverableError: error => errors.push(error) }); });
    await respond(latest(), board()); expect(errors).toEqual([]); expect(button("Отменить последнее действие").disabled).toBe(true);
  });

  it("publishes history availability for add, undo, redo and a new branch", async () => {
    await load(); expect(button("Отменить последнее действие").disabled).toBe(true); expect(button("Повторить отменённое действие").disabled).toBe(true);
    click("Заметка"); expect(input().value).toBe("Новая заметка"); expect(button("Отменить последнее действие").disabled).toBe(false);
    click("Отменить последнее действие"); expect(container.querySelector("textarea")).toBeNull(); expect(button("Отменить последнее действие").disabled).toBe(true); expect(button("Повторить отменённое действие").disabled).toBe(false);
    click("Повторить отменённое действие"); expect(input().value).toBe("Новая заметка"); expect(button("Повторить отменённое действие").disabled).toBe(true);
    click("Отменить последнее действие"); click("Стикер"); expect(button("Повторить отменённое действие").disabled).toBe(true); expect(container.querySelectorAll("[data-board-item]")).toHaveLength(1);
  });

  it("renders group member names from current state and restores them through history", async () => {
    const first = note("First"); const second = note("Second"); const group = createProjectFreeBoardGroup([first, second], { x: 0, y: 8 });
    await load([first, second, group]); change("Renamed", first.id);
    const groupNode = container.querySelector(`[data-board-item-id="${group.id}"]`)!;
    expect(groupNode.textContent).toContain("Renamed"); expect(groupNode.textContent).not.toContain("First");
    click("Отменить последнее действие"); expect(groupNode.textContent).toContain("First"); expect(input(first.id).value).toBe("First");
    click("Повторить отменённое действие"); expect(groupNode.textContent).toContain("Renamed");
  });

  it("coalesces rapid typing while grouping its undo snapshot", async () => {
    await load([note()]); change("A"); change("AB"); change("ABC"); await advance(449);
    expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(0); await advance(1);
    expect(envelope().operations).toHaveLength(1); expect(envelope().operations[0]).toMatchObject({ op: "UPSERT", item: { payload: { text: "ABC" }, expectedRevision: 1 } });
    click("Отменить последнее действие"); expect(input().value).toBe("Note"); expect(button("Отменить последнее действие").disabled).toBe(true);
    click("Повторить отменённое действие"); expect(input().value).toBe("ABC");
  });

  it("preserves edits made during an in-flight save and rebases the next batch", async () => {
    await load([note()]); change("First draft"); await advance(450); const first = latest("POST");
    change("Latest draft"); await acknowledge(first, 5); expect(input().value).toBe("Latest draft"); await advance(120);
    const next = latest("POST"); expect(next).not.toBe(first);
    expect(envelope(next).operations[0]).toMatchObject({ item: { payload: { text: "Latest draft" }, expectedRevision: 5 } });
    await acknowledge(next, 6); expect(container.textContent).toContain("Все изменения сохранены");
  });

  it("rebases a conflict with a new mutation id and current revision", async () => {
    const original = note(); await load([original]); change("Draft"); await advance(450); const first = latest("POST");
    await respond(first, {}, 409); await respond(latest(), { board: { ...board().board, items: [dto(original, 7)] } }); await advance(80);
    const retry = latest("POST"); expect(envelope(retry).mutationId).not.toBe(envelope(first).mutationId);
    expect(envelope(retry).operations[0]).toMatchObject({ item: { payload: { text: "Draft" }, expectedRevision: 7 } });
    await acknowledge(retry, 8); expect(input().value).toBe("Draft");
  });

  it("retries an unknown failed save byte-for-byte instead of duplicating it", async () => {
    await load([note()]); change("Draft"); await advance(450); const first = latest("POST");
    await respond(first, { error: { message: "Unavailable" } }, 503); expect(container.textContent).toContain("Unavailable");
    act(() => window.dispatchEvent(new Event("online"))); const retry = latest("POST"); expect(retry).not.toBe(first); expect(retry.init?.body).toBe(first.init?.body);
    await acknowledge(retry); expect(container.textContent).toContain("Все изменения сохранены");
  });

  it("stops automatic conflict retries after two attempts without losing the draft", async () => {
    const original = note(); await load([original]); change("Draft"); await advance(450);
    for (const revision of [5, 6]) {
      await respond(latest("POST"), {}, 409); await respond(latest(), { board: { ...board().board, items: [dto(original, revision)] } }); await advance(80);
    }
    await respond(latest("POST"), { error: { message: "Conflict remains" } }, 409); await advance(1000);
    expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(3); expect(container.textContent).toContain("Conflict remains"); expect(input().value).toBe("Draft");
  });

  it("removes an invalid linked write but still saves the other pending changes", async () => {
    queueProjectBoardInsertion("p", { type: "CONTRACTOR", id: "contractor" }); await load(); click("Заметка"); await advance(80);
    const first = latest("POST"); const invalid = envelope(first).operations.find(op => op.op === "UPSERT" && op.item.type === "CONTRACTOR")!;
    if (invalid.op !== "UPSERT") throw new Error("Expected contractor write");
    await respond(first, { error: { message: "Связанная сущность не принадлежит этому проекту", details: { itemIds: [invalid.item.id] } } }, 400);
    expect(container.querySelector(`[data-board-item-id="${invalid.item.id}"]`)).toBeNull(); expect(input().value).toBe("Новая заметка"); await advance(100);
    const retry = envelope(); expect(retry.mutationId).not.toBe(envelope(first).mutationId);
    expect(retry.operations).toContainEqual({ op: "DELETE", itemId: invalid.item.id, expectedRevision: null });
    expect(retry.operations.some(op => op.op === "UPSERT" && op.item.type === "NOTE")).toBe(true); await acknowledge();
    expect(container.textContent).toContain("Все изменения сохранены");
  });

  it("recovers pending writes once under StrictMode and leaves initial history empty", async () => {
    const item = note("Recovered"); const saved = { mutationId: crypto.randomUUID(), operations: [{ op: "UPSERT" as const, item }] };
    recovery.read.mockImplementation(async (key: string) => key.endsWith(":pending") ? saved : null);
    await load(); expect(input().value).toBe("Recovered"); expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(1);
    expect(button("Отменить последнее действие").disabled).toBe(true); await acknowledge();
    expect(recovery.write.mock.calls.some(([key, value]) => key === "actor:p:board-v2:inflight" && value === null)).toBe(true);
  });

  it("consumes a queued contractor insertion once after loading and prevents duplicates", async () => {
    queueProjectBoardInsertion("p", { type: "CONTRACTOR", id: "contractor" }); await load();
    expect(container.querySelectorAll("[data-board-item]")).toHaveLength(1); expect(container.textContent).toContain("Contractor");
    expect(button("Отменить последнее действие").disabled).toBe(false); render(); expect(container.querySelectorAll("[data-board-item]")).toHaveLength(1);
    await advance(80); expect(envelope().operations).toHaveLength(1); expect(envelope().operations[0]).toMatchObject({ item: { type: "CONTRACTOR", payload: { entityId: "contractor" } } });
    click("Добавить объект проекта"); const existing = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes("Уже на доске")); expect(existing?.disabled).toBe(true);
  });

  it("keeps read-only boards free of writes and history actions", async () => {
    queueProjectBoardInsertion("p", { type: "CONTRACTOR", id: "contractor" }); await load([note()], true); await advance(1000);
    expect(container.textContent).toContain("Только просмотр"); expect(container.querySelector('[aria-label="Отменить последнее действие"]')).toBeNull(); expect(input().readOnly).toBe(true);
    expect(flights.every(f => !f.init?.method)).toBe(true); expect(takeProjectBoardInsertion("p")).toMatchObject({ id: "contractor" });
  });

  it("does not let a cancelled StrictMode recovery read overwrite the live queue", async () => {
    render(); const cancelled = flights[0]; await respond(latest(), board()); click("Заметка"); await advance(80); const live = latest("POST");
    recovery.read.mockResolvedValue({ mutationId: crypto.randomUUID(), operations: [] }); await respond(cancelled, board([note("Stale")]));
    expect(input().value).toBe("Новая заметка"); await respond(live, { error: { message: "Unavailable" } }, 503);
    act(() => window.dispatchEvent(new Event("online"))); const retry = latest("POST"); expect(retry.init?.body).toBe(live.init?.body);
    await acknowledge(retry); expect(container.textContent).toContain("Все изменения сохранены");
    expect(flights.filter(f => f.init?.method === "POST")).toHaveLength(2);
  });
});
