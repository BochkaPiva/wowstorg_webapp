import { describe, expect, it } from "vitest";

import { calcProjectEstimateRequisiteTotal } from "@/lib/project-estimate-requisite";
import { calcProjectEstimateTotals } from "@/lib/project-estimate-totals";

describe("project estimate totals", () => {
  it("adds agency commission to revenue and taxes the revenue total", () => {
    expect(
      calcProjectEstimateTotals({
        clientSubtotal: 100_000,
        internalSubtotal: 60_000,
      }),
    ).toMatchObject({
      clientSubtotal: 100_000,
      internalSubtotal: 60_000,
      commission: 15_000,
      revenueTotal: 115_000,
      tax: 6_900,
      grossMargin: 55_000,
      marginAfterTax: 48_100,
    });
  });

  it("calculates requisite line totals from daily price, quantity, days and multiplier", () => {
    expect(
      calcProjectEstimateRequisiteTotal({
        pricePerDay: "1200",
        qty: 2,
        plannedDays: 3,
        payMultiplier: 0.7,
      }),
    ).toBe(5040);
  });

  it("returns null for incomplete requisite line inputs", () => {
    expect(
      calcProjectEstimateRequisiteTotal({
        pricePerDay: "",
        qty: 2,
        plannedDays: 3,
      }),
    ).toBeNull();
  });
});
