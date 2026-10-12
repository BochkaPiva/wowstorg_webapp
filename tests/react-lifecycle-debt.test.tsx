// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/_ui/AppShell";
import { CatalogDateField } from "@/app/catalog/CatalogDateField";
import { CatalogMiniCart } from "@/app/catalog/CatalogMiniCart";
import { CatalogRentalPeriodPicker } from "@/app/catalog/CatalogRentalPeriodPicker";
import { ItemModal } from "@/app/catalog/ItemModal";
import { ContractorPhoto } from "@/app/contractors/catalog-ui";

const navigation = vi.hoisted(() => ({ pathname: "/work", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock("@/app/providers", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { role: "WOWSTORG", displayName: "Тест" } },
    refresh: vi.fn(),
  }),
}));
vi.mock("@/app/_ui/InAppNotifications", () => ({ InAppNotifications: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children),
}));
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    delete imageProps.unoptimized;
    return React.createElement("img", imageProps);
  },
}));

// Test our draft lifecycle independently of DayPicker's selection implementation.
vi.mock("react-day-picker", () => ({
  DayPicker: ({ selected, onSelect }: { selected?: Date | { from?: Date; to?: Date }; onSelect: (value: unknown) => void }) => {
    const range = selected && !(selected instanceof Date) ? selected : undefined;
    const ymd = (date?: Date) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
    return React.createElement("div", { "data-testid": "calendar", "data-from": ymd(range?.from), "data-to": ymd(range?.to) },
      React.createElement("button", { onClick: () => onSelect({ from: new Date(2026, 9, 15), to: undefined }) }, "Начать период"),
      React.createElement("button", { onClick: () => onSelect({ from: new Date(2026, 9, 18), to: new Date(2026, 9, 15) }) }, "Закончить период"),
    );
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.pathname = "/work";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function render(element: React.ReactNode) {
  act(() => root.render(React.createElement(React.StrictMode, null, element)));
}
function query<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}
function click(element: HTMLElement) {
  act(() => element.click());
}
function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function blur(input: HTMLInputElement) {
  act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}
function escape() {
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
}

describe("React debt: controlled drafts", () => {
  it("keeps incomplete date input and focus on unrelated renders; replaces only on a new date", () => {
    const onChange = vi.fn();
    const field = (value: string, hint = "") => React.createElement(CatalogDateField, { label: "Готовность", value, hint, onChange });
    render(field("2026-10-07"));
    const input = query<HTMLInputElement>("input");
    input.focus();
    type(input, "12.");
    render(field("2026-10-07", "Новое пояснение"));
    expect(query("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("12.");
    render(field("2026-10-13"));
    expect(input.value).toBe("13.10.2026");
    expect(document.activeElement).toBe(input);
    expect(onChange).not.toHaveBeenCalled();
    render(field("2026-10-07"));
    expect(input.value).toBe("07.10.2026");
  });

  it("keeps invalid-date recovery and min/max clamping", () => {
    const onChange = vi.fn();
    render(React.createElement(CatalogDateField, { label: "Дата", value: "2026-10-07", min: "2026-10-06", max: "2026-10-13", onChange }));
    const input = query<HTMLInputElement>("input");
    type(input, "ошибка");
    blur(input);
    expect(input.value).toBe("07.10.2026");
    expect(onChange).not.toHaveBeenCalled();
    type(input, "01.10.2026");
    blur(input);
    expect(onChange).toHaveBeenLastCalledWith("2026-10-06");
    type(input, "20.10.2026");
    blur(input);
    expect(onChange).toHaveBeenLastCalledWith("2026-10-13");
  });

  it("preserves an empty quantity draft, accepts parent updates and retains stock limits", () => {
    const onSetQty = vi.fn();
    const props = {
      item: { id: "1", name: "Стул", description: null, type: "ASSET" as const, pricePerDay: "100", availability: { availableNow: 5 } },
      onClose: vi.fn(), onAdd: vi.fn(), onInc: vi.fn(), onDec: vi.fn(), onSetQty,
    };
    render(React.createElement(ItemModal, { ...props, qtyInCart: 2 }));
    const input = query<HTMLInputElement>('input[aria-label="Количество"]');
    input.focus();
    type(input, "");
    render(React.createElement(ItemModal, { ...props, qtyInCart: 2, availableForDates: 4 }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    render(React.createElement(ItemModal, { ...props, qtyInCart: 3 }));
    expect(input.value).toBe("3");
    type(input, "99");
    expect(input.value).toBe("5");
    blur(input);
    expect(onSetQty).toHaveBeenLastCalledWith(5);
    type(input, "");
    blur(input);
    expect(onSetQty).toHaveBeenLastCalledWith(0);
  });

  it("preserves partial calendar selection but discards it on reopening and handles external date updates", () => {
    const onRangeChange = vi.fn();
    const props = {
      startDate: "2026-10-07", endDate: "2026-10-13", minDate: "2026-10-01",
      rentalStartPartOfDay: "MORNING" as const, rentalEndPartOfDay: "EVENING" as const,
      onRangeChange, onStartPartChange: vi.fn(), onEndPartChange: vi.fn(),
    };
    render(React.createElement(CatalogRentalPeriodPicker, props));
    const trigger = query('[aria-label="Период аренды — открыть календарь"]');
    click(trigger);
    click(query('[data-testid="calendar"] button'));
    expect(query('[data-testid="calendar"]').getAttribute("data-from")).toBe("2026-10-15");
    render(React.createElement(CatalogRentalPeriodPicker, { ...props, rentalStartPartOfDay: "EVENING" }));
    expect(query('[data-testid="calendar"]').getAttribute("data-to")).toBe("");
    expect(onRangeChange).not.toHaveBeenCalled();
    escape();
    expect(document.querySelector('[data-testid="calendar"]')).toBeNull();
    act(() => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(query('[data-testid="calendar"]').getAttribute("data-from")).toBe("2026-10-07");
    expect(query('[data-testid="calendar"]').getAttribute("data-to")).toBe("2026-10-13");
    render(React.createElement(CatalogRentalPeriodPicker, { ...props, endDate: "2026-10-19" }));
    expect(query('[data-testid="calendar"]').getAttribute("data-to")).toBe("2026-10-19");
    click(query('[data-testid="calendar"] button:last-child'));
    expect(onRangeChange).toHaveBeenLastCalledWith("2026-10-15", "2026-10-18");
  });
});

describe("React debt: image and navigation identity", () => {
  it("resets image failures only on source changes, including returning to the original URL", () => {
    const photo = (src: string | null, name = "Дима Ильин") => React.createElement(ContractorPhoto, { src, name });
    render(photo("/first.jpg"));
    act(() => query("img").dispatchEvent(new Event("error")));
    expect(container.textContent).toBe("ДИ");
    render(photo("/first.jpg", "Андрей Колотилин"));
    expect(container.textContent).toBe("АК");
    render(photo("/second.jpg"));
    expect(query("img").getAttribute("src")).toBe("/second.jpg");
    render(photo("/first.jpg"));
    expect(query("img").getAttribute("src")).toBe("/first.jpg");
    render(photo(null));
    expect(container.textContent).toBe("ДИ");
  });

  it("closes the menu on route changes without reopening on back navigation and restores scrolling", () => {
    document.body.style.overflow = "auto";
    const shell = () => <AppShell title="Работа">Контент</AppShell>;
    render(shell());
    click(query('[aria-label="Открыть меню"]'));
    expect(query('[aria-label="Навигация"]')).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    navigation.pathname = "/projects";
    render(shell());
    expect(document.querySelector('[aria-label="Навигация"]')).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
    navigation.pathname = "/work";
    render(shell());
    expect(document.querySelector('[aria-label="Навигация"]')).toBeNull();
    click(query('[aria-label="Открыть меню"]'));
    escape();
    expect(document.querySelector('[aria-label="Навигация"]')).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
  });
});

describe("React debt: client-only mini cart", () => {
  const props = {
    open: false, lines: [], items: new Map(), checkoutHref: "/cart", rentalDays: 1, total: 0, demoMode: false,
    onClose: vi.fn(), onSetQty: vi.fn(), onClear: vi.fn(),
  };
  it("renders no portal during SSR and hydrates without a mismatch", async () => {
    const element = React.createElement(CatalogMiniCart, props);
    expect(renderToString(element)).toBe("");
    act(() => root.unmount());
    const onRecoverableError = vi.fn();
    await act(async () => { root = hydrateRoot(container, element, { onRecoverableError }); });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(query(".mk-miniCartLayer").getAttribute("aria-hidden")).toBe("true");
  });

  it("focuses the opened portal, closes with Escape, and restores previous focus", () => {
    vi.useFakeTimers();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    render(React.createElement(CatalogMiniCart, props));
    const onClose = vi.fn();
    render(React.createElement(CatalogMiniCart, { ...props, open: true, onClose }));
    act(() => vi.advanceTimersByTime(30));
    expect(document.activeElement).toBe(query(".mk-miniCartClose"));
    escape();
    expect(onClose).toHaveBeenCalledOnce();
    render(React.createElement(CatalogMiniCart, { ...props, open: false, onClose }));
    expect(document.activeElement).toBe(opener);
  });
});
