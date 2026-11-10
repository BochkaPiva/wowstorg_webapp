// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { startEstimateEdgeScroll } from "@/lib/estimate-edge-scroll";

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it("scrolls a constrained sheet and keeps fill hit-testing inside it; cleanup stops the loop", () => {
  const sheet = document.createElement("div");
  sheet.style.overflow = "auto";
  sheet.style.overflowY = "auto";
  sheet.innerHTML = "<span></span>";
  document.body.append(sheet);
  Object.defineProperties(sheet, {scrollHeight: {value: 1500}, clientHeight: {value: 400}});
  sheet.getBoundingClientRect = () => ({top: 150, bottom: 550, left: 10, right: 800} as DOMRect);
  let frame: FrameRequestCallback | undefined;
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const hitTest = vi.fn();
  const stop = startEstimateEdgeScroll(sheet.firstElementChild as HTMLElement, 200, 600, hitTest);
  frame!(0);
  expect(sheet.scrollTop).toBeGreaterThan(0);
  expect(hitTest).toHaveBeenCalledWith(200, 548);
  stop();
  expect(cancel).toHaveBeenCalledWith(1);
  const last = sheet.scrollTop;
  frame!(1);
  expect(sheet.scrollTop).toBe(last);
});
