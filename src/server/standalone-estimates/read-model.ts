import { ProjectEstimateSectionKind } from "@prisma/client";

import { normalizedLocalLineCostClientNumber } from "@/lib/project-estimate-local-line";
import { calcProjectEstimateTotals, getNumericAmount } from "@/lib/project-estimate-totals";
import {
  calcCashInternalCostTaxAmount,
  isCashPaymentMethod,
} from "@/lib/order-service-internal-costs";
import { prisma } from "@/server/db";
import type {
  ProjectEstimateReadLine,
  ProjectEstimateReadSection,
} from "@/server/projects/estimate-read-model";

function decimalString(value: { toString(): string } | null | undefined): string | null {
  return value == null ? null : value.toString();
}

function lineInternalTotal(line: {
  costInternal: { toString(): string } | null;
  internalExpenses: Array<{ cost: { toString(): string } | null }>;
}) {
  return (
    getNumericAmount(line.costInternal)
    + line.internalExpenses.reduce((sum, expense) => sum + getNumericAmount(expense.cost), 0)
  );
}

function lineCashInternalTotal(line: {
  costInternal: { toString(): string } | null;
  paymentMethod: string | null;
  internalExpenses: Array<{
    cost: { toString(): string } | null;
    paymentMethod: string | null;
  }>;
}) {
  const primary = isCashPaymentMethod(line.paymentMethod) ? getNumericAmount(line.costInternal) : 0;
  return (
    primary
    + line.internalExpenses.reduce(
      (sum, expense) =>
        sum + (isCashPaymentMethod(expense.paymentMethod) ? getNumericAmount(expense.cost) : 0),
      0,
    )
  );
}

function serializeLine(
  line: {
    id: string;
    position: number;
    lineNumber: number;
    name: string;
    description: string | null;
    lineType: string;
    costClient: { toString(): string } | null;
    costInternal: { toString(): string } | null;
    unit: string | null;
    qty: { toString(): string } | null;
    unitPriceClient: { toString(): string } | null;
    paymentMethod: string | null;
    paymentStatus: string | null;
    contractorNote: string | null;
    contractorRequisites: string | null;
    orderLineId: string | null;
    itemId: string | null;
    internalExpenses: Array<{
      id: string;
      sortOrder: number;
      title: string | null;
      cost: { toString(): string } | null;
      paymentMethod: string | null;
      paymentStatus: string | null;
      contractorNote: string | null;
      contractorRequisites: string | null;
    }>;
  },
): ProjectEstimateReadLine {
  const qty = line.qty == null ? null : Number(line.qty);
  let unitPriceClient = line.unitPriceClient == null ? null : Number(line.unitPriceClient);
  const costClient = normalizedLocalLineCostClientNumber({
    costClient: decimalString(line.costClient),
    qty,
    unitPriceClient,
  });
  if (unitPriceClient == null && costClient != null && qty != null && qty > 0) {
    unitPriceClient = costClient / qty;
  }

  return {
    id: line.id,
    position: line.position,
    lineNumber: line.lineNumber,
    name: line.name,
    description: line.description,
    lineType: line.lineType,
    costClient: costClient == null ? null : String(costClient),
    costInternal: decimalString(line.costInternal),
    orderLineId: line.orderLineId,
    itemId: line.itemId,
    unit: line.unit?.trim() || null,
    unitPriceClient,
    qty,
    maxQtyPhysical: null,
    paymentMethod: line.paymentMethod,
    paymentStatus: line.paymentStatus,
    contractorNote: line.contractorNote,
    contractorRequisites: line.contractorRequisites,
    internalExpenses: line.internalExpenses.map((expense) => ({
      id: expense.id,
      sortOrder: expense.sortOrder,
      title: expense.title,
      cost: decimalString(expense.cost),
      paymentMethod: expense.paymentMethod,
      paymentStatus: expense.paymentStatus,
      contractorNote: expense.contractorNote,
      contractorRequisites: expense.contractorRequisites,
    })),
  };
}

