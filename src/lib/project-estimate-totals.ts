import { roundMoney } from "@/lib/money";

export const PROJECT_ESTIMATE_TAX_RATE = 0.06;
export const PROJECT_ESTIMATE_COMMISSION_RATE = 0.15;
export const PROJECT_ESTIMATE_VAT_RATE = 0.05;

export type ProjectEstimateFinanceOptions = {
  commissionEnabled?: boolean;
  clientTaxEnabled?: boolean;
  clientChargeTaxEnabled?: boolean;
  vatEnabled?: boolean;
};

export type ProjectEstimateTotalsInput = ProjectEstimateFinanceOptions & {
  clientSubtotal: number;
  internalSubtotal: number;
  cashInternalCostTax?: number;
  taxRate?: number;
  clientChargeTaxRate?: number;
  commissionRate?: number;
};

export function resolveProjectEstimateRates(input: ProjectEstimateFinanceOptions = {}) {
  return {
    commissionRate:
      input.commissionEnabled === false ? 0 : PROJECT_ESTIMATE_COMMISSION_RATE,
    taxRate: input.clientTaxEnabled === false ? 0 : PROJECT_ESTIMATE_TAX_RATE,
    clientChargeTaxRate:
      input.clientChargeTaxEnabled === true ? PROJECT_ESTIMATE_TAX_RATE : 0,
    vatRate: input.vatEnabled === true ? PROJECT_ESTIMATE_VAT_RATE : 0,
  };
}

export type ProjectEstimateTotals = {
  clientSubtotal: number;
  internalSubtotal: number;
  cashInternalCostTax: number;
  internalExpensesTotal: number;
  commission: number;
  clientChargeTax: number;
  vat: number;
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
  const vat = roundMoney(revenueBeforeClientChargeTax * resolvedRates.vatRate);
  const revenueExcludingVat = roundMoney(revenueBeforeClientChargeTax + clientChargeTax);
  const revenueTotal = roundMoney(revenueExcludingVat + vat);
  const tax = roundMoney(revenueBeforeClientChargeTax * taxRate);
  const grossMargin = roundMoney(revenueExcludingVat - internalExpensesTotal);
  const marginAfterTax = roundMoney(grossMargin - tax);
  const marginAfterTaxPct = revenueExcludingVat > 0 ? roundMoney((marginAfterTax / revenueExcludingVat) * 100) : 0;

  return {
    clientSubtotal,
    internalSubtotal,
    cashInternalCostTax,
    internalExpensesTotal,
    commission,
    clientChargeTax,
    vat,
    revenueTotal,
    tax,
    grossMargin,
    marginAfterTax,
    marginAfterTaxPct,
  };
}
