// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkspaceSettings } from "@/app/projects/[id]/ProjectWorkspaceSettings";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ users: [{ id: "one", displayName: "Первый" }, { id: "two", displayName: "Второй" }], currentUserId: "one" }))));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});
async function clickText(text: string) {
  const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => button.click());
}
function render(ownerId = "one", readOnly = false) {
  const owner = { id: ownerId, displayName: ownerId === "one" ? "Первый" : "Второй" };
  act(() => root.render(<React.StrictMode><ProjectWorkspaceSettings projectId="project" revision={3} owner={owner} members={[{ role: "OWNER", createdAt: "2026-10-12", user: owner }]} widgets={[]} readOnly={readOnly} onSaved={vi.fn()} /></React.StrictMode>));
}
const ownerSelect = () => document.querySelector<HTMLSelectElement>('[role="dialog"] select')!;

describe("workspace draft lifecycle", () => {
  it("initializes on explicit opening, preserves an open draft and discards it on reopening", async () => {
    render();
    expect(fetch).not.toHaveBeenCalled();
    await clickText("Настроить карточку");
    expect(ownerSelect().value).toBe("one");
    expect(fetch).toHaveBeenCalledOnce();
    act(() => {
      ownerSelect().value = "two";
      ownerSelect().dispatchEvent(new Event("change", { bubbles: true }));
    });
    render();
    expect(ownerSelect().value).toBe("two");
    act(() => window.dispatchEvent(new Event("project-workspace:configure")));
    expect(ownerSelect().value).toBe("two");
    await clickText("Отмена");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await clickText("Настроить карточку");
    expect(ownerSelect().value).toBe("one");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses latest closed-state props on opening and keeps archived settings inaccessible", async () => {
    render();
    render("two");
    await clickText("Настроить карточку");
    expect(ownerSelect().value).toBe("two");
    await clickText("Отмена");
    render("two", true);
    act(() => window.dispatchEvent(new Event("project-workspace:configure")));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
