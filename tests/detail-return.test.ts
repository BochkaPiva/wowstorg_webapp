import { describe, expect, it } from "vitest";

import {
  orderReturnFallback,
  projectReturnFallback,
  safeDetailReturnTo,
  withDetailReturn,
} from "@/lib/detail-return";

describe("detail return navigation", () => {
  it("preserves an exact internal list URL with filters", () => {
    expect(
      safeDetailReturnTo(
        "/warehouse/queue?sort=updated_desc&status=NEW%2CESTIMATE_SENT",
        "/warehouse/queue",
      ),
    ).toBe("/warehouse/queue?sort=updated_desc&status=NEW%2CESTIMATE_SENT");
  });

  it("rejects external and unrelated return targets", () => {
    expect(safeDetailReturnTo("https://example.com", "/work")).toBe("/work");
    expect(safeDetailReturnTo("//example.com/path", "/work")).toBe("/work");
    expect(safeDetailReturnTo("/api/auth/logout", "/work")).toBe("/work");
  });

  it("adds source and return target without losing an existing hash", () => {
    expect(withDetailReturn("/orders/abc#check-in", "work", "/work?kind=orders")).toBe(
      "/orders/abc?from=work&returnTo=%2Fwork%3Fkind%3Dorders#check-in",
    );
  });

  it("routes order and project details back to the working queue", () => {
    expect(orderReturnFallback("work", { isWarehouse: true })).toEqual({
      href: "/work",
      label: "В рабочую очередь",
    });
    expect(projectReturnFallback("work")).toEqual({
      href: "/work",
      label: "В рабочую очередь",
    });
  });
});