export async function buildStandaloneEstimateReadModel(args: {
  estimateId: string;
  versionNumber?: number | null;
}) {
  const estimate = await prisma.standaloneEstimate.findUnique({
    where: { id: args.estimateId },
    select: {
      id: true,
      title: true,
      convertedAt: true,
      customer: { select: { name: true } },
      leadCustomerName: true,
      estimateVersions: {
        orderBy: [{ sortOrder: "asc" }, { versionNumber: "asc" }],
        include: {
          createdBy: { select: { displayName: true } },
          sections: {
            where: {
              kind: {
                in: [ProjectEstimateSectionKind.LOCAL, ProjectEstimateSectionKind.CONTRACTOR],
              },
            },
            orderBy: { sortOrder: "asc" },
            include: {
              lines: {
                orderBy: { position: "asc" },
                include: {
                  internalExpenses: {
                    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!estimate) return null;

  const versions = estimate.estimateVersions;
  const targetVersionNumber =
    args.versionNumber
    ?? versions.find((version) => version.isPrimary)?.versionNumber
    ?? versions[0]?.versionNumber
    ?? null;
  const current =
    targetVersionNumber == null
      ? null
      : versions.find((version) => version.versionNumber === targetVersionNumber) ?? null;

  function financials(version: (typeof versions)[number]) {
    let clientSubtotal = 0;
    let internalSubtotal = 0;
    let cashInternalSubtotal = 0;

    for (const section of version.sections) {
      if (
        section.kind !== ProjectEstimateSectionKind.LOCAL
        && section.kind !== ProjectEstimateSectionKind.CONTRACTOR
      ) {
        continue;
      }
      for (const line of section.lines) {
        clientSubtotal += getNumericAmount(
          normalizedLocalLineCostClientNumber({
            costClient: decimalString(line.costClient),
            qty: line.qty == null ? null : Number(line.qty),
            unitPriceClient: line.unitPriceClient == null ? null : Number(line.unitPriceClient),
          }),
        );
        internalSubtotal += lineInternalTotal(line);
        cashInternalSubtotal += lineCashInternalTotal(line);
      }
    }

    return calcProjectEstimateTotals({
      clientSubtotal,
      internalSubtotal,
      cashInternalCostTax: calcCashInternalCostTaxAmount(cashInternalSubtotal),
      commissionEnabled: version.commissionEnabled,
      clientTaxEnabled: version.clientTaxEnabled,
      clientChargeTaxEnabled: version.clientChargeTaxEnabled,
    });
  }

  const sections: ProjectEstimateReadSection[] =
    current?.sections.map((section) => ({
      id: section.id,
      sortOrder: section.sortOrder,
      title: section.title,
      kind:
        section.kind === ProjectEstimateSectionKind.CONTRACTOR
          ? "CONTRACTOR"
          : "LOCAL",
      linkedOrderId: null,
      linkedDraftOrderId: null,
      linkedOrderStatus: null,
      linkedOrderEditable: false,
      lineLocalExtras: null,
      lines: section.lines.map(serializeLine),
    })) ?? [];

  return {
    projectTitle: estimate.title,
    estimateTitle: estimate.title,
    customerName: estimate.customer?.name ?? estimate.leadCustomerName ?? null,
    convertedAt: estimate.convertedAt?.toISOString() ?? null,
    projectOrders: [],
    versions: versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      title: version.title?.trim() || `Смета ${version.versionNumber}`,
      note: version.note,
      isPrimary: version.isPrimary,
      sortOrder: version.sortOrder,
      includeInProjectTotals: false,
      createdAt: version.createdAt.toISOString(),
      createdBy: version.createdBy,
      financials: financials(version),
    })),
    current:
      current == null
        ? null
        : {
            id: current.id,
            versionNumber: current.versionNumber,
            title: current.title?.trim() || "Смета",
            note: current.note,
            sortOrder: current.sortOrder,
            includeInProjectTotals: false,
            createdAt: current.createdAt.toISOString(),
            commissionEnabled: current.commissionEnabled,
            clientTaxEnabled: current.clientTaxEnabled,
            clientChargeTaxEnabled: current.clientChargeTaxEnabled,
            sections,
          },
  };
}
