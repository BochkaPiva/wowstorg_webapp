// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJsonResource } from "@/lib/use-json-resource";
import { Providers, useAuth } from "@/app/providers";
import { OrderDateChangeDialog } from "@/app/orders/[id]/OrderDateChangeDialog";
import { OrderFeedbackEditor } from "@/app/_ui/OrderServiceFeedback";

type Flight = { url: string; signal?: AbortSignal | null; resolve: (response: Response) => void; reject: (cause: Error) => void };
let flights: Flight[];
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  flights = [];
  vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    // Intentionally ignores cancellation: stale-response protection must still work.
    flights.push({ url: String(input), signal: init?.signal, resolve, reject });
  })));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function render(element: React.ReactNode) {
  act(() => root.render(<React.StrictMode>{element}</React.StrictMode>));
}
async function respond(flight: Flight, payload: unknown, status = 200) {
  await act(async () => flight.resolve(new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } })));
}
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function Resource({ url }: { url: string | null }) {
  const { data, loading, error, refresh } = useJsonResource<{ name: string }>(url, "Ошибка загрузки");
  return <><output data-loading={loading}>{data?.name ?? "нет данных"}{error ? ` / ${error}` : ""}</output><button onClick={() => void refresh()}>Обновить</button></>;
}
const output = () => container.querySelector("output")!;
const latest = () => flights[flights.length - 1]!;

describe("JSON resource lifecycle", () => {
  it("ignores a late refresh captured by an action for a previous resource", async () => {
    let oldRefresh: (() => Promise<void>) | undefined;
    function Capture({ url }: { url: string }) {
      const resource = useJsonResource<{ name: string }>(url, "Ошибка загрузки");
      return <><output data-loading={resource.loading}>{resource.data?.name}</output><button onClick={() => { oldRefresh = resource.refresh; }}>Начать действие</button></>;
    }
    render(<Capture url="/old" />);
    act(() => container.querySelector("button")!.click());
    render(<Capture url="/new" />);
    const pending = latest();
    const count = flights.length;
    await act(async () => { await oldRefresh!(); });
    expect(flights).toHaveLength(count);
    await respond(pending, { name: "Новый" });
    expect(output().textContent).toBe("Новый");
    expect(output().dataset.loading).toBe("false");
  });
  it("derives initial loading, disables fetch for null URL and survives StrictMode cleanup", async () => {
    render(<Resource url={null} />);
    expect(flights).toHaveLength(0);
    expect(output().dataset.loading).toBe("false");
    render(<Resource url="/first" />);
    expect(output().dataset.loading).toBe("true");
    await respond(latest(), { name: "Актуальный" });
    expect(output().textContent).toBe("Актуальный");
    expect(output().dataset.loading).toBe("false");
  });

  it("does not publish an old-key response even if fetch ignores AbortSignal", async () => {
    render(<Resource url="/first" />);
    const old = latest();
    render(<Resource url="/second" />);
    const current = latest();
    expect(old.signal?.aborted).toBe(true);
    expect(output().textContent).toBe("нет данных");
    await respond(current, { name: "Второй" });
    await respond(old, { name: "Устаревший" });
    expect(output().textContent).toBe("Второй");
    expect(output().dataset.loading).toBe("false");
    render(<Resource url={null} />);
    expect(output().textContent).toBe("нет данных");
  });

  it("keeps refresh pending until the latest request settles and permits retry after an HTTP error", async () => {
    render(<Resource url="/resource" />);
    await respond(latest(), { name: "Первый" });
    act(() => container.querySelector("button")!.click());
    const old = latest();
    act(() => container.querySelector("button")!.click());
    const current = latest();
    await respond(old, { name: "Устаревший" });
    expect(output().dataset.loading).toBe("true");
    expect(output().textContent).toBe("Первый");
    await respond(current, { error: { message: "Нет доступа" } }, 403);
    expect(output().dataset.loading).toBe("false");
    expect(output().textContent).toContain("Нет доступа");
    act(() => container.querySelector("button")!.click());
    expect(output().textContent).not.toContain("Нет доступа");
    await respond(latest(), { name: "Повтор" });
    expect(output().textContent).toBe("Повтор");
  });

  it("handles network/malformed JSON failures and aborts on unmount", async () => {
    render(<Resource url="/resource" />);
    await act(async () => latest().reject(new Error("Сеть недоступна")));
    expect(output().textContent).toContain("Сеть недоступна");
    act(() => container.querySelector("button")!.click());
    await act(async () => latest().resolve(new Response("not-json", { status: 200 })));
    expect(output().textContent).toContain("Ошибка загрузки");
    render(<Resource url="/next" />);
    const pending = latest();
    render(null);
    expect(pending.signal?.aborted).toBe(true);
    await respond(pending, { name: "Поздний ответ" });
    expect(container.textContent).toBe("");
  });
});

