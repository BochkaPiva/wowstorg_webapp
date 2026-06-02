import { roundMoney } from "@/lib/money";

export const PROJECT_ESTIMATE_TAX_RATE = 0.06;
export const PROJECT_ESTIMATE_COMMISSION_RATE = 0.15;

export type ProjectEstimateFinanceOptions = {
  commissionEnabled?: boolean;
  clientTaxEnabled?: boolean;
  clientChargeTaxEnabled?: boolean;
};

export type ProjectEstimateTotalsInput = {
  clientSubtotal: number;
  internalSubtotal: number;
  cashInternalCostTax?: number;
  taxRate?: number;
  clientChargeTaxRate?: number;
  commissionRate?: number;
  commissionEnabled?: boolean;
  clientTaxEnabled?: boolean;
  clientChargeTaxEnabled?: boolean;
};

export function resolveProjectEstimateRates(input: ProjectEstimateFinanceOptions = {}) {
  return {
    commissionRate:
      input.commissionEnabled === false ? 0 : PROJECT_ESTIMATE_COMMISSION_RATE,
    taxRate: input.clientTaxEnabled === false ? 0 : PROJECT_ESTIMATE_TAX_RATE,
    clientChargeTaxRate:
      input.clientChargeTaxEnabled === true ? PROJECT_ESTIMATE_TAX_RATE : 0,
  };
}

export type ProjectEstimateTotals = {
  clientSubtotal: number;
  internalSubtotal: number;
  cashInternalCostTax: number;
  internalExpensesTotal: number;
  commission: number;
  clientChargeTax: number;
  revenueTotal: number;
  tax: number;
  grossMargin: number;
  marginAfterTax: number;
  marginAfterTaxPct: number;
};

export { roundMoney };

export function getNumericAmount(value: unknown): number {
  const num = value == null ? 0 : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function calcProjectEstimateTotals(
  input: ProjectEstimateTotalsInput,
): ProjectEstimateTotals {
  const resolvedRates = resolveProjectEstimateRates(input);
  const taxRate = input.taxRate ?? resolvedRates.taxRate;
  const clientChargeTaxRate =
    input.clientChargeTaxRate ?? resolvedRates.clientChargeTaxRate;
  const commissionRate = input.commissionRate ?? resolvedRates.commissionRate;
  const clientSubtotal = roundMoney(input.clientSubtotal);
  const internalSubtotal = roundMoney(input.internalSubtotal);
  const cashInternalCostTax = roundMoney(input.cashInternalCostTax ?? 0);
  const internalExpensesTotal = roundMoney(internalSubtotal + cashInternalCostTax);
  const commission = roundMoney(clientSubtotal * commissionRate);
  const revenueBeforeClientChargeTax = roundMoney(clientSubtotal + commission);
  const clientChargeTax = roundMoney(revenueBeforeClientChargeTax * clientChargeTaxRate);
  const revenueTotal = roundMoney(revenueBeforeClientChargeTax + clientChargeTax);
  const tax = roundMoney(revenueBeforeClientChargeTax * taxRate);
  const grossMargin = roundMoney(revenueTotal - internalSubtotal - cashInternalCostTax);
  const marginAfterTax = roundMoney(grossMargin - tax);
  const marginAfterTaxPct = revenueTotal > 0 ? roundMoney((marginAfterTax / revenueTotal) * 100) : 0;

  return {
    clientSubtotal,
    internalSubtotal,
    cashInternalCostTax,
    internalExpensesTotal,
    commission,
    clientChargeTax,
    revenueTotal,
    tax,
    grossMargin,
    marginAfterTax,
    marginAfterTaxPct,
  };
}
