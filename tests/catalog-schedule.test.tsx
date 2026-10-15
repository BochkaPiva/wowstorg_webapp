// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { CatalogSchedule } from "@/app/catalog/CatalogSchedule";
import { normalizeCatalogDates } from "@/lib/catalogDates";
import { billableRentalDaysFromDateOnly } from "@/lib/rental-days";

vi.mock("react-day-picker", () => ({ DayPicker: () => <div>Calendar fixture</div> }));
let root: Root;
const help = vi.fn();
const commits = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers(); vi.setSystemTime(new Date("2030-10-10T12:00:00Z"));
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  help.mockReset(); commits.mockReset();
});
afterEach(() => { act(() => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function Draft({ preparation = true }: { preparation?: boolean }) {
  const [dates, setDates] = React.useState(() => normalizeCatalogDates({ readyByDate: "2030-10-19", startDate: "2030-10-20", endDate: "2030-10-22", rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING" }));
  return <CatalogSchedule dates={dates} minDate="2030-10-10" showPreparation={preparation} rentalDays={billableRentalDaysFromDateOnly(dates)} onChange={patch => { commits(patch); setDates(current => normalizeCatalogDates({ ...current, ...patch })); }} onHelp={help} />;
}
function render(preparation = true) { act(() => root.render(<React.StrictMode><Draft preparation={preparation} /></React.StrictMode>)); }
function input(label: string) { return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; }
function fill(label: string, value: string) {
  const node = input(label);
  act(() => node.focus());
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
  act(() => node.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}
function click(node: HTMLElement) { act(() => node.click()); }
function pointer(node: HTMLElement, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
  act(() => node.dispatchEvent(event));
}
function slider(marker: string) { return document.querySelector<HTMLElement>(`[role="slider"][data-marker="${marker}"]`)!; }
describe("catalogue schedule", () => {
  it("separates preparation from two editable rental endpoints and keeps role visibility", () => {
    render(); expect(document.querySelectorAll("input")).toHaveLength(3);
    expect(input("Подготовить к").value).toBe("19.10.2030");
    expect(document.querySelectorAll(".mk-dateDisplay")[0].textContent?.trim()).toBe("19 октября 2030");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("3 дня аренды");
    render(false); expect(document.querySelectorAll("input")).toHaveLength(2); expect(input("Подготовить к")).toBeNull();
  });
  it("clamps preparation to the rental start and does not add preparation days to the bill", () => {
    render(); fill("Подготовить к", "10.10.2030");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("3 дня аренды");
    fill("Подготовить к", "30.10.2030"); expect(input("Подготовить к").value).toBe("20.10.2030");
  });
  it("moving the start beyond the end normalizes to a full day without unusable half-day choices", () => {
    render(); fill("Начало аренды", "25.10.2030");
    expect(input("Окончание аренды").value).toBe("25.10.2030");
    expect(document.querySelector('[aria-label="Начало аренды: время"]')).toBeNull();
    expect(document.body.textContent).toContain("Вечером");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("1 день аренды");
  });
  it("rejects invalid dates and an end before the start", () => {
    render(); fill("Начало аренды", "31.02.2030"); expect(input("Начало аренды").value).toBe("20.10.2030");
    fill("Окончание аренды", "18.10.2030"); expect(input("Окончание аренды").value).toBe("20.10.2030");
  });
  it("updates billable days using explicit pressed button choices and delegates help", () => {
    render(); const group = document.querySelector('[aria-label="Начало аренды: время"]')!;
    const evening = group.querySelectorAll<HTMLButtonElement>('button')[1]; click(evening);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(evening.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("2 дня аренды");
    click(document.querySelector<HTMLButtonElement>('button[aria-label="Подробнее — как считаются даты аренды"]')!); expect(help).toHaveBeenCalledOnce();
  });
  it("supports direct keyboard choice without opening a dropdown", () => {
    render(); const group = document.querySelector('[aria-label="Окончание аренды: время"]')!;
    const options = group.querySelectorAll<HTMLButtonElement>('button'); options[1].focus();
    act(() => options[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(document.activeElement).toBe(options[0]); expect(options[0].getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("places a calendar above a low field and returns keyboard focus on Escape", () => {
    render();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { top: 700, bottom: 748, left: 10, right: 330, width: 320, height: this.classList.contains("mk-dayPicker-popover") ? 300 : 48, x: 10, y: 700, toJSON: () => ({}) };
    });
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Открыть календарь: Окончание аренды"]')!; click(button);
    const popover = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(Number.parseFloat(popover.style.top)).toBeLessThan(700);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button);
  });
  it("previews a drag but commits once, only after release", () => {
    render(); const marker = slider("endDate");
    pointer(marker, "pointerdown", 300); pointer(marker, "pointermove", 412);
    expect(commits).not.toHaveBeenCalled(); expect(input("Окончание аренды").value).toBe("23.10.2030");
    pointer(marker, "pointerup", 412);
    expect(commits).toHaveBeenCalledTimes(1); expect(input("Окончание аренды").value).toBe("23.10.2030");
  });
  it("keeps the precision calendar open during unrelated timeline scrolling", () => {
    render();
    click(document.querySelector<HTMLButtonElement>('button[aria-label="Открыть календарь: Подготовить к"]')!);
    const viewport = document.querySelector<HTMLElement>('[aria-label="Временная шкала аренды"]')!;
    act(() => viewport.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it("cancels preview on Escape, pointer cancellation and window blur", () => {
    render(); const marker = slider("endDate");
    pointer(marker, "pointerdown", 300); pointer(marker, "pointermove", 412);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(input("Окончание аренды").value).toBe("22.10.2030");
    for (const cancel of ["pointercancel", "blur"]) {
      pointer(marker, "pointerdown", 300); pointer(marker, "pointermove", 412);
      if (cancel === "blur") act(() => window.dispatchEvent(new Event("blur"))); else pointer(marker, cancel, 412);
      expect(input("Окончание аренды").value).toBe("22.10.2030");
    }
    expect(commits).not.toHaveBeenCalled();
  });
  it("does not change a date on a click, tiny motion, or background pan", () => {
    render(); const marker = slider("endDate");
    pointer(marker, "pointerdown", 300); pointer(marker, "pointermove", 303); pointer(marker, "pointerup", 303);
    const viewport = document.querySelector<HTMLElement>('[aria-label="Временная шкала аренды"]')!;
    const before = viewport.scrollLeft;
    pointer(viewport, "pointerdown", 300); pointer(viewport, "pointermove", 200); pointer(viewport, "pointerup", 200);
    expect(viewport.scrollLeft).toBeGreaterThan(before); expect(commits).not.toHaveBeenCalled();
  });
  it("supports marker keyboard updates and bounds preparation; scrolling never edits dates", () => {
    render(); const marker = slider("readyByDate");
    act(() => marker.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true })));
    expect(input("Подготовить к").value).toBe("20.10.2030");
    commits.mockReset();
    const viewport = document.querySelector<HTMLElement>('[aria-label="Временная шкала аренды"]')!;
    Object.defineProperties(viewport, { scrollWidth: { value: 13552 }, clientWidth: { value: 700 } });
    viewport.scrollLeft = 12800;
    act(() => viewport.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(document.querySelectorAll('[data-date]')).toHaveLength(121);
    expect(document.querySelector('[data-date="2030-11-18"]')).not.toBeNull();
    expect(commits).not.toHaveBeenCalled(); expect(input("Начало аренды").value).toBe("20.10.2030");
  });
});