function AuthConsumer() {
  const { state, refresh } = useAuth();
  return <><output>{state.status === "authenticated" ? state.user.displayName : state.status}</output><button onClick={() => void refresh()}>Проверить сессию</button></>;
}
describe("auth resource", () => {
  it("starts loading, authenticates and does not let a previous response restore a signed-out session", async () => {
    render(<Providers><AuthConsumer /></Providers>);
    expect(output().textContent).toBe("loading");
    const initial = latest();
    act(() => container.querySelector("button")!.click());
    await respond(latest(), { user: null });
    await respond(initial, { user: { id: "1", login: "old", role: "WOWSTORG", displayName: "Старая сессия" } });
    expect(output().textContent).toBe("anonymous");
    act(() => container.querySelector("button")!.click());
    expect(output().textContent).toBe("loading");
    await respond(latest(), { user: { id: "2", login: "new", role: "WOWSTORG", displayName: "Новая сессия" } });
    expect(output().textContent).toBe("Новая сессия");
    act(() => container.querySelector("button")!.click());
    await respond(latest(), { error: { message: "Сессия истекла" } }, 401);
    expect(output().textContent).toBe("anonymous");
  });
});

describe("editable form identity", () => {
  const dates = { readyByDate: "2026-10-06", startDate: "2026-10-07", endDate: "2026-10-13", rentalStartPartOfDay: "MORNING" as const, rentalEndPartOfDay: "EVENING" as const };
  it("date dialog preserves input for equal props but resets on reopening or a new order", () => {
    const props = { orderId: "one", initialValue: dates, onClose: vi.fn(), onApplied: vi.fn(), allowPastDates: true };
    render(<OrderDateChangeDialog {...props} open />);
    const input = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    type(input, "2026-09-01");
    render(<OrderDateChangeDialog {...props} initialValue={{ ...dates }} open />);
    expect(input.value).toBe("2026-09-01");
    render(<OrderDateChangeDialog {...props} open={false} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    render(<OrderDateChangeDialog {...props} open />);
    expect(document.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("2026-10-06");
    type(document.querySelector<HTMLInputElement>('input[type="date"]')!, "2026-09-01");
    render(<OrderDateChangeDialog {...props} orderId="two" open />);
    expect(document.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("2026-10-06");
    expect(flights).toHaveLength(0);
  });

  it("feedback draft survives equal-object rerenders and receives authoritative updates", () => {
    const feedback = { id: "feedback", rating: 5, comment: "Спасибо", updatedAt: "one" };
    render(<OrderFeedbackEditor orderId="order" feedback={feedback} prompt />);
    const input = container.querySelector("textarea")!;
    type(input, "Мой незавершённый комментарий");
    render(<OrderFeedbackEditor orderId="order" feedback={{ ...feedback }} prompt />);
    expect(input.value).toBe("Мой незавершённый комментарий");
    render(<OrderFeedbackEditor orderId="order" feedback={{ ...feedback, comment: "Серверная правка", updatedAt: "two" }} prompt />);
    expect(input.value).toBe("Серверная правка");
    expect(flights).toHaveLength(0);
  });
});
