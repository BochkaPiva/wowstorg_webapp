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
