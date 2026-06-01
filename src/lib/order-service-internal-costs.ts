import { ORDER_CASH_INTERNAL_COST_TAX_RATE } from "@/lib/constants";
import { roundMoney } from "@/lib/money";

export const ORDER_SERVICE_PAYMENT_METHODS = ["NON_CASH", "CASH"] as const;

export type OrderServicePaymentMethod = (typeof ORDER_SERVICE_PAYMENT_METHODS)[number];

export type OrderServiceInternalCostInput = {
  enabled?: boolean | null;
  internalCost?: unknown;
  internalPaymentMethod?: OrderServicePaymentMethod | string | null;
};

export type OrderHiddenExpenseInput = {
  cost?: unknown;
  internalPaymentMethod?: OrderServicePaymentMethod | string | null;
};

function num(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export const ORDER_SERVICE_PAYMENT_METHOD_LABELS: Record<OrderServicePaymentMethod, string> = {
  NON_CASH: "Безнал",
  CASH: "Наличка",
};

export const ORDER_SERVICE_INTERNAL_PAYMENT_FIELD_LABEL = "Оплата";

export function calcCashInternalCostTaxAmount(
  cashInternalCostTotal: number,
  cashTaxRate: number = ORDER_CASH_INTERNAL_COST_TAX_RATE,
): number {
  const base = Number(cashInternalCostTotal);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return roundMoney(base * cashTaxRate);
}

export function calcWarehouseProfitEstimate(input: {
  clientGrandTotal: number;
  clientTaxAmount: number;
  delivery?: OrderServiceInternalCostInput;
  montage?: OrderServiceInternalCostInput;
  demontage?: OrderServiceInternalCostInput;
  hiddenExpenses?: OrderHiddenExpenseInput[] | null;
}) {
  const services = calcOrderServicesInternalCosts({
    delivery: input.delivery,
    montage: input.montage,
    demontage: input.demontage,
    hiddenExpenses: input.hiddenExpenses,
  });
  const clientGrandTotal = roundMoney(input.clientGrandTotal);
  const clientTaxAmount = roundMoney(input.clientTaxAmount);
  const profitEstimate = roundMoney(
    clientGrandTotal -
      clientTaxAmount -
      services.internalCostTotal -
      services.cashInternalCostTax,
  );
  const profitabilityPct =
    clientGrandTotal > 0 ? roundMoney((profitEstimate / clientGrandTotal) * 100) : 0;

  return {
    ...services,
    clientGrandTotal,
    clientTaxAmount,
    profitEstimate,
    profitabilityPct,
  };
}

export function normalizeOrderServicePaymentMethod(
  value: OrderServicePaymentMethod | string | null | undefined,
): OrderServicePaymentMethod {
  return value === "CASH" ? "CASH" : "NON_CASH";
}

export function isCashPaymentMethod(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase();
  return normalized === "CASH" || normalized === "НАЛИЧНЫЕ" || normalized === "НАЛИЧКА";
}

export function calcOrderServicesInternalCosts(input: {
  delivery?: OrderServiceInternalCostInput;
  montage?: OrderServiceInternalCostInput;
  demontage?: OrderServiceInternalCostInput;
  hiddenExpenses?: OrderHiddenExpenseInput[] | null;
  cashTaxRate?: number;
}) {
  const services = [input.delivery, input.montage, input.demontage].filter(
    (service): service is OrderServiceInternalCostInput => Boolean(service?.enabled),
  );
  const hiddenExpenses = (input.hiddenExpenses ?? []).filter((expense) => num(expense.cost) > 0);
  const internalCostTotal =
    services.reduce((sum, service) => sum + num(service.internalCost), 0) +
    hiddenExpenses.reduce((sum, expense) => sum + num(expense.cost), 0);
  const cashInternalCostTotal = services.reduce((sum, service) => {
    if (normalizeOrderServicePaymentMethod(service.internalPaymentMethod) !== "CASH") return sum;
    return sum + num(service.internalCost);
  }, 0) + hiddenExpenses.reduce((sum, expense) => {
    if (normalizeOrderServicePaymentMethod(expense.internalPaymentMethod) !== "CASH") return sum;
    return sum + num(expense.cost);
  }, 0);
  const cashTaxRate = input.cashTaxRate ?? ORDER_CASH_INTERNAL_COST_TAX_RATE;
  const cashInternalCostTax = calcCashInternalCostTaxAmount(cashInternalCostTotal, cashTaxRate);

  return {
    internalCostTotal: roundMoney(internalCostTotal),
    cashInternalCostTotal: roundMoney(cashInternalCostTotal),
    cashInternalCostTax,
    internalCostWithCashTax: roundMoney(internalCostTotal + cashInternalCostTax),
    cashTaxRate,
  };
}
