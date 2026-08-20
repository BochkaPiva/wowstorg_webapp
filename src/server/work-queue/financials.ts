import { ProjectEstimateSectionKind } from "@prisma/client";

import { normalizedLocalLineCostClientNumber } from "@/lib/project-estimate-local-line";
import {
  calcProjectEstimateRequisiteTotal,
  normalizeProjectEstimateDays,
} from "@/lib/project-estimate-requisite";
import { calcProjectEstimateTotals } from "@/lib/project-estimate-totals";
import { calcOrderPricing } from "@/server/orders/order-pricing";

type QueueOrderLine = {
  requestedQty: number;
  issuedQty?: number | null;
  pricePerDaySnapshot: unknown;
  payMultiplierSnapshot?: unknown;
};

type QueueOrderPricingInput = {
  startDate: Date;
  endDate: Date;
  rentalStartPartOfDay?: "MORNING" | "EVENING";
  rentalEndPartOfDay?: "MORNING" | "EVENING";
  payMultiplier: unknown;
  deliveryEnabled?: boolean;
  deliveryPrice?: unknown;
  montageEnabled?: boolean;
  montagePrice?: unknown;
  demontageEnabled?: boolean;
  demontagePrice?: unknown;
  rentalDiscountType?: string | null;
  rentalDiscountPercent?: unknown;
  rentalDiscountAmount?: unknown;
  clientPaymentMethod?: "NON_CASH" | "CASH" | string | null;
  estimateSentSnapshot?: unknown;
  lines: QueueOrderLine[];
};

type SnapshotLine = {
  requestedQty: number;
  pricePerDaySnapshot: number;
  payMultiplierSnapshot?: number | null;
};

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function snapshotPricingInput(snapshot: unknown): {
  lines: SnapshotLine[];
  discount?: {
    rentalDiscountType?: string | null;
    rentalDiscountPercent?: unknown;
    rentalDiscountAmount?: unknown;
  };
} | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const record = snapshot as Record<string, unknown>;
  if (!Array.isArray(record.lines)) return null;

  const lines = record.lines.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const line = value as Record<string, unknown>;
    const requestedQty = numberOrNull(line.requestedQty);
    const pricePerDaySnapshot = numberOrNull(line.pricePerDaySnapshot);
    const payMultiplierSnapshot =
      line.payMultiplierSnapshot == null ? null : numberOrNull(line.payMultiplierSnapshot);
    if (requestedQty == null || pricePerDaySnapshot == null) return [];
    return [{ requestedQty, pricePerDaySnapshot, payMultiplierSnapshot }];
  });
  if (lines.length === 0) return null;

  const discount =
    record.discount && typeof record.discount === "object"
      ? (record.discount as Record<string, unknown>)
      : null;

  return {
    lines,
    discount: discount
      ? {
          rentalDiscountType:
            typeof discount.rentalDiscountType === "string"
              ? discount.rentalDiscountType
              : undefined,
          rentalDiscountPercent: discount.rentalDiscountPercent,
          rentalDiscountAmount: discount.rentalDiscountAmount,
        }
      : undefined,
  };
}

function orderPricing(input: QueueOrderPricingInput, lines: QueueOrderLine[], discount: {
  rentalDiscountType?: string | null;
  rentalDiscountPercent?: unknown;
  rentalDiscountAmount?: unknown;
}) {
  return calcOrderPricing({
    startDate: input.startDate,
    endDate: input.endDate,
    rentalStartPartOfDay: input.rentalStartPartOfDay,
    rentalEndPartOfDay: input.rentalEndPartOfDay,
    payMultiplier: input.payMultiplier,
    deliveryEnabled: input.deliveryEnabled,
    deliveryPrice: input.deliveryPrice,
    montageEnabled: input.montageEnabled,
    montagePrice: input.montagePrice,
    demontageEnabled: input.demontageEnabled,
    demontagePrice: input.demontagePrice,
    lines,
    discount,
    clientPaymentMethod: input.clientPaymentMethod,
  });
}

/**
 * Current order rows are authoritative. The sent estimate snapshot is a
 * defensive fallback for legacy rows whose live line price snapshots were
 * lost after the estimate had already been sent.
 */
