import { describe, expect, it } from "vitest";

import { calcProjectEstimateRequisiteTotal } from "@/lib/project-estimate-requisite";
import { calcProjectEstimateTotals } from "@/lib/project-estimate-totals";

describe("project estimate totals", () => {
  it("matches Topline and treats the VAT adjustment as a client surcharge", () => {
    const inputs = { clientSubtotal: 2500, internalSubtotal: 1000, cashInternalCostTax: 35, vatEnabled: true };
    expect(calcProjectEstimateTotals(inputs)).toMatchObject({
      commission: 375,
      vat: 143.75,
      revenueTotal: 3018.75,
      tax: 172.5,
      marginAfterTax: 1811.25,
      marginAfterTaxPct: 60,
    });
    expect(calcProjectEstimateTotals({ ...inputs, clientChargeTaxEnabled: true })).toMatchObject({
      clientChargeTax: 172.5,
      vat: 143.75,
      revenueTotal: 3191.25,
    });
    expect(calcProjectEstimateTotals({ ...inputs, commissionEnabled: false, clientTaxEnabled: false })).toMatchObject({
      commission: 0,
      vat: 125,
      revenueTotal: 2625,
      marginAfterTax: 1590,
    });
    expect(calcProjectEstimateTotals({ ...inputs, vatEnabled: false })).toMatchObject({ vat: 0, revenueTotal: 2875 });
  });

  it("subtracts client tax and cash internal tax from margin", () => {
    expect(
      calcProjectEstimateTotals({
        clientSubtotal: 23_320,
        internalSubtotal: 2_500,
        cashInternalCostTax: 87.5,
        commissionRate: 0,
      }),
    ).toMatchObject({
      tax: 1_399.2,
      grossMargin: 20_732.5,
      marginAfterTax: 19_333.3,
      internalExpensesTotal: 2_587.5,
    });
  });

  it("adds agency commission to revenue and taxes the revenue total", () => {
    expect(
      calcProjectEstimateTotals({
        clientSubtotal: 100_000,
        internalSubtotal: 60_000,
      }),
    ).toMatchObject({
      clientSubtotal: 100_000,
      internalSubtotal: 60_000,
      cashInternalCostTax: 0,
      internalExpensesTotal: 60_000,
      commission: 15_000,
      revenueTotal: 115_000,
      tax: 6_900,
      grossMargin: 55_000,
      marginAfterTax: 48_100,
    });
  });

  it("can add client-facing 6 percent tax without replacing the internal 6 percent expense tax", () => {
    expect(
      calcProjectEstimateTotals({
        clientSubtotal: 100_000,
        internalSubtotal: 60_000,
        commissionEnabled: true,
        clientTaxEnabled: true,
        clientChargeTaxEnabled: true,
      }),
    ).toMatchObject({
      commission: 15_000,
      clientChargeTax: 6_900,
      revenueTotal: 121_900,
      tax: 6_900,
      grossMargin: 61_900,
      marginAfterTax: 55_000,
    });
  });

  it("keeps cash tax separate from internal subtotal in margin", () => {
    expect(
      calcProjectEstimateTotals({
        clientSubtotal: 100_000,
        internalSubtotal: 60_000,
        cashInternalCostTax: 700,
      }),
    ).toMatchObject({
      internalSubtotal: 60_000,
      cashInternalCostTax: 700,
      internalExpensesTotal: 60_700,
      grossMargin: 54_300,
      marginAfterTax: 47_400,
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

  it("matches Gazprom Arena manual estimate totals", () => {
    expect(
      calcProjectEstimateTotals({
        clientSubtotal: 112_500,
        internalSubtotal: 86_500,
        cashInternalCostTax: 105,
      }),
    ).toMatchObject({
      commission: 16_875,
      revenueTotal: 129_375,
      tax: 7_762.5,
      grossMargin: 42_770,
      marginAfterTax: 35_007.5,
      marginAfterTaxPct: 27.06,
    });
  });
});
