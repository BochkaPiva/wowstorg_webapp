// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/app/contractors/catalog-ui", () => ({ catalogRequest: api, ContractorPhoto: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
import { ProjectContractorsPanel } from "@/app/projects/[id]/ProjectContractorsPanel";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("retains remaining choices and retries the same request after a partial failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const cards = ["a", "b"].map((id) => ({ id, name: id, shortDescription: "Услуга", photoUrl: null, offers: [] }));
  let fail = true;
  const posts: { id: string; contractorId: string }[] = [];
  api.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/projects/p/contractors" && init?.method === "POST") {
      const body = JSON.parse(String(init.body)); posts.push(body);
      if (body.contractorId === "b" && fail) { fail = false; throw new Error("Ошибка сети"); }
      return { added: 1, skipped: 0 };
    }
    if (url === "/api/projects/p/contractors") return { assignments: [], scheduleSlots: [], proposal: null };
    if (url.startsWith("/api/contractors?")) return { contractors: cards };
    if (url.startsWith("/api/contractors/")) return { contractor: { contacts: [], offers: [] } };
    throw new Error(url);
  });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => { root.render(<ProjectContractorsPanel projectId="p" readOnly={false} />); });
  const button = (text: string) => [...host.querySelectorAll("button")].find((el) => el.textContent?.trim() === text)!;
  await act(async () => { button("+ Подрядчик").click(); });
  await act(async () => { vi.advanceTimersByTime(250); });
  const boxes = host.querySelectorAll<HTMLInputElement>('.pickerOption input[type="checkbox"]');
  // CSS module class names are transformed by the test runner; select by type instead.
  const choices = boxes.length ? boxes : host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => { choices[0].click(); choices[1].click(); });
  expect(host.textContent).toContain("Выбрано: 2");
  await act(async () => { button("Добавить · 2").click(); });
  expect(host.textContent).toContain("Добавлено: 1");
  expect(host.textContent).toContain("Выбрано: 1");
  await act(async () => { button("Добавить · 1").click(); });
  expect(posts.map((post) => post.contractorId)).toEqual(["a", "b", "b"]);
  expect(posts[1].id).toBe(posts[2].id);
  await act(async () => root.unmount());
});
