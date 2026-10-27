// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderFinancialSummary } from "@/app/orders/OrderFinancialSummary";

const pricing = { grandTotalBeforeTax: 14475, taxRate: 0.06, taxAmount: 868.5, grandTotal: 15343.5 };
const warehouse = { internalCostTotal: 2800, clientTaxAmount: 868.5, cashInternalCostTax: 98, internalCostWithCashTax: 2898, profitEstimate: 11577, profitabilityPct: 75.45 };

describe("order financial summary", () => {
  it("keeps the client total, cost components and profit visible together", () => {
    const el = document.createElement("div");
    el.innerHTML = renderToStaticMarkup(<OrderFinancialSummary pricing={pricing} warehouse={warehouse} discountLabel="15%" />);
    const text = el.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain("15 343,50 ₽");
    expect(text).toContain("3 766,50 ₽");
    expect(text).toContain("11 577,00 ₽");
    expect(text).toContain("Налог на наличные 3,5%");
    expect(text).toContain("Без себестоимости аренды реквизита");
  });
  it("does not expose internal cost and profit without a warehouse summary", () => {
    const html = renderToStaticMarkup(<OrderFinancialSummary pricing={pricing} />);
    expect(html).not.toContain("Оценка прибыли");
    expect(html).not.toContain("Доп. услуги и скрытые траты");
  });
  it("marks a loss with the negative tone", () => {
    const el = document.createElement("div");
    el.innerHTML = renderToStaticMarkup(<OrderFinancialSummary pricing={pricing} warehouse={{ ...warehouse, profitEstimate: -10 }} />);
    const loss = Array.from(el.querySelectorAll("strong")).find((element) => element.textContent?.includes("10,00"));
    expect(loss?.className).toContain("negative");
  });
});
