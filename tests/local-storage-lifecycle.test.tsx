// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorageText } from "@/lib/use-local-storage-text";

let root: Root | null;
let container: HTMLDivElement;
function Preference({ storageKey }: { storageKey: string | null }) {
  const [text, write] = useLocalStorageText(storageKey);
  return <div><output>{text ?? "empty"}</output><button onClick={() => write("changed")}>Write</button><button onClick={() => write(null)}>Clear</button></div>;
}
beforeEach(() => {
  root = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div"); document.body.append(container);
});
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
function render(element: React.ReactNode) { if (!root) root = createRoot(container); act(() => root!.render(<React.StrictMode>{element}</React.StrictMode>)); }
function click(text: string) { const button = [...container.querySelectorAll("button")].find(entry => entry.textContent === text)!; act(() => button.click()); }

describe("local preference external store", () => {
  it("uses empty server snapshot and hydrates stored preferences without mismatches", async () => {
    localStorage.setItem("hydration", "stored");
    const element = <React.StrictMode><Preference storageKey="hydration" /></React.StrictMode>;
    container.innerHTML = renderToString(element);
    expect(container.querySelector("output")!.textContent).toBe("empty");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => { root = hydrateRoot(container, element); });
    expect(container.querySelector("output")!.textContent).toBe("stored");
    expect(errors).not.toHaveBeenCalled();
  });

  it("notifies this-tab peers, observes other-tab changes/clear, and switches keys without stale text", () => {
    render(<><Preference storageKey="shared" /><Preference storageKey="shared" /></>);
    click("Write");
    expect([...container.querySelectorAll("output")].map(entry => entry.textContent)).toEqual(["changed", "changed"]);
    act(() => { localStorage.setItem("shared", "external"); window.dispatchEvent(new StorageEvent("storage", { key: "shared" })); });
    expect([...container.querySelectorAll("output")].map(entry => entry.textContent)).toEqual(["external", "external"]);
    act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent("storage", { key: null })); });
    expect([...container.querySelectorAll("output")].map(entry => entry.textContent)).toEqual(["empty", "empty"]);
    localStorage.setItem("other", "other-key");
    render(<Preference storageKey="other" />);
    expect(container.querySelector("output")!.textContent).toBe("other-key");
    render(<Preference storageKey={null} />);
    click("Write");
    expect(container.querySelector("output")!.textContent).toBe("empty");
  });

  it("keeps preferences usable when storage quota is exhausted and recovers persistence later", () => {
    localStorage.setItem("blocked", "old");
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    render(<Preference storageKey="blocked" />);
    expect(container.querySelector("output")!.textContent).toBe("old");
    click("Write");
    expect(container.querySelector("output")!.textContent).toBe("changed");
    expect(localStorage.getItem("blocked")).toBe("old");
    set.mockRestore();
    click("Write");
    expect(localStorage.getItem("blocked")).toBe("changed");
    click("Clear");
    expect(container.querySelector("output")!.textContent).toBe("empty");
    expect(localStorage.getItem("blocked")).toBeNull();
  });
});
