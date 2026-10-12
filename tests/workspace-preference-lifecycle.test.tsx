// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkspaceDashboard } from "@/app/projects/[id]/ProjectWorkspaceDashboard";
import type { ProjectWorkspaceWidgetInput } from "@/lib/projects/project-workspace";

let root: Root;
let container: HTMLDivElement;
const widgets: ProjectWorkspaceWidgetInput[] = [{ instanceKey: "notes", type: "NOTES", sortOrder: 0, x: 0, y: 0, width: 4, heightPreset: "MEDIUM", isVisible: true }];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function render(id = "one") { act(() => root.render(<React.StrictMode><ProjectWorkspaceDashboard projectId={id} widgets={widgets} renderWidget={() => <input aria-label="Заметка" defaultValue="Локальный черновик" />} /></React.StrictMode>)); }
function clickText(text: string) { const button = [...document.querySelectorAll("button")].find(entry => entry.textContent?.trim() === text)!; act(() => button.click()); }
function menu() { act(() => document.querySelector<HTMLButtonElement>('.project-workspace-widget__controls button[aria-expanded]')!.click()); }
function storage(id: string, value: string) { act(() => { localStorage.setItem(`project-workspace-collapsed:${id}`, value); window.dispatchEvent(new StorageEvent("storage", { key: `project-workspace-collapsed:${id}` })); }); }

describe("workspace local preference lifecycle", () => {
  it("restores valid collapsed types, persists one explicit toggle, and isolates project identity", () => {
    localStorage.setItem("project-workspace-collapsed:one", JSON.stringify(["NOTES", "INVALID"]));
    render();
    expect(document.querySelector('section[data-widget="NOTES"]')!.getAttribute("data-collapsed")).toBe("true");
    expect(document.querySelector('input[aria-label="Заметка"]')).toBeNull();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    menu(); clickText("Развернуть содержимое");
    expect(document.querySelector('input[aria-label="Заметка"]')).not.toBeNull();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("project-workspace-collapsed:one")!)).toEqual([]);
    storage("one", JSON.stringify(["NOTES"]));
    expect(document.querySelector('input[aria-label="Заметка"]')).toBeNull();
    localStorage.setItem("project-workspace-collapsed:two", "{broken");
    render("two");
    expect(document.querySelector('input[aria-label="Заметка"]')).not.toBeNull();
    render("one");
    expect(document.querySelector('input[aria-label="Заметка"]')).toBeNull();
  });

  it("keeps an expanded editor alive during external collapse changes and cleans overlay when project changes", () => {
    render();
    act(() => document.querySelector<HTMLButtonElement>('.project-workspace-widget__controls button[title="На весь экран"]')!.click());
    const dialog = document.querySelector<HTMLElement>('section[role="dialog"]')!;
    const input = dialog.querySelector<HTMLInputElement>("input")!;
    act(() => { input.value = "Несохранённый черновик"; });
    expect(document.body.classList.contains("project-workspace-expanded")).toBe(true);
    storage("one", JSON.stringify(["NOTES"]));
    expect(document.querySelector('section[role="dialog"] input')).toBe(input);
    expect(input.value).toBe("Несохранённый черновик");
    render("two");
    expect(document.querySelector('section[role="dialog"]')).toBeNull();
    expect(document.body.classList.contains("project-workspace-expanded")).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Заметка"]')!.value).toBe("Локальный черновик");
  });
});
