import { describe, expect, it } from "vitest";

import { calcOrderPricing, validateOrderDiscount } from "@/server/orders/order-pricing";

function utcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

describe("order pricing", () => {
  it("calculates Greenwich rental, discount, services, tax, and total", () => {
    const pricing = calcOrderPricing({
      startDate: utcDate("2026-05-20"),
      endDate: utcDate("2026-05-22"),
      rentalStartPartOfDay: "MORNING",
      rentalEndPartOfDay: "EVENING",
      payMultiplier: 0.7,
      deliveryPrice: 500,
      montagePrice: 300,
      demontagePrice: 200,
      discount: { rentalDiscountType: "PERCENT", rentalDiscountPercent: 10 },
      lines: [
        { itemId: "chair", requestedQty: 2, pricePerDaySnapshot: 100 },
        { itemId: "table", requestedQty: 1, pricePerDaySnapshot: 200 },
      ],
    });

    expect(pricing.days).toBe(3);
    expect(pricing.rentalSubtotalBeforeDiscount).toBe(840);
    expect(pricing.discountAmount).toBe(84);
    expect(pricing.rentalSubtotalAfterDiscount).toBe(756);
    expect(pricing.servicesTotal).toBe(1000);
    expect(pricing.grandTotalBeforeTax).toBe(1756);
    expect(pricing.taxAmount).toBe(105.36);
    expect(pricing.grandTotal).toBe(1861.36);
    expect(pricing.lineAllocations).toEqual([
      {
        itemId: "chair",
        qty: 2,
        rentalBeforeDiscount: 420,
        discountAmount: 42,
        rentalAfterDiscount: 378,
      },
      {
        itemId: "table",
        qty: 1,
        rentalBeforeDiscount: 420,
        discountAmount: 42,
        rentalAfterDiscount: 378,
      },
    ]);
  });

  it("uses issued quantity when finalizing an issued order", () => {
    const pricing = calcOrderPricing({
      startDate: utcDate("2026-05-20"),
      endDate: utcDate("2026-05-20"),
      rentalStartPartOfDay: "MORNING",
      rentalEndPartOfDay: "EVENING",
      payMultiplier: 1,
      quantityMode: "issued",
      lines: [{ requestedQty: 5, issuedQty: 3, pricePerDaySnapshot: 100 }],
    });

    expect(pricing.rentalSubtotalBeforeDiscount).toBe(300);
  });

  it("ignores stale prices for explicitly disabled services", () => {
    const pricing = calcOrderPricing({
      startDate: utcDate("2026-06-07"),
      endDate: utcDate("2026-06-07"),
      rentalStartPartOfDay: "MORNING",
      rentalEndPartOfDay: "EVENING",
      payMultiplier: 0.7,
      deliveryEnabled: true,
      deliveryPrice: 1500,
      montageEnabled: false,
      montagePrice: 500,
      demontageEnabled: true,
      demontagePrice: 500,
      discount: { rentalDiscountType: "AMOUNT", rentalDiscountAmount: 100 },
      lines: [
        { itemId: "winder", requestedQty: 2, pricePerDaySnapshot: 1200 },
        { itemId: "tile", requestedQty: 8, pricePerDaySnapshot: 0 },
      ],
    });

    expect(pricing.rentalSubtotalAfterDiscount).toBe(1580);
    expect(pricing.servicesTotal).toBe(2000);
    expect(pricing.grandTotalBeforeTax).toBe(3580);
    expect(pricing.taxAmount).toBe(214.8);
    expect(pricing.grandTotal).toBe(3794.8);
  });

  it("keeps legacy service pricing behavior when enabled flags are absent", () => {
    const pricing = calcOrderPricing({
      startDate: utcDate("2026-06-07"),
      endDate: utcDate("2026-06-07"),
      payMultiplier: 1,
      deliveryPrice: 100,
      montagePrice: 200,
      demontagePrice: 300,
      lines: [],
    });

    expect(pricing.servicesTotal).toBe(600);
  });

  it("rejects discounts larger than the rental subtotal", () => {
    expect(
      validateOrderDiscount({
        discount: { rentalDiscountType: "AMOUNT", rentalDiscountAmount: 501 },
        rentalSubtotalBeforeDiscount: 500,
      }),
    ).toEqual({
      ok: false,
      message: "Скидка не может быть больше суммы аренды реквизита",
    });
  });
});
