// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectWorkspaceDashboard } from "@/app/projects/[id]/ProjectWorkspaceDashboard";
import { buildProjectWorkspaceDraft } from "@/lib/projects/project-workspace";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren(); });

it("stages reorder and width, cancels without writing, and saves with the starting revision", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const save = vi.fn().mockResolvedValue(undefined);
  const widgets = buildProjectWorkspaceDraft([]);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<ProjectWorkspaceDashboard projectId="layout-test" widgets={widgets} revision={4} onSaveLayout={save} renderWidget={() => <div>Содержимое</div>} />));
  const click = async (name: string) => { const node = [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === name || item.getAttribute("aria-label") === name); expect(node, name).toBeDefined(); await act(async () => node!.click()); };
  await click("Изменить расположение");
  const labels = [...host.querySelectorAll<HTMLElement>("[data-widget]")].map((node) => node.dataset.widget);
  const first = host.querySelector<HTMLElement>(`[data-widget="${labels[0]}"]`)!;
  const drag = first.querySelector<HTMLButtonElement>('.project-workspace-drag')!;
  await act(async () => drag.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(first.style.order).toBe("1");
  await click("Отменить");
  expect(save).not.toHaveBeenCalled();
  expect(first.style.order).toBe("0");
  await click("Изменить расположение");
  const nextDrag = first.querySelector<HTMLButtonElement>('.project-workspace-drag')!;
  await act(async () => nextDrag.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await click("Сохранить");
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][1]).toBe(4);
  expect(save.mock.calls[0][0][1].type).toBe(labels[0]);
  await act(async () => root.unmount());
});
