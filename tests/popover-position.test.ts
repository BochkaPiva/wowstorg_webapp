import { describe, expect, it } from "vitest";
import { popoverPosition } from "@/lib/popover-position";

describe("contextual popup bounds", () => {
  it("opens below a visible trigger without leaving the viewport", () => {
    expect(popoverPosition({ width: 1440, height: 1000, top: 80 }, { left: 1160, right: 1280, top: 280, bottom: 320 })).toEqual({ left: 700, top: 328, width: 580, maxHeight: 540 });
  });
  it("flips above a low trigger", () => {
    const box = popoverPosition({ width: 1440, height: 1000, top: 80 }, { left: 1160, right: 1280, top: 850, bottom: 890 });
    expect(box.top + box.maxHeight).toBeLessThan(850);
    expect(box.top).toBeGreaterThanOrEqual(92);
  });
  it("bounds settings to the screen instead of the document height", () => {
    expect(popoverPosition({ width: 390, height: 844, top: 90 })).toEqual({ left: 12, top: 102, width: 366, maxHeight: 730 });
  });
  it("fits mobile, keyboard-sized and short viewports", () => {
    for (const height of [180, 400, 844]) {
      const box = popoverPosition({ width: 390, height, top: 90 }, { left: 280, right: 380, top: 700, bottom: 740 });
      expect(box.left + box.width).toBeLessThanOrEqual(378);
      expect(box.top + box.maxHeight).toBeLessThanOrEqual(height - 12);
      expect(box.top).toBeGreaterThanOrEqual(12);
    }
  });
});
