import { describe, expect, it } from "vitest";

import {
  drawMonthlyBonusPercent,
  restoredBonusValidUntil,
} from "@/server/ratings/greenwich-bonuses";
import { resolveGreenwichDiscount } from "@/server/ratings/greenwich-offers";

describe("Grinvich monthly bonus discount", () => {
  it("adds the monthly bonus to the rating tier", () => {
    expect(resolveGreenwichDiscount({
      tierDiscountPercent: 30,
      monthlyBonusPercent: 10,
    })).toEqual({ discountPercent: 40, source: "MONTHLY_BONUS" });
  });

  it("keeps a stronger personal item offer", () => {
    expect(resolveGreenwichDiscount({
      tierDiscountPercent: 30,
      monthlyBonusPercent: 10,
      personalOfferDiscountPercent: 50,
    })).toEqual({ discountPercent: 50, source: "PERSONAL_OFFER" });
  });

  it("uses tier plus bonus when it is stronger than the personal offer", () => {
    expect(resolveGreenwichDiscount({
      tierDiscountPercent: 30,
      monthlyBonusPercent: 10,
      personalOfferDiscountPercent: 35,
    })).toEqual({ discountPercent: 40, source: "MONTHLY_BONUS" });
  });

  it("never produces a discount above 100 percent", () => {
    expect(resolveGreenwichDiscount({
      tierDiscountPercent: 95,
      monthlyBonusPercent: 12,
    }).discountPercent).toBe(100);
  });

  it("draws only the configured honest 5–12 percent range", () => {
    for (let index = 0; index < 1_000; index += 1) {
      const discount = drawMonthlyBonusPercent();
      expect(discount).toBeGreaterThanOrEqual(5);
      expect(discount).toBeLessThanOrEqual(12);
    }
  });
});

describe("restored Grinvich monthly bonus", () => {
  it("gives at least seven full days after a pre-issue cancellation", () => {
    const now = new Date("2026-09-30T06:00:00.000Z");
    expect(restoredBonusValidUntil(new Date("2026-09-30T18:00:00.000Z"), now)).toEqual(
      new Date("2026-10-07T06:00:00.000Z"),
    );
  });

  it("does not shorten an existing validity period", () => {
    const now = new Date("2026-09-10T06:00:00.000Z");
    const original = new Date("2026-09-30T18:00:00.000Z");
    expect(restoredBonusValidUntil(original, now)).toEqual(original);
  });
});
