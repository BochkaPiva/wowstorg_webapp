import { describe, expect, it } from "vitest";
import { sectionBackHref, sectionBackLabel } from "@/lib/section-return";
import { safeDetailReturnTo } from "@/lib/detail-return";

describe("consistent page return", () => {
  it.each(["users", "customers", "loyalty", "analytics"])("returns admin/%s to the same named parent", part => {
    const href = sectionBackHref(`/admin/${part}`, "WOWSTORG");
    expect(href).toBe("/admin");
    expect(sectionBackLabel(href)).toBe("Администрирование");
  });
  it("preserves filtered safe return context and derives the label from its real destination", () => {
    const href = safeDetailReturnTo("/work?view=archive&query=Сбер", "/orders");
    expect(new URL(href, "https://wowstorg.internal").searchParams.get("query")).toBe("Сбер");
    expect(href).toContain("view=archive");
    expect(sectionBackLabel(href)).toBe("Рабочая очередь");
    expect(sectionBackLabel("/projects?tab=archive")).toBe("Архив проектов");
    expect(sectionBackLabel("/work?view=estimates")).toBe("Расчёты");
    expect(safeDetailReturnTo("https://example.com/work", "/orders")).toBe("/orders");
  });
  it("keeps role-specific order parents and inventory editor parents", () => {
    expect(sectionBackHref("/orders/1", "GREENWICH")).toBe("/orders");
    expect(sectionBackHref("/orders/1", "WOWSTORG")).toBe("/warehouse/queue");
    expect(sectionBackHref("/inventory/positions/new", "WOWSTORG")).toBe("/inventory/positions");
    expect(sectionBackHref("/inventory/packages/1", "WOWSTORG")).toBe("/inventory/packages");
    expect(sectionBackHref("/inventory/positions", "WOWSTORG")).toBe("/inventory/items");
    expect(sectionBackHref("/warehouse/repair", "WOWSTORG")).toBe("/inventory/items");
  });
});
