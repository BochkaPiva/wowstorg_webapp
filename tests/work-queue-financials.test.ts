import { describe, expect, it } from "vitest";

import {
  resolveQueueOrderTotal,
  resolveQueueProjectTotal,
} from "@/server/work-queue/financials";

const baseOrder = {
  startDate: new Date("2026-08-01T00:00:00.000Z"),
  endDate: new Date("2026-08-01T00:00:00.000Z"),
  rentalStartPartOfDay: "MORNING" as const,
  rentalEndPartOfDay: "EVENING" as const,
  payMultiplier: 1,
  deliveryEnabled: false,
  deliveryPrice: null,
  montageEnabled: false,
  montagePrice: null,
  demontageEnabled: false,
  demontagePrice: null,
  rentalDiscountType: "NONE",
  rentalDiscountPercent: null,
  rentalDiscountAmount: null,
};

describe("work queue financials", () => {
  it("restores an order amount from its sent estimate snapshot", () => {
    expect(
      resolveQueueOrderTotal({
        ...baseOrder,
        lines: [{ requestedQty: 1, pricePerDaySnapshot: 0 }],
        estimateSentSnapshot: {
          lines: [{ requestedQty: 2, pricePerDaySnapshot: 1_000 }],
          discount: { rentalDiscountType: "NONE" },
        },
      }),
    ).toBe(2_120);
  });

  it("uses the estimate amount for a project instead of counting linked orders twice", () => {
    expect(
      resolveQueueProjectTotal({
        linkedOrdersTotal: 50_000,
        draftOrders: [],
        estimateVersions: [
          {
            id: "estimate-1",
            includeInProjectTotals: true,
            commissionEnabled: false,
            clientTaxEnabled: false,
            clientChargeTaxEnabled: false,
            sections: [
              {
                kind: "LOCAL",
                linkedOrder: null,
                lines: [{ costClient: 75_000, qty: 1, unitPriceClient: 75_000 }],
              },
            ],
          },
        ],
      }),
    ).toBe(75_000);
  });

  it("falls back to linked orders when a project estimate is empty", () => {
    expect(
      resolveQueueProjectTotal({
        linkedOrdersTotal: 42_000,
        draftOrders: [],
        estimateVersions: [],
      }),
    ).toBe(42_000);
  });
});
