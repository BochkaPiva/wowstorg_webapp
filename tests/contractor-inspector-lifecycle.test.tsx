// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogInspector } from "@/app/contractors/CatalogInspector";
import type { ContractorDetail } from "@/app/contractors/catalog-ui";
import ContractorsPage from "@/app/contractors/page";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/app/_ui/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/app/_ui/SectionHeader", () => ({ SectionHeader: ({ actions }: { actions: React.ReactNode }) => <div>{actions}</div> }));
vi.mock("@/app/contractors/CatalogDialog", () => ({ CatalogDialog: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => <div role="dialog"><button onClick={onClose}>Закрыть окно</button>{children}</div> }));
let root: Root;
let container: HTMLDivElement;
let resolveRequest: (response: Response) => void;
const callbacks = { onDirtyChange: vi.fn(), onSavingChange: vi.fn(), onSaved: vi.fn(), onClose: vi.fn(), onRetry: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
  vi.spyOn(window, "confirm").mockReturnValue(false);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function render(element: React.ReactNode) { act(() => root.render(<React.StrictMode>{element}</React.StrictMode>)); }
function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function submit() { act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function respond(payload: unknown, status = 200) { await act(async () => resolveRequest(new Response(JSON.stringify(payload), { status }))); }
function clickText(text: string) {
  const button = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.click());
}

describe("contractor form guard ownership", () => {
  it("notifies the parent of dirty/busy state and prevents duplicate synchronous submits", async () => {
    render(<CatalogInspector kind="category" contractor={null} categories={[]} loadError="" {...callbacks} />);
    type(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Музыка");
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(true);
    submit();
    submit();
    expect(fetch).toHaveBeenCalledOnce();
    expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(true);
    expect(fetch).toHaveBeenCalledWith("/api/contractor-categories", expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Музыка"') }));
    await respond({ category: { id: "category" } });
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onSaved).toHaveBeenCalledWith(undefined, "Категория добавлена.");
  });

  it("keeps the draft and dirty state on CAS conflict; explicit discard still needs confirmation", async () => {
    const contractor: ContractorDetail = {
      id: "contractor", name: "Дима", shortDescription: "Звук", city: null, photoUrl: null,
      offers: [], contacts: [], photos: [], websiteUrl: null, internalNotes: null, revision: 7,
    };
    render(<CatalogInspector kind="view" contractor={contractor} categories={[]} loadError="" {...callbacks} />);
    clickText("Редактировать");
    const input = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    type(input, "Новая карточка");
    submit();
    expect(fetch).toHaveBeenCalledWith("/api/contractors/contractor", expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"expectedRevision":7') }));
    await respond({ error: { message: "Карточку изменил коллега" } }, 409);
    expect(input.value).toBe("Новая карточка");
    expect(container.textContent).toContain("Не отправляем их поверх изменений коллеги");
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(callbacks.onSavingChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    clickText("Загрузить актуальную карточку");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(container.querySelector('input[name="name"]')).toBe(input);
    vi.mocked(window.confirm).mockReturnValue(true);
    clickText("Загрузить актуальную карточку");
    expect(container.querySelector("form")).toBeNull();
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onRetry).toHaveBeenCalledOnce();
  });

  it("retains dirty data after an HTTP failure and releases the guard for a retry", async () => {
    render(<CatalogInspector kind="category" contractor={null} categories={[]} loadError="" {...callbacks} />);
    const input = container.querySelector<HTMLInputElement>('input[name="name"]')!;
    type(input, "Локации");
    submit();
    await respond({ error: { message: "Ошибка сохранения" } }, 500);
    expect(input.value).toBe("Локации");
    expect(callbacks.onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(callbacks.onSaved).not.toHaveBeenCalled();
    submit();
    expect(fetch).toHaveBeenCalledTimes(2);
    await respond({ category: { id: "location" } });
    expect(callbacks.onSaved).toHaveBeenCalledOnce();
  });
});

describe("catalog page lifecycle integration", () => {
  function mockFlights() {
    const requests: Array<{ url: string; init?: RequestInit; resolve: (response: Response) => void }> = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve) => requests.push({ url, init, resolve }))));
    return requests;
  }
  const card = (id: string, name: string) => ({ id, name, photoUrl: null, shortDescription: null, city: null, offers: [] });
  const detail = (id: string, name: string) => ({ ...card(id, name), photos: [], contacts: [], websiteUrl: null, internalNotes: null, revision: 1 });
  async function send(request: { resolve: (response: Response) => void }, payload: unknown) { await act(async () => request.resolve(new Response(JSON.stringify(payload)))); }

  it("does not display a delayed previous detail after switching contractors", async () => {
    const requests = mockFlights();
    render(<ContractorsPage />);
    const catalog = requests.filter((entry) => entry.url.startsWith("/api/contractors?")).at(-1)!;
    await send(catalog, { contractors: [card("a", "Альфа"), card("b", "Бета")], nextCursor: null });
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Открыть карточку: Альфа"]')!.click());
    const old = requests.find((entry) => entry.url === "/api/contractors/a")!;
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Открыть карточку: Бета"]')!.click());
    const current = requests.find((entry) => entry.url === "/api/contractors/b")!;
    expect(old.init?.signal?.aborted).toBe(true);
    await send(current, { contractor: detail("b", "Бета") });
    await send(old, { contractor: detail("a", "Альфа") });
    expect(container.querySelector('[role="dialog"] h3')!.textContent).toBe("Бета");
  });

  it("the parent blocks closing dirty and saving forms using the child's notifications", async () => {
    const requests = mockFlights();
    render(<ContractorsPage />);
    clickText("+ Категория");
    type(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Музыка");
    clickText("Закрыть окно");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    submit();
    clickText("Закрыть окно");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    const saving = requests.find((entry) => entry.init?.method === "POST")!;
    await send(saving, { category: { id: "music" } });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Категория добавлена");
  });
});
