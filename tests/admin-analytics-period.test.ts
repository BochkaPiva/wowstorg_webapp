import { describe, expect, it } from "vitest";

import { orderRentalPeriodWhere } from "@/server/analytics/period-filters";

describe("admin analytics order forecast period", () => {
  it("uses interval intersection so an active rental ending after the report date is included", () => {
    expect(orderRentalPeriodWhere({ from: "2026-08-01", to: "2026-08-28" })).toEqual({
      startDate: { lt: new Date("2026-08-29T00:00:00.000Z") },
      endDate: { gte: new Date("2026-08-01T00:00:00.000Z") },
    });
  });

  it("does not constrain an unbounded forecast", () => {
    expect(orderRentalPeriodWhere({})).toEqual({});
  });
});
