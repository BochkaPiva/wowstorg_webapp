// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContactsPanel } from "@/app/projects/[id]/ProjectContactsPanel";
import { ProjectFilesPanel } from "@/app/projects/[id]/ProjectFilesPanel";
import { ProjectSchedulePanel } from "@/app/projects/[id]/ProjectSchedulePanel";

type Flight = { url: string; init?: RequestInit; resolve: (r: Response) => void };
let flights: Flight[], root: Root, host: HTMLDivElement;
const contact = { id: "contact", fullName: "Contact", phone: null, email: null, category: "OTHER", roleNote: null, isActive: true, sortOrder: 0, createdAt: "2026-10-13", updatedAt: "2026-10-13", entries: [] };
const folder = { id: "folder", name: "Folder", parentFolderId: null, sortOrder: 0, isSystem: false, children: [], files: [] };
const day = { id: "day", dateNote: "Day", sortOrder: 0, slots: [{ id: "slot", sortOrder: 0, intervalText: "09:00–10:00", description: "Opening" }] };
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); flights = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>(resolve => flights.push({ url, init, resolve }))));
  vi.spyOn(window, "confirm").mockReturnValue(true); vi.spyOn(window, "alert").mockImplementation(() => {});
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function render(kind: "contacts" | "files" | "schedule", projectId = "p", readOnly = false) {
  const Panel = { contacts: ProjectContactsPanel, files: ProjectFilesPanel, schedule: ProjectSchedulePanel }[kind];
  act(() => root.render(<React.StrictMode><Panel projectId={projectId} readOnly={readOnly} /></React.StrictMode>));
}
function latest(kind: string, method = "GET", project = "p") { return flights.filter(f => f.url === `/api/projects/${project}/${kind}` && (f.init?.method ?? "GET") === method).at(-1)!; }
async function respond(f: Flight, body: unknown, status = 200) { expect(f).toBeDefined(); await act(async () => f.resolve(new Response(JSON.stringify(body), { status }))); }
function el<T extends HTMLElement>(selector: string) { const result = host.querySelector<T>(selector); expect(result, selector).not.toBeNull(); return result!; }
function input(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(target, value);
  act(() => target.dispatchEvent(new Event("input", { bubbles: true })));
}
function click(text: string) { const button = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === text); expect(button, text).toBeDefined(); act(() => button!.click()); }
function aria(label: string) { act(() => el<HTMLButtonElement>(`[aria-label="${label}"]`).click()); }
function body(f: Flight) { return JSON.parse(f.init!.body as string); }
async function advance(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
async function loadSchedule(days = [day], readOnly = false) {
  render("schedule", "p", readOnly); await respond(latest("schedule"), { days }); await respond(latest("contractors"), { assignments: [] }); click("Таблица");
}

describe("project panel read and form ownership", () => {
  it("ignores cancelled StrictMode contact reads", async () => {
    render("contacts"); const old = flights[0]; await respond(latest("contacts"), { contacts: [contact] }); await respond(old, { contacts: [{ ...contact, fullName: "Stale" }] });
    expect(host.textContent).toContain("Contact"); expect(host.textContent).not.toContain("Stale"); expect(old.init?.signal?.aborted).toBe(true);
  });
  it("does not carry contact composer fields or late reads into another project", async () => {
    render("contacts"); const old = latest("contacts"); click("Добавить контакт"); input(el('[placeholder="ФИО *"]'), "Draft"); render("contacts", "other");
    await respond(latest("contacts", "GET", "other"), { contacts: [] }); await respond(old, { contacts: [contact] });
    expect(host.textContent).not.toContain("Contact"); click("Добавить контакт"); expect(el<HTMLInputElement>('[placeholder="ФИО *"]').value).toBe("");
  });
  it("retains contact input on rejected creation", async () => {
    render("contacts"); await respond(latest("contacts"), { contacts: [] }); click("Добавить контакт"); input(el('[placeholder="ФИО *"]'), "New contact"); input(el('[placeholder="Телефон"]'), "123"); click("Сохранить контакт");
    expect(body(latest("contacts", "POST"))).toMatchObject({ fullName: "New contact", phone: "123", category: "DECISION_MAKER" });
    await respond(latest("contacts", "POST"), { error: { message: "Rejected" } }, 503); expect(el<HTMLInputElement>('[placeholder="ФИО *"]').value).toBe("New contact"); expect(host.textContent).toContain("Rejected");
  });
  it("awaits the actual contacts refresh before notifying the parent after creation", async () => {
    const listener = vi.fn(); window.addEventListener("project-activity-refresh", listener);
    try {
      render("contacts"); await respond(latest("contacts"), { contacts: [] }); click("Добавить контакт"); input(el('[placeholder="ФИО *"]'), "New"); click("Сохранить контакт");
      await respond(latest("contacts", "POST"), { contact: { ...contact, fullName: "New" } }); expect(listener).not.toHaveBeenCalled();
      await respond(latest("contacts"), { contacts: [{ ...contact, fullName: "New" }] }); expect(listener).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("New");
    } finally { window.removeEventListener("project-activity-refresh", listener); }
  });
  it("keeps negotiation draft after a failed entry write", async () => {
    render("contacts"); await respond(latest("contacts"), { contacts: [contact] }); click("Добавить запись"); input(el("textarea"), "Important draft"); click("Сохранить запись");
    await respond(latest("contacts/contact/entries", "POST"), { error: { message: "Entry rejected" } }, 503); expect(el<HTMLTextAreaElement>("textarea").value).toBe("Important draft"); expect(host.textContent).toContain("Entry rejected");
  });
  it("keeps a contact edit while another field causes a render", async () => {
    render("contacts"); await respond(latest("contacts"), { contacts: [contact] }); aria("Действия с контактом"); click("Редактировать"); input(el('[placeholder="ФИО"]'), "Edited"); input(el('[placeholder="Телефон"]'), "123"); click("Сохранить");
    await respond(latest("contacts/contact", "PATCH"), { error: { message: "Edit rejected" } }, 503); expect(el<HTMLInputElement>('[placeholder="ФИО"]').value).toBe("Edited");
  });
  it("isolates file tree reads and composer by project", async () => {
    render("files"); const old = latest("files"); render("files", "other"); expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest("files", "GET", "other"), { folders: [] }); await respond(old, { folders: [folder], totalBytes: 1000, fileCount: 1 }); expect(host.textContent).not.toContain("Folder"); expect(host.textContent).toContain("0 из 15");
  });
  it("ignores an older activity refresh and retains the root folder draft", async () => {
    render("files"); await respond(latest("files"), { folders: [folder], fileCount: 0 }); click("＋ Папка"); input(el('[placeholder="Название папки"]'), "Unsaved folder");
    act(() => window.dispatchEvent(new Event("project-activity-refresh"))); const old = latest("files"); act(() => window.dispatchEvent(new Event("project-activity-refresh"))); const current = latest("files");
    await respond(current, { folders: [{ ...folder, name: "Current folder" }], fileCount: 2, totalBytes: 500 }); await respond(old, { folders: [{ ...folder, name: "Old folder" }], fileCount: 9 });
    expect(host.textContent).toContain("Current folder"); expect(host.textContent).not.toContain("Old folder"); expect(el<HTMLInputElement>('[placeholder="Название папки"]').value).toBe("Unsaved folder"); expect(host.textContent).toContain("2 из 15");
  });
  it("retains a rejected root folder creation and leaves read-only controls absent", async () => {
    render("files"); await respond(latest("files"), { folders: [] }); click("＋ Папка"); input(el('[placeholder="Название папки"]'), "Folder draft"); click("Создать");
    expect(body(latest("files/folders", "POST"))).toEqual({ name: "Folder draft", parentFolderId: null }); await respond(latest("files/folders", "POST"), { error: { message: "No space" } }, 503);
    expect(el<HTMLInputElement>('[placeholder="Название папки"]').value).toBe("Folder draft"); render("files", "p", true); expect(host.querySelector('[placeholder="Название папки"]')).toBeNull();
  });
  it("has matching SSR/hydration and preserves the schedule journal until its first response", async () => {
    localStorage.setItem("project-schedule-draft:p", JSON.stringify({ days: [{ ...day, dateNote: "Recovered" }] }));
    act(() => root.unmount()); host.innerHTML = renderToString(<ProjectSchedulePanel projectId="p" readOnly />); const errors: unknown[] = [];
    await act(async () => { root = hydrateRoot(host, <React.StrictMode><ProjectSchedulePanel projectId="p" readOnly /></React.StrictMode>, { onRecoverableError: e => errors.push(e) }); });
    expect(localStorage.getItem("project-schedule-draft:p")).not.toBeNull(); await respond(latest("schedule"), { days: [day] }); click("Таблица");
    expect(host.textContent).toContain("Recovered"); expect(errors).toEqual([]); await advance(1500); expect(flights.every(f => !f.init?.method)).toBe(true);
  });
  it("keeps time and title drafts when another day's deletion copies the slots", async () => {
    await loadSchedule([day, { ...day, id: "second", dateNote: "Second", slots: [] }]);
    input(el('input[type="time"]'), "12:00"); click("Day"); input(el('[aria-label="Название дня"]'), "Name draft");
    act(() => host.querySelectorAll<HTMLButtonElement>('[title="Удалить день"]')[1].click());
    click("＋ День"); input(el('[placeholder="День (дата или «День 1»)"]'), "Third"); click("Добавить день");
    expect(el<HTMLInputElement>('[aria-label="Название дня"]').value).toBe("Name draft"); expect(el<HTMLInputElement>('input[type="time"]').value).toBe("12:00");
  });
  it("uses the last interval for initial slot times and sends the same schedule payload", async () => {
    await loadSchedule(); const times = host.querySelectorAll<HTMLInputElement>('input[type="time"]'); expect(times[0].value).toBe("10:00"); expect(times[1].value).toBe("10:15");
    input(el('[placeholder="Описание сценария"]'), "Next slot"); click("+ слот"); await advance(900);
    expect(body(latest("schedule", "PATCH"))).toMatchObject({ days: [{ id: "day", dateNote: "Day", slots: [{ id: "slot", intervalText: "09:00–10:00" }, { intervalText: "10:00–10:15", description: "Next slot" }] }] });
    await respond(latest("schedule", "PATCH"), { ok: true }); expect(localStorage.getItem("project-schedule-draft:p")).toBeNull(); await respond(latest("schedule"), { days: [day] });
  });
  it("cannot publish a cancelled schedule or roster into another project", async () => {
    render("schedule"); const old = latest("schedule"), roster = latest("contractors"); render("schedule", "other"); expect(old.init?.signal?.aborted).toBe(true);
    await respond(latest("schedule", "GET", "other"), { days: [] }); await respond(old, { days: [day] }); await respond(roster, { assignments: [{ scheduleSlotId: "slot", status: "CONFIRMED", name: "Old contractor" }] });
    expect(host.textContent).not.toContain("Opening"); expect(host.textContent).not.toContain("Old contractor");
  });
  it("does not delete the schedule journal when its initial GET fails", async () => {
    const journal = JSON.stringify({ days: [{ ...day, dateNote: "Saved locally" }] });
    localStorage.setItem("project-schedule-draft:p", journal); render("schedule");
    await respond(latest("schedule"), { error: { message: "Unavailable" } }, 503);
    expect(host.textContent).toContain("Unavailable"); expect(localStorage.getItem("project-schedule-draft:p")).toBe(journal);
  });
  it("ignores an older roster refresh for the same schedule", async () => {
    await loadSchedule(); act(() => window.dispatchEvent(new Event("project-contractors-changed"))); const old = latest("contractors");
    act(() => window.dispatchEvent(new Event("project-contractors-changed"))); const current = latest("contractors");
    await respond(current, { assignments: [{ scheduleSlotId: "slot", status: "CONFIRMED", name: "Current contractor" }] });
    await respond(old, { assignments: [{ scheduleSlotId: "slot", status: "CONFIRMED", name: "Old contractor" }] });
    expect(host.textContent).toContain("Current contractor"); expect(host.textContent).not.toContain("Old contractor");
  });
  it("does not let an old schedule save remove another mounted editor's journal", async () => {
    await loadSchedule(); input(el('[placeholder="Описание сценария"]'), "Pending slot"); click("+ слот"); await advance(900); const pending = latest("schedule", "PATCH");
    render("schedule", "other"); await respond(latest("schedule", "GET", "other"), { days: [] });
    const journal = localStorage.getItem("project-schedule-draft:p"); expect(journal).not.toBeNull();
    await respond(pending, { ok: true }); expect(localStorage.getItem("project-schedule-draft:p")).toBe(journal);
  });
});
