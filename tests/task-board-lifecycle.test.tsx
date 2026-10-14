// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TasksPage from "@/app/tasks/page";

const ctx = vi.hoisted(() => ({ status: "authenticated", role: "WOWSTORG", id: "one", query: "" }));
vi.mock("@/app/providers", () => ({ useAuth: () => ({ state: { status: ctx.status, user: { role: ctx.role, id: ctx.id } } }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(ctx.query) }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <section data-shell>{children}</section> }));
vi.mock("@/app/tasks/TaskActivityDrawer", () => ({ TaskActivityDrawer: () => null }));

type Flight = { url: string; init?: RequestInit; resolve: (r: Response) => void };
let root: Root;
let container: HTMLDivElement;
let flights: Flight[];
const subtask = { id: "child", parentId: null, title: "Subtask", description: null, isDone: false, sortOrder: 0, priority: "NORMAL", color: null, startDate: null, dueDate: null, dueTime: null, reminderAt: null, reminderText: null, priorityStickerEnabled: false, priorityStickerConfigured: false, deadlineStickerEnabled: false, reminderStickerEnabled: false, assigneeStickerEnabled: false, completedAt: null, updatedAt: "2026-10-13", assignee: null, assignees: [] };
const task = (id = "task", title = "Task") => ({ id, title, description: "Description", priority: "NORMAL", color: "#334155", sortOrder: 0, startDate: null, dueDate: "2026-10-20", dueTime: "13:00", reminderAt: "2026-10-20T07:00:00.000Z", reminderText: "Reminder", priorityStickerEnabled: false, priorityStickerConfigured: false, deadlineStickerEnabled: true, reminderStickerEnabled: true, assigneeStickerEnabled: false, completedAt: null, updatedAt: "2026-10-13", assignee: null, assignees: [], project: null, order: null, checklistItems: [subtask], checklistTotal: 1, checklistDone: 0, commentCount: 0 });
const board = (id = "a", title = "Task") => ({ id, title: `Board ${id}`, description: null, isDefault: true, updatedAt: "2026-10-13", syncToken: title, columns: [{ id: "open", title: "Open", isDone: false, sortOrder: 0, tasks: [task("task", title)] }, { id: "done", title: "Done", isDone: true, sortOrder: 1, tasks: [] }] });
const boards = ["a", "b"].map(id => ({ id, title: `Board ${id}`, description: null, isDefault: id === "a", _count: { tasks: 1, columns: 2 } }));
const meta = { users: [{ id: "one", displayName: "Owner" }], projects: [], orders: [] };
beforeEach(() => {
  ctx.status = "authenticated"; ctx.role = "WOWSTORG"; ctx.id = "one"; ctx.query = "";
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T12:00:00Z")); localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)); vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  flights = []; vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render() { act(() => root.render(<React.StrictMode><TasksPage /></React.StrictMode>)); }
function latest(path: string, method = "GET") { return flights.filter(f => f.url.split("?")[0] === path && (f.init?.method ?? "GET") === method).at(-1)!; }
async function respond(f: Flight, body: unknown, status = 200) { expect(f).toBeDefined(); await act(async () => f.resolve(new Response(JSON.stringify(body), { status }))); }
async function bootstrap() { render(); await respond(latest("/api/tasks/boards"), { boards }); await respond(latest("/api/tasks/meta"), meta); }
async function load(title = "Task") { await bootstrap(); await respond(latest("/api/tasks/boards/a"), { board: board("a", title) }); }
function element<T extends HTMLElement>(selector: string) { const value = document.querySelector<T>(selector); expect(value, selector).not.toBeNull(); return value!; }
function click(selector: string) { act(() => element<HTMLButtonElement>(selector).click()); }
function clickText(text: string) { const button = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === text); expect(button, text).toBeDefined(); act(() => button!.click()); }
function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) { act(() => { const type = input.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(type.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
function selectBoard(id: string) { const select = element<HTMLSelectElement>(".task-board-toolbar__select"); act(() => { select.value = id; select.dispatchEvent(new Event("change", { bubbles: true })); }); }
async function flush() { await act(async () => {}); }
function openEditor() { click('[data-task-card-id="task"] button[aria-label="Действия с задачей"]'); clickText("✎ Переименовать и настроить"); }
function dragEvent(target: HTMLElement, type: string, values: Record<string, string> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types: Object.keys(values), effectAllowed: "none", dropEffect: "none", getData: (key: string) => values[key] ?? "", setData: (key: string, value: string) => { values[key] = value; } } });
  Object.defineProperty(event, "clientY", { value: 0 });
  Object.defineProperty(event, "clientX", { value: 0 });
  act(() => target.dispatchEvent(event));
  return values;
}

describe("task board lifecycle", () => {
  it("renders multiline task descriptions as plain text and omits an empty preview", async () => {
    await bootstrap(); const next = board();
    next.columns[0].tasks[0].description = "Тестовое задание\n\n<Важно> & проверить";
    await respond(latest("/api/tasks/boards/a"), { board: next });
    const preview = element('[data-task-card-id="task"] .task-card__description');
    expect(preview.textContent).toBe("Тестовое задание\n\n<Важно> & проверить"); expect(preview.childElementCount).toBe(0);
    next.columns[0].tasks[0].description = "   ";
    next.syncToken = "empty-description";
    act(() => window.dispatchEvent(new Event("focus"))); await respond(latest("/api/tasks/boards/a"), { board: next });
    expect(container.querySelector(".task-card__description")).toBeNull();
  });
  it("keeps a director's permanent source badge and readable gold state across an optimistic move", async () => {
    await bootstrap(); const next = board();
    const marked = { ...next.columns[0].tasks[0], color: "#f5c542", directorRequest: { directorName: "Director QA" } };
    next.columns[0].tasks[0] = marked;
    await respond(latest("/api/tasks/boards/a"), { board: next });
    const card = element('[data-task-card-id="task"]');
    expect(card.className).toContain("task-card-director-gold"); expect(card.querySelector(".task-director-badge")?.textContent).toBe("Директор");
    const transfer = dragEvent(card, "dragstart"); dragEvent(container.querySelectorAll<HTMLElement>(".task-column")[1], "drop", transfer);
    expect(element('[data-task-card-id="task"]').querySelector(".task-director-badge")?.textContent).toBe("Директор");
    await flush(); await respond(latest("/api/tasks/tasks/task", "PATCH"), { task: marked });
    expect(element('[data-task-card-id="task"]').querySelector(".task-director-badge")?.textContent).toBe("Директор");
  });
  it("clears drag feedback before a moved card unmounts, including a failed save", async () => {
    await load();
    const source = element('[data-task-card-id="task"]');
    const transfer = dragEvent(source, "dragstart");
    expect(source.classList.contains("task-card-dragging")).toBe(true);
    const target = container.querySelectorAll<HTMLElement>(".task-column")[1];
    dragEvent(target, "dragover", transfer);
    expect(container.querySelector(".task-drop-placeholder")).not.toBeNull();
    dragEvent(target, "drop", transfer);
    // A cross-column move destroys the native drag source; no dragend is sent.
    expect(source.isConnected).toBe(false);
    expect(element('[data-task-card-id="task"]').classList.contains("task-card-dragging")).toBe(false);
    expect(container.querySelector(".task-drop-placeholder")).toBeNull();
    await flush();
    const mutation = latest("/api/tasks/tasks/task", "PATCH");
    expect(JSON.parse(mutation.init!.body as string)).toMatchObject({ columnId: "done", completed: true });
    await respond(mutation, { error: { message: "Save failed" } }, 503);
    expect(element('[data-task-card-id="task"]').classList.contains("task-card-dragging")).toBe(false);
    expect(container.textContent).toContain("Save failed");
  });

  it("clears a self-drop without changing the task", async () => {
    await load();
    const card = element('[data-task-card-id="task"]');
    const transfer = dragEvent(card, "dragstart");
    dragEvent(card.parentElement!, "drop", transfer);
    expect(card.classList.contains("task-card-dragging")).toBe(false);
    await flush();
    expect(flights.filter(f => f.init?.method)).toHaveLength(0);
  });

  it("clears a drop on another card before saving and resumes background sync afterwards", async () => {
    await bootstrap();
    const populated = board(); populated.columns[1].tasks = [task("target", "Target")];
    await respond(latest("/api/tasks/boards/a"), { board: populated });
    const source = element('[data-task-card-id="task"]');
    const transfer = dragEvent(source, "dragstart");
    dragEvent(element('[data-task-card-id="target"]').parentElement!, "drop", transfer);
    expect(container.querySelector(".task-card-dragging")).toBeNull();
    expect(container.querySelector(".task-drop-placeholder")).toBeNull();
    await flush();
    const mutation = latest("/api/tasks/tasks/task", "PATCH");
    expect(JSON.parse(mutation.init!.body as string)).toMatchObject({ columnId: "done", completed: true });
    await respond(mutation, { task: task() });
    const before = flights.length; act(() => vi.advanceTimersByTime(12000));
    expect(flights.length).toBeGreaterThan(before);
    expect(latest("/api/tasks/boards/a")).toBeDefined();
  });

  it("clears column drag feedback and drops without waiting for native dragend", async () => {
    await load();
    const source = element(".task-column__header");
    const transfer = dragEvent(source, "dragstart");
    expect(source.closest(".task-column")!.classList.contains("is-dragging")).toBe(true);
    dragEvent(container.querySelectorAll<HTMLElement>(".task-column")[1], "drop", transfer);
    expect(container.querySelector(".task-column.is-dragging")).toBeNull();
    await flush();
    expect(latest("/api/tasks/columns/open", "PATCH")).toBeDefined();
  });

  it.each(["dragend", "drop", "blur", "escape", "hidden", "pointerdown"])("recovers drag feedback on %s outside the source card", async (completion) => {
    await load();
    const card = element('[data-task-card-id="task"]');
    dragEvent(card, "dragstart");
    expect(card.classList.contains("task-card-dragging")).toBe(true);
    act(() => {
      if (completion === "escape") document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else if (completion === "hidden") {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      } else if (completion === "blur") window.dispatchEvent(new Event("blur"));
      else document.body.dispatchEvent(new Event(completion, { bubbles: true }));
    });
    expect(card.classList.contains("task-card-dragging")).toBe(false);
    expect(container.querySelector(".task-drop-placeholder")).toBeNull();
    await flush();
    expect(flights.filter(f => f.init?.method)).toHaveLength(0);
  });

  it("waits for authorization, aborts bootstrap on logout and keeps SSR hydration consistent", async () => {
    ctx.status = "loading"; act(() => root.unmount()); container.innerHTML = renderToString(<TasksPage />); expect(flights).toHaveLength(0);
    const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(container, <TasksPage />, { onRecoverableError: error => errors.push(error) }); });
    expect(errors).toEqual([]); ctx.status = "authenticated"; ctx.role = "GREENWICH"; render(); expect(flights).toHaveLength(0);
    ctx.role = "WOWSTORG"; render(); const pending = latest("/api/tasks/boards");
    ctx.status = "anonymous"; render(); expect(pending.init?.signal?.aborted).toBe(true);
    await respond(pending, { boards }); expect(container.querySelector(".task-board-shell")).toBeNull();
  });

  it("bootstraps once per scope and fetches only the selected project board", async () => {
    ctx.query = "embed=1&projectId=p&readOnly=1"; await bootstrap();
    const current = latest("/api/tasks/boards/a");
    expect(Object.fromEntries(new URL(current.url, "https://test.invalid").searchParams)).toEqual({ projectId: "p", includeClosedProjectTasks: "1", archived: "0" });
    await respond(current, { board: board() }); expect(container.querySelector("[data-shell]")).toBeNull();
    const before = flights.filter(f => f.url === "/api/tasks/meta").length;
    selectBoard("b"); await respond(latest("/api/tasks/boards/b"), { board: board("b", "Other") });
    expect(flights.filter(f => f.url === "/api/tasks/meta")).toHaveLength(before);
    expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("ignores a late result from the previously selected board", async () => {
    await bootstrap(); const old = latest("/api/tasks/boards/a"); selectBoard("b");
    await respond(latest("/api/tasks/boards/b"), { board: board("b", "Current") });
    await respond(old, { board: board("a", "Old") });
    expect(container.textContent).toContain("Current"); expect(container.textContent).not.toContain("Old");
  });

  it("shows a read failure without an unhandled rejection and clears it on a new selection", async () => {
    await bootstrap(); await respond(latest("/api/tasks/boards/a"), { error: { message: "Unavailable board" } }, 503);
    expect(container.textContent).toContain("Unavailable board");
    selectBoard("b"); await respond(latest("/api/tasks/boards/b"), { board: board("b", "Recovered") });
    expect(container.textContent).not.toContain("Unavailable board"); expect(container.textContent).toContain("Recovered");
  });

  it("restores theme and writes a toggle once, then accepts a storage event", async () => {
    localStorage.setItem("wowstorg-task-board-theme", "dark"); await load();
    expect(element(".task-board-shell").className).toContain("theme-dark");
    const write = vi.spyOn(Storage.prototype, "setItem"); click('button[title="Включить светлую тему"]');
    expect(write.mock.calls.filter(c => c[0] === "wowstorg-task-board-theme")).toHaveLength(1);
    expect(localStorage.getItem("wowstorg-task-board-theme")).toBe("light");
    act(() => { localStorage.setItem("wowstorg-task-board-theme", "dark"); window.dispatchEvent(new StorageEvent("storage", { key: "wowstorg-task-board-theme" })); });
    expect(element(".task-board-shell").className).toContain("theme-dark");
  });

  it("keeps an inline title draft across a theme render and posts the exact rename", async () => {
    await load(); click('button[title="Быстро переименовать"]');
    const input = element<HTMLInputElement>('.task-card__title-input'); change(input, "Renamed");
    click('button[title="Включить тёмную тему"]'); expect(input.value).toBe("Renamed");
    act(() => input.blur()); await flush();
    const mutation = latest("/api/tasks/tasks/task", "PATCH"); expect(JSON.parse(mutation.init!.body as string)).toEqual({ title: "Renamed" });
    await respond(mutation, { task: task("task", "Renamed") });
    expect(container.querySelector('.task-card__title-input')).toBeNull(); expect(container.textContent).toContain("Renamed");
  });

  it("keeps a form draft when a subtask change refreshes columns", async () => {
    await load(); openEditor();
    const title = element<HTMLTextAreaElement>('[role="dialog"] textarea'); change(title, "Unsaved form title");
    const child = element<HTMLInputElement>('[role="dialog"] input:not([type="datetime-local"]):not([type="date"])'); change(child, "Renamed child"); act(() => { child.focus(); child.blur(); });
    await respond(latest("/api/tasks/checklist/child", "PATCH"), { item: { ...subtask, title: "Renamed child" } });
    await respond(latest("/api/tasks/boards"), { boards });
    await respond(latest("/api/tasks/boards/a"), { board: board("a", "Refreshed") });
    expect(element<HTMLTextAreaElement>('[role="dialog"] textarea').value).toBe("Unsaved form title");
    clickText("Сохранить");
    const mutation = latest("/api/tasks/tasks/task", "PATCH");
    expect(JSON.parse(mutation.init!.body as string)).toMatchObject({ title: "Unsaved form title", columnId: "open" });
    await respond(mutation, { error: { message: "Conflict" } }, 409);
    expect(element<HTMLTextAreaElement>('[role="dialog"] textarea').value).toBe("Unsaved form title"); expect(document.body.textContent).toContain("Conflict");
  });

  it("keeps partial time input across another field and normalizes only on blur", async () => {
    await load(); click('button[title="Изменить напоминание"]');
    const hours = element<HTMLInputElement>('input[aria-label="Часы"]'); change(hours, "1");
    change(element<HTMLTextAreaElement>('.sticker-reminder-text'), "New reminder"); expect(hours.value).toBe("1");
    act(() => { hours.focus(); hours.blur(); }); expect(hours.value).toBe("01");
    clickText("Сохранить напоминание"); await flush();
    const mutation = latest("/api/tasks/tasks/task", "PATCH");
    expect(JSON.parse(mutation.init!.body as string)).toMatchObject({ reminderAt: "2026-10-19T19:00:00.000Z", reminderText: "New reminder", reminderStickerEnabled: true });
  });

  it("synchronizes time fields only when the acknowledged deadline value changes", async () => {
    await load(); click('.task-card-tools .task-card-sticker:not([title])');
    const hours = element<HTMLInputElement>('input[aria-label="Часы"]'); change(hours, "1");
    expect(hours.value).toBe("1"); act(() => vi.advanceTimersByTime(12000));
    const next = board("a", "Changed deadline"); next.columns[0].tasks[0].dueTime = "08:30";
    await respond(latest("/api/tasks/boards/a"), { board: next });
    expect(element<HTMLInputElement>('input[aria-label="Часы"]').value).toBe("08");
    expect(element<HTMLInputElement>('input[aria-label="Минуты"]').value).toBe("30");
    expect(flights.every(f => !f.init?.method)).toBe(true);
  });

  it("keeps compact menus in the task document and full editors in the same-origin parent", async () => {
    await load(); const frame = document.createElement("iframe"); document.body.append(frame);
    vi.spyOn(window, "parent", "get").mockReturnValue({ document: frame.contentDocument } as Window);
    click('button[title="Изменить напоминание"]');
    expect(document.querySelector('.task-popover')).not.toBeNull(); expect(frame.contentDocument!.querySelector('.task-popover')).toBeNull();
    openEditor(); expect(frame.contentDocument!.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("discards a project's pending bootstrap when the URL changes scope", async () => {
    ctx.query = "embed=1&projectId=old"; render(); const oldBoards = latest("/api/tasks/boards"), oldMeta = latest("/api/tasks/meta");
    ctx.query = "embed=1&projectId=new"; render();
    expect(oldBoards.init?.signal?.aborted).toBe(true);
    await respond(oldBoards, { boards }); await respond(oldMeta, meta);
    expect(flights.filter(f => f.url.includes("/api/tasks/boards/a"))).toHaveLength(0);
    await respond(latest("/api/tasks/boards"), { boards }); await respond(latest("/api/tasks/meta"), meta);
    expect(new URL(latest("/api/tasks/boards/a").url, "https://test.invalid").searchParams.get("projectId")).toBe("new");
  });

  it("does not poll while a form is open or overwrite an optimistic mutation with an older read", async () => {
    await load(); openEditor(); const before = flights.length;
    act(() => vi.advanceTimersByTime(12000)); expect(flights).toHaveLength(before);
    clickText("Закрыть"); act(() => vi.advanceTimersByTime(12000)); const poll = latest("/api/tasks/boards/a");
    click('button[title="Быстро переименовать"]'); const input = element<HTMLInputElement>('.task-card__title-input'); change(input, "Local change"); act(() => input.blur()); await flush();
    const mutation = latest("/api/tasks/tasks/task", "PATCH");
    await respond(poll, { board: board("a", "Stale poll") });
    expect(container.textContent).toContain("Local change"); expect(container.textContent).not.toContain("Stale poll");
    await respond(mutation, { task: task("task", "Local change") });
  });

  it("loads a newly selected board while a different board's mutation is pending", async () => {
    await load(); click('button[title="Быстро переименовать"]');
    const input = element<HTMLInputElement>('.task-card__title-input'); change(input, "Pending A"); act(() => input.blur()); await flush();
    const mutation = latest("/api/tasks/tasks/task", "PATCH"); selectBoard("b");
    const next = board("b", "Selected B"); next.columns[0].id = "b-open"; next.columns[0].tasks[0].id = "other";
    await respond(latest("/api/tasks/boards/b"), { board: next });
    expect(container.textContent).toContain("Selected B"); expect(container.textContent).not.toContain("Pending A");
    await respond(mutation, { task: task("task", "Pending A") });
    expect(container.textContent).toContain("Selected B"); expect(container.textContent).not.toContain("Pending A");
  });

  it("resolves an optimistic task id before sending its queued rename", async () => {
    await load(); clickText("+ Добавить задачу");
    const input = element<HTMLInputElement>('.task-card__title-input'); change(input, "Created and renamed"); act(() => input.blur()); await flush();
    const creation = latest("/api/tasks/columns/open/tasks", "POST");
    expect(flights.filter(f => f.init?.method === "PATCH")).toHaveLength(0);
    await respond(creation, { task: task("server-id", "Новая задача") }); await flush();
    const rename = latest("/api/tasks/tasks/server-id", "PATCH");
    expect(JSON.parse(rename.init!.body as string)).toEqual({ title: "Created and renamed" });
    await respond(rename, { task: task("server-id", "Created and renamed") });
    expect(container.textContent).toContain("Created and renamed");
  });
});
