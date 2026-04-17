export const PROJECT_ESTIMATE_TAX_RATE = 0.06;
export const PROJECT_ESTIMATE_COMMISSION_RATE = 0.15;

export type ProjectEstimateTotalsInput = {
  clientSubtotal: number;
  internalSubtotal: number;
  taxRate?: number;
  commissionRate?: number;
};

export type ProjectEstimateTotals = {
  clientSubtotal: number;
  internalSubtotal: number;
  commission: number;
  revenueTotal: number;
  tax: number;
  grossMargin: number;
  marginAfterTax: number;
  marginAfterTaxPct: number;
};

export function roundMoney(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0);
}

export function getNumericAmount(value: unknown): number {
  const num = value == null ? 0 : Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function calcProjectEstimateTotals(
  input: ProjectEstimateTotalsInput,
): ProjectEstimateTotals {
  const taxRate = input.taxRate ?? PROJECT_ESTIMATE_TAX_RATE;
  const commissionRate = input.commissionRate ?? PROJECT_ESTIMATE_COMMISSION_RATE;
  const clientSubtotal = roundMoney(input.clientSubtotal);
  const internalSubtotal = roundMoney(input.internalSubtotal);
  const commission = roundMoney(clientSubtotal * commissionRate);
  const revenueTotal = clientSubtotal + commission;
  const tax = roundMoney(revenueTotal * taxRate);
  const grossMargin = roundMoney(revenueTotal - internalSubtotal);
  const marginAfterTax = roundMoney(grossMargin - tax);
  const marginAfterTaxPct = revenueTotal > 0 ? (marginAfterTax / revenueTotal) * 100 : 0;

  return {
    clientSubtotal,
    internalSubtotal,
    commission,
    revenueTotal,
    tax,
    grossMargin,
    marginAfterTax,
    marginAfterTaxPct,
  };
}
