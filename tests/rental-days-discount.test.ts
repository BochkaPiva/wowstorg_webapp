import { describe, expect, it } from "vitest";
import { rentalDaysDiscount } from "@/lib/rental-days-discount";
import { calcOrderPricing, validateOrderDiscount } from "@/lib/order-pricing";

describe("fixed-amount discount calculated from excluded rental days", () => {
  it("excludes three of seven days without changing the reserved period or services", () => {
    const result = rentalDaysDiscount({ rentalSubtotal: 1400, rentalDays: 7, excludedDays: 3 });
    expect(result).toEqual({ ok: true, amount: 600, chargedDays: 4 });
    if (!result.ok) throw new Error(result.message);
    const pricing = calcOrderPricing({
      startDate: new Date("2026-10-07Z"), endDate: new Date("2026-10-13Z"),
      rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING", payMultiplier: 0.5,
      lines: [{ requestedQty: 2, pricePerDaySnapshot: 200 }, { requestedQty: 1, pricePerDaySnapshot: 0 }],
      discount: { rentalDiscountType: "AMOUNT", rentalDiscountAmount: result.amount }, deliveryPrice: 100,
    });
    expect(pricing.days).toBe(7); expect(pricing.rentalSubtotalAfterDiscount).toBe(800);
    expect(pricing.servicesTotal).toBe(100); expect(pricing.taxAmount).toBe(54); expect(pricing.grandTotal).toBe(954);
    expect(validateOrderDiscount({ discount: { rentalDiscountType: "AMOUNT", rentalDiscountAmount: result.amount }, rentalSubtotalBeforeDiscount: 1400 })).toEqual({ ok: true });
  });
  it("rounds once at the end and can exclude the entire rental period", () => {
    expect(rentalDaysDiscount({ rentalSubtotal: 100, rentalDays: 3, excludedDays: 2 })).toEqual({ ok: true, amount: 66.67, chargedDays: 1 });
    expect(rentalDaysDiscount({ rentalSubtotal: 100, rentalDays: 3, excludedDays: 3 })).toEqual({ ok: true, amount: 100, chargedDays: 0 });
  });
  it.each([0, -1, 8, 1.5, NaN, Infinity])("rejects invalid excluded days %s", excludedDays => {
    expect(rentalDaysDiscount({ rentalSubtotal: 1400, rentalDays: 7, excludedDays }).ok).toBe(false);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid rental subtotals %s", rentalSubtotal => {
    expect(rentalDaysDiscount({ rentalSubtotal, rentalDays: 7, excludedDays: 1 }).ok).toBe(false);
  });
  it("rejects missing durations and amounts smaller than one kopeck", () => {
    expect(rentalDaysDiscount({ rentalSubtotal: 100, rentalDays: 0, excludedDays: 1 }).ok).toBe(false);
    expect(rentalDaysDiscount({ rentalSubtotal: 0.01, rentalDays: 100, excludedDays: 1 }).ok).toBe(false);
  });
});
