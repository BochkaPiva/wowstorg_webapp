// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEstimateSectionDrag } from "@/lib/use-estimate-section-drag";

const reorder = vi.fn();
const sections = () => [
  { id: "a", title: "Подрядчики", kind: "CONTRACTOR" },
  { id: "b", title: "Реквизит", kind: "REQUISITE" },
  { id: "demo", title: "Demo", kind: "DRAFT_REQUISITE" },
];
let root: Root, host: HTMLDivElement;
function Harness({ disabled = false }: { disabled?: boolean }) {
  const { drag, announcement, bindings } = useEstimateSectionDrag({ disabled, sections, reorder });
  return <><output>{announcement}</output>{sections().map(section => <div key={section.id}
    data-id={section.id} data-dragging={drag?.sourceId === section.id ? "true" : undefined}
    data-edge={drag?.targetId === section.id ? drag.edge : undefined} {...bindings(section.id)}>
    <details open><summary className="project-estimate-section__summary" draggable={!disabled}>
      {section.title}<button data-section-drag-title>Название</button><button>Удалить</button><input />
    </summary><p>Таблица</p></details>
  </div>)}</>;
}
function node(id = "a", selector = "summary") { return host.querySelector(`[data-id='${id}'] ${selector}`)!; }
function transfer() {
  const values = new Map<string, string>();
  return { setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) ?? "", setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" };
}
function emit(target: Element | Window | Document, type: string, extras = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, extras);
  act(() => target.dispatchEvent(event));
  return event;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reorder.mockReset(); host = document.createElement("div"); document.body.append(host);
  root = createRoot(host); act(() => root.render(<Harness />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("estimate header drag", () => {
  it("shows the correct downward insertion and commits once on drop", () => {
    const dataTransfer = transfer();
    emit(node(), "pointerdown"); emit(node(), "dragstart", { dataTransfer, clientX: 20, clientY: 10 });
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(node(), 20, 10);
    emit(node("b"), "dragover", { dataTransfer });
    expect(host.querySelector("[data-id='b']")?.getAttribute("data-edge")).toBe("after");
    emit(node("b"), "drop", { dataTransfer }); emit(document, "dragend");
    expect(reorder).toHaveBeenCalledExactlyOnceWith("a", "b");
    expect(host.querySelector("[data-dragging]")).toBeNull();
  });
  it("shows an upward insertion before the target", () => {
    const dataTransfer = transfer();
    emit(node("b"), "pointerdown"); emit(node("b"), "dragstart", { dataTransfer });
    emit(node(), "dragover", { dataTransfer });
    expect(host.querySelector("[data-id='a']")?.getAttribute("data-edge")).toBe("before");
  });
  it.each(["button:not([data-section-drag-title])", "input"])("does not hijack %s", selector => {
    emit(node("a", selector), "pointerdown");
    expect(emit(node(), "dragstart", { dataTransfer: transfer() }).defaultPrevented).toBe(true);
    expect(host.querySelector("[data-dragging]")).toBeNull();
  });
  it("allows title dragging but suppresses the resulting rename/collapse click", () => {
    const button = node("a", "[data-section-drag-title]");
    emit(button, "pointerdown"); emit(node(), "dragstart", { dataTransfer: transfer() }); emit(document, "dragend");
    expect(emit(button, "click").defaultPrevented).toBe(true);
    emit(button, "pointerdown"); expect(emit(button, "click").defaultPrevented).toBe(false);
  });
  it.each(["dragend", "Escape"])("allows keyboard activation after %s without another pointerdown", async ending => {
    emit(node(), "dragstart", { dataTransfer: transfer() });
    if (ending === "Escape") emit(document, "keydown", { key: "Escape" });
    else emit(document, "dragend");
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 0)); });
    expect(emit(node(), "click", { detail: 0 }).defaultPrevented).toBe(false);
    expect(emit(node("a", "[data-section-drag-title]"), "click", { detail: 0 }).defaultPrevented).toBe(false);
  });
  it.each(["dragend", "drop", "blur", "pointerdown"])("cleans up after outside %s", type => {
    const dataTransfer = transfer();
    emit(node(), "pointerdown"); emit(node(), "dragstart", { dataTransfer }); emit(node("b"), "dragover", { dataTransfer });
    emit(type === "blur" ? window : document, type);
    expect(host.querySelector("[data-dragging]")).toBeNull(); expect(reorder).not.toHaveBeenCalled();
  });
  it("Escape cancels without changing the order", () => {
    emit(node(), "dragstart", { dataTransfer: transfer() }); emit(document, "keydown", { key: "Escape" });
    expect(host.querySelector("[data-dragging]")).toBeNull(); expect(reorder).not.toHaveBeenCalled();
  });
  it("ignores external drags, unchanged drops and demo targets", () => {
    const dataTransfer = transfer(); expect(emit(node("b"), "dragover", { dataTransfer }).defaultPrevented).toBe(false);
    emit(node(), "dragstart", { dataTransfer });
    expect(emit(node("demo"), "dragover", { dataTransfer }).defaultPrevented).toBe(false);
    emit(node(), "drop", { dataTransfer }); expect(reorder).not.toHaveBeenCalled();
  });
  it("has keyboard reordering without stealing arrows in inputs", () => {
    emit(node(), "keydown", { key: "ArrowDown", altKey: true });
    expect(reorder).toHaveBeenCalledExactlyOnceWith("a", "b");
    emit(node("a", "input"), "keydown", { key: "ArrowDown", altKey: true });
    emit(node("b"), "keydown", { key: "ArrowDown", altKey: true });
    expect(reorder).toHaveBeenCalledTimes(1);
  });
  it("does not move archived or busy sections", () => {
    act(() => root.render(<Harness disabled />));
    expect(emit(node(), "dragstart", { dataTransfer: transfer() }).defaultPrevented).toBe(true);
    emit(node(), "keydown", { key: "ArrowDown", altKey: true }); expect(reorder).not.toHaveBeenCalled();
  });
});