export function resolveQueueOrderTotal(input: QueueOrderPricingInput): number {
  const current = orderPricing(input, input.lines, input);
  if (current.grandTotal > 0) return current.grandTotal;

  const snapshot = snapshotPricingInput(input.estimateSentSnapshot);
  if (!snapshot) return current.grandTotal;

  const historical = orderPricing(
    input,
    snapshot.lines,
    snapshot.discount ?? input,
  );
  return historical.grandTotal > 0 ? historical.grandTotal : current.grandTotal;
}

type ProjectQueueOrder = Omit<QueueOrderPricingInput, "estimateSentSnapshot">;

type ProjectEstimateVersionInput = {
  id: string;
  includeInProjectTotals: boolean;
  commissionEnabled: boolean;
  clientTaxEnabled: boolean;
  clientChargeTaxEnabled: boolean;
  sections: Array<{
    kind: ProjectEstimateSectionKind;
    linkedOrder: ProjectQueueOrder | null;
    lines: Array<{
      costClient: unknown;
      qty: unknown;
      unitPriceClient: unknown;
    }>;
  }>;
};

type ProjectDraftOrderInput = {
  estimateVersionId: string | null;
  lines: Array<{
    qty: number;
    plannedDays: number | null;
    pricePerDaySnapshot: unknown;
  }>;
};

function draftClientSubtotal(
  draftOrders: ProjectDraftOrderInput[],
  versionId: string | null,
): number {
  let subtotal = 0;
  for (const draft of draftOrders) {
    if (versionId != null && draft.estimateVersionId !== versionId) continue;
    for (const line of draft.lines) {
      const plannedDays = normalizeProjectEstimateDays(line.plannedDays ?? 1) ?? 1;
      subtotal +=
        calcProjectEstimateRequisiteTotal({
          pricePerDay: line.pricePerDaySnapshot,
          qty: line.qty,
          plannedDays,
        }) ?? 0;
    }
  }
  return subtotal;
}

function versionRevenueTotal(
  version: ProjectEstimateVersionInput,
  draftOrders: ProjectDraftOrderInput[],
): number {
  let clientSubtotal = draftClientSubtotal(draftOrders, version.id);

  for (const section of version.sections) {
    if (section.kind === ProjectEstimateSectionKind.REQUISITE && section.linkedOrder) {
      clientSubtotal += orderPricing(
        section.linkedOrder,
        section.linkedOrder.lines,
        section.linkedOrder,
      ).grandTotalBeforeTax;
      continue;
    }

    for (const line of section.lines) {
      clientSubtotal +=
        normalizedLocalLineCostClientNumber({
          costClient: numberOrNull(line.costClient),
          qty: numberOrNull(line.qty),
          unitPriceClient: numberOrNull(line.unitPriceClient),
        }) ?? 0;
    }
  }

  return calcProjectEstimateTotals({
    clientSubtotal,
    internalSubtotal: 0,
    commissionEnabled: version.commissionEnabled,
    clientTaxEnabled: version.clientTaxEnabled,
    clientChargeTaxEnabled: version.clientChargeTaxEnabled,
  }).revenueTotal;
}

/**
 * Project cards show the client-facing amount of the project estimate. Linked
 * order totals are only a fallback: summing both would count requisites twice.
 */
export function resolveQueueProjectTotal(input: {
  estimateVersions: ProjectEstimateVersionInput[];
  draftOrders: ProjectDraftOrderInput[];
  linkedOrdersTotal: number;
}): number {
  const includedVersions = input.estimateVersions.filter(
    (version) => version.includeInProjectTotals,
  );
  const estimateTotal =
    includedVersions.length > 0
      ? includedVersions.reduce(
          (sum, version) => sum + versionRevenueTotal(version, input.draftOrders),
          0,
        )
      : calcProjectEstimateTotals({
          clientSubtotal: draftClientSubtotal(input.draftOrders, null),
          internalSubtotal: 0,
        }).revenueTotal;

  return estimateTotal > 0 ? estimateTotal : input.linkedOrdersTotal;
}
