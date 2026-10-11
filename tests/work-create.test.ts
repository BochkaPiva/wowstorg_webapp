import { describe, expect, it } from "vitest";
import { WORK_CREATE, workCreateBody, workCreatedHref } from "@/lib/work-create";

describe("work queue launch", () => {
  it("creates only proposals, estimates and projects using their existing endpoints", () => {
    expect(Object.keys(WORK_CREATE)).toEqual(["proposal", "estimate", "project"]);
    expect(WORK_CREATE.proposal.endpoint).toBe("/api/proposals");
    expect(WORK_CREATE.estimate.endpoint).toBe("/api/standalone-estimates");
    expect(WORK_CREATE.project.endpoint).toBe("/api/projects");
  });
  it("reuses an exact customer identity rather than creating a duplicate", () => {
    expect(workCreateBody("  Корпоратив ", "  СБЕР ", [{ id: "c", name: "Сбер" }])).toEqual({ title: "Корпоратив", customerId: "c", customerName: undefined });
    expect(workCreateBody("КП", "Новый заказчик", [])).toEqual({ title: "КП", customerId: undefined, customerName: "Новый заказчик" });
    expect(workCreateBody("КП", "", [])).toEqual({ title: "КП", customerId: undefined, customerName: undefined });
  });
  it("opens the real returned entity and never uses a missing or unsafe ID", () => {
    expect(workCreatedHref("proposal", { proposal: { id: "p" } })).toBe("/proposals/p");
    expect(workCreatedHref("estimate", { estimate: { id: "e" } })).toBe("/estimates/e");
    expect(workCreatedHref("project", { project: { id: "x/?evil" } })).toBe("/projects/x%2F%3Fevil");
    expect(() => workCreatedHref("proposal", { project: { id: "p" } })).toThrow("ссылка не получена");
    expect(() => workCreatedHref("project", null)).toThrow();
  });
});
