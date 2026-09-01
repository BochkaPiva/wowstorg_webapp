import {
  calcCashInternalCostTaxAmount,
  isCashPaymentMethod,
} from "@/lib/order-service-internal-costs";
import { getNumericAmount, roundMoney } from "@/lib/project-estimate-totals";

export type ProjectEstimateCostLine = {
  costClient?: unknown;
  costInternal?: unknown;
  paymentMethod?: string | null;
  internalExpenses?: ReadonlyArray<{
    cost?: unknown;
    paymentMethod?: string | null;
  }> | null;
};

export type ProjectEstimateLineSummary = {
  clientSubtotal: number;
  internalSubtotal: number;
  cashInternalSubtotal: number;
  cashInternalCostTax: number;
};

export function getProjectEstimateLineInternalTotal(line: ProjectEstimateCostLine): number {
  return roundMoney(
    getNumericAmount(line.costInternal) +
      (line.internalExpenses ?? []).reduce(
        (sum, expense) => sum + getNumericAmount(expense.cost),
        0,
      ),
  );
}

export function getProjectEstimateLineCashInternalTotal(line: ProjectEstimateCostLine): number {
  const primary = isCashPaymentMethod(line.paymentMethod)
    ? getNumericAmount(line.costInternal)
    : 0;
  const extra = (line.internalExpenses ?? []).reduce(
    (sum, expense) =>
      sum +
      (isCashPaymentMethod(expense.paymentMethod)
        ? getNumericAmount(expense.cost)
        : 0),
    0,
  );
  return roundMoney(primary + extra);
}

/**
 * Canonical totals for editable project-estimate lines.
 * Cash tax is intentionally rounded once from the aggregate cash subtotal.
 */
export function summarizeProjectEstimateLines(
  lines: Iterable<ProjectEstimateCostLine>,
): ProjectEstimateLineSummary {
  let clientSubtotal = 0;
  let internalSubtotal = 0;
  let cashInternalSubtotal = 0;

  for (const line of lines) {
    clientSubtotal += getNumericAmount(line.costClient);
    internalSubtotal += getProjectEstimateLineInternalTotal(line);
    cashInternalSubtotal += getProjectEstimateLineCashInternalTotal(line);
  }

  const roundedCashInternalSubtotal = roundMoney(cashInternalSubtotal);
  return {
    clientSubtotal: roundMoney(clientSubtotal),
    internalSubtotal: roundMoney(internalSubtotal),
    cashInternalSubtotal: roundedCashInternalSubtotal,
    cashInternalCostTax: calcCashInternalCostTaxAmount(roundedCashInternalSubtotal),
  };
}

export function summarizeProjectEstimateSections(
  sections: Iterable<{ lines: Iterable<ProjectEstimateCostLine> }>,
): ProjectEstimateLineSummary {
  function* lines() {
    for (const section of sections) {
      yield* section.lines;
    }
  }

  return summarizeProjectEstimateLines(lines());
}
