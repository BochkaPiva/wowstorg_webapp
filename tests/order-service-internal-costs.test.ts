import { describe, expect, it } from "vitest";

import {
  calcCashInternalCostTaxAmount,
  calcOrderServicesInternalCosts,
  calcWarehouseProfitEstimate,
  isCashPaymentMethod,
  normalizeOrderServicePaymentMethod,
} from "@/lib/order-service-internal-costs";

describe("order service internal costs", () => {
  it("subtracts client tax, internal cost and cash tax from grand total", () => {
    const estimate = calcWarehouseProfitEstimate({
      clientGrandTotal: 24_719.2,
      clientTaxAmount: 1_399.2,
      delivery: { enabled: true, internalCost: 2_500, internalPaymentMethod: "CASH" },
      montage: { enabled: true, internalCost: 0, internalPaymentMethod: "NON_CASH" },
    });

    expect(estimate.internalCostTotal).toBe(2_500);
    expect(estimate.cashInternalCostTax).toBe(87.5);
    expect(estimate.profitEstimate).toBe(20_732.5);
    expect(estimate.profitabilityPct).toBe(83.87);
  });

  it("adds 3.5% tax only to cash-paid internal service costs", () => {
    const totals = calcOrderServicesInternalCosts({
      delivery: { enabled: true, internalCost: 8_000, internalPaymentMethod: "CASH" },
      montage: { enabled: true, internalCost: 4_000, internalPaymentMethod: "NON_CASH" },
      demontage: { enabled: false, internalCost: 10_000, internalPaymentMethod: "CASH" },
    });

    expect(totals.internalCostTotal).toBe(12_000);
    expect(totals.cashInternalCostTotal).toBe(8_000);
    expect(totals.cashInternalCostTax).toBe(280);
    expect(totals.internalCostWithCashTax).toBe(12_280);
  });

  it("keeps non-cash and zero-cost services tax-free for the internal cash tax", () => {
    const totals = calcOrderServicesInternalCosts({
      delivery: { enabled: true, internalCost: 7_000, internalPaymentMethod: "NON_CASH" },
      montage: { enabled: true, internalCost: 0, internalPaymentMethod: "CASH" },
    });

    expect(totals.internalCostTotal).toBe(7_000);
    expect(totals.cashInternalCostTotal).toBe(0);
    expect(totals.cashInternalCostTax).toBe(0);
    expect(totals.internalCostWithCashTax).toBe(7_000);
  });

  it("recognizes project contractor cash labels", () => {
    expect(normalizeOrderServicePaymentMethod("CASH")).toBe("CASH");
    expect(normalizeOrderServicePaymentMethod("NON_CASH")).toBe("NON_CASH");
    expect(normalizeOrderServicePaymentMethod(null)).toBe("NON_CASH");
    expect(isCashPaymentMethod("Наличные")).toBe(true);
    expect(isCashPaymentMethod("Наличка")).toBe(true);
    expect(isCashPaymentMethod("Безнал")).toBe(false);
  });
});
