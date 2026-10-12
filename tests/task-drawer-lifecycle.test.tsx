// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskActivityDrawer } from "@/app/tasks/TaskActivityDrawer";

type Flight = { url: string; init?: RequestInit; resolve: (response: Response) => void };
let root: Root | null;
let container: HTMLDivElement;
let flights: Flight[];
const columns = [{ id: "open", title: "В работе", isDone: false }, { id: "done", title: "Готово", isDone: true }];
const onChanged = vi.fn();
const onClose = vi.fn();
const task = (id: string, title = id) => ({ id, title, description: null, priority: "NORMAL", color: null, dueDate: null, reminderAt: null, completedAt: null, assignee: null, assignees: [], column: columns[0], checklistItems: [], activities: [] });
function drawer(id: string, initialTab: "activity" | "details" | "subtasks" = "details") { return <React.StrictMode><TaskActivityDrawer taskId={id} users={[]} columns={columns} initialTab={initialTab} onClose={onClose} onChanged={onChanged} /></React.StrictMode>; }
beforeEach(() => {
  root = null; onChanged.mockClear(); onClose.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  container = document.createElement("div"); document.body.append(container);
});
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function render(id: string, tab: "activity" | "details" | "subtasks" = "details") { if (!root) root = createRoot(container); act(() => root!.render(drawer(id, tab))); }
async function respond(flight: Flight, payload: unknown, status = 200) { await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status }))); }
function latest() { return flights.at(-1)!; }
function titleInput() { return document.querySelector<HTMLTextAreaElement>('.task-drawer__details textarea')!; }

describe("task drawer lifecycle", () => {
  it("keeps SSR portal empty and hydrates the browser host without mismatches", async () => {
    container.innerHTML = renderToString(drawer("one"));
    expect(container.innerHTML).toBe("");
    expect(flights).toHaveLength(0);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => { root = hydrateRoot(container, drawer("one")); });
    expect(document.querySelector(".task-drawer")).not.toBeNull();
    expect(flights.length).toBeGreaterThan(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it("resets task identity and initial tab, rejecting an old response even if abort is ignored", async () => {
    render("one"); const old = latest();
    render("two", "subtasks"); const current = latest();
    expect(current.url).toBe("/api/tasks/tasks/two");
    expect(old.init?.signal?.aborted).toBe(true);
    await respond(current, { task: task("two", "Новая задача") });
    await respond(old, { task: task("one", "Старая задача") });
    expect(document.body.textContent).toContain("Новая задача");
    expect(document.body.textContent).not.toContain("Старая задача");
    expect([...document.querySelectorAll("button.is-active")].some(button => button.textContent?.includes("Подзадачи"))).toBe(true);
    expect(flights.some(entry => entry.init?.method === "PATCH")).toBe(false);
  });

  it("keeps current detail visible during polling and accepts only the latest response", async () => {
    render("one"); await respond(latest(), { task: task("one", "Первоначальная задача") });
    act(() => window.dispatchEvent(new Event("focus"))); const old = latest();
    act(() => window.dispatchEvent(new Event("focus"))); const current = latest();
    expect(titleInput().value).toBe("Первоначальная задача");
    await respond(current, { task: task("one", "Актуальная задача") });
    await respond(old, { task: task("one", "Устаревшая задача") });
    expect(titleInput().value).toBe("Актуальная задача");
  });

  it("invalidates a prior poll before optimistic mutation and retains rollback semantics on failure", async () => {
    render("one"); await respond(latest(), { task: task("one", "Задача") });
    act(() => window.dispatchEvent(new Event("focus"))); const old = latest();
    const select = document.querySelector<HTMLSelectElement>('.task-drawer__details select')!;
    act(() => { select.value = "done"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const mutation = latest();
    expect(mutation.init?.method).toBe("PATCH");
    expect(JSON.parse(String(mutation.init?.body))).toEqual({ columnId: "done", completed: true });
    await respond(old, { task: task("one", "Старый poll") });
    expect(select.value).toBe("done");
    expect(titleInput().value).toBe("Задача");
    await respond(mutation, { error: { message: "Конфликт сохранения" } }, 409);
    expect(select.value).toBe("open");
    expect(document.body.textContent).toContain("Конфликт сохранения");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
