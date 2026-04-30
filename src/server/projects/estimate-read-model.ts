import { ProjectEstimateSectionKind } from "@prisma/client";

import { normalizedLocalLineCostClientNumber } from "@/lib/project-estimate-local-line";
import {
  calcProjectEstimateRequisiteTotal,
  calcProjectEstimateRequisiteUnitPricePerDay,
  normalizeProjectEstimateDays,
} from "@/lib/project-estimate-requisite";
import { usableStockUnits } from "@/lib/inventory-stock";
import { prisma } from "@/server/db";
import { calcOrderPricing } from "@/server/orders/order-pricing";
import { daysBetween } from "@/server/orders/order-total";

function dec(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

function parseLineLocalExtras(raw: unknown): Record<string, { unit?: string | null }> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, { unit?: string | null }>;
}

function unitLabelFromExtras(extras: Record<string, { unit?: string | null }>, lineId: string): string | null {
  const u = extras[lineId]?.unit;
  const t = typeof u === "string" ? u.trim() : "";
  return t.length > 0 ? t : null;
}

const EDITABLE_ORDER_STATUSES = new Set([
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
]);

export type ProjectEstimateReadLine = {
  id: string;
  position: number;
  lineNumber: number;
  name: string;
  description: string | null;
  lineType: string;
  costClient: string | null;
  costInternal: string | null;
  orderLineId: string | null;
  itemId: string | null;
  /** Ед. изм. для сметы; null/пусто — в UI показываем «шт». */
  unit: string | null;
  unitPriceClient: number | null;
  qty?: number | null;
  plannedDays?: number | null;
  pricePerDaySnapshot?: number | null;
  /** Годные единицы на складе (ведра), без резерва по датам; для строк без позиции каталога — null */
  maxQtyPhysical?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  contractorNote?: string | null;
  contractorRequisites?: string | null;
};

export type ProjectEstimateReadSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL" | "REQUISITE" | "CONTRACTOR" | "DRAFT_REQUISITE";
  linkedOrderId: string | null;
  linkedDraftOrderId: string | null;
  linkedOrderStatus: string | null;
  linkedOrderEditable: boolean;
  /** Только REQUISITE: локальные поля строк (ед. изм.), ключ = id строки read-model. */
  lineLocalExtras: Record<string, { unit?: string | null }> | null;
  lines: ProjectEstimateReadLine[];
};

export async function buildProjectEstimateReadModel(args: {
  projectId: string;
  versionNumber?: number | null;
}) {
  const project = await prisma.project.findUnique({
    where: { id: args.projectId },
    select: {
      id: true,
      title: true,
      orders: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true,
          status: true,
          eventName: true,
          startDate: true,
          endDate: true,
          payMultiplier: true,
          deliveryEnabled: true,
          deliveryComment: true,
          deliveryPrice: true,
          deliveryInternalCost: true,
          montageEnabled: true,
          montageComment: true,
          montagePrice: true,
          montageInternalCost: true,
          demontageEnabled: true,
          demontageComment: true,
          demontagePrice: true,
          demontageInternalCost: true,
          rentalDiscountType: true,
          rentalDiscountPercent: true,
          rentalDiscountAmount: true,
          lines: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              position: true,
              requestedQty: true,
              pricePerDaySnapshot: true,
              warehouseComment: true,
              greenwichComment: true,
              itemId: true,
              item: {
                select: {
                  name: true,
                  total: true,
                  inRepair: true,
                  broken: true,
                  missing: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return null;

  const versions = await prisma.projectEstimateVersion.findMany({
    where: { projectId: args.projectId },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      note: true,
      isPrimary: true,
      createdAt: true,
      createdBy: { select: { displayName: true } },
    },
  });

  const targetNum =
    args.versionNumber != null
      ? args.versionNumber
      : versions.find((v) => v.isPrimary)?.versionNumber ?? versions[0]?.versionNumber ?? null;

  const versionRow =
    targetNum != null
      ? await prisma.projectEstimateVersion.findFirst({
          where: { projectId: args.projectId, versionNumber: targetNum },
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: {
                lines: {
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        })
      : null;

  const orderById = new Map(project.orders.map((order) => [order.id, order]));
  const draftOrder = await prisma.projectDraftOrder.findUnique({
    where: { projectId: args.projectId },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              total: true,
              inRepair: true,
              broken: true,
              missing: true,
            },
          },
        },
      },
    },
  });

  return {
    projectTitle: project.title,
    projectOrders: project.orders.map((o) => ({
      id: o.id,
      status: o.status,
      eventName: o.eventName,
      startDate: o.startDate.toISOString().slice(0, 10),
      endDate: o.endDate.toISOString().slice(0, 10),
    })),
    versions: versions.map((v) => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
    })),
    current:
      versionRow == null
        ? null
        : {
            id: versionRow.id,
            versionNumber: versionRow.versionNumber,
            note: versionRow.note,
            createdAt: versionRow.createdAt.toISOString(),
            sections: [
              ...versionRow.sections.map<ProjectEstimateReadSection>((section) => {
              const linkedOrder =
                section.kind === ProjectEstimateSectionKind.REQUISITE && section.linkedOrderId
                  ? orderById.get(section.linkedOrderId) ?? null
                  : null;

              if (linkedOrder) {
                const extras = parseLineLocalExtras(section.lineLocalExtras);
                const dayCount = normalizeProjectEstimateDays(
                  daysBetween(linkedOrder.startDate, linkedOrder.endDate),
                ) ?? 1;
                const pricing = calcOrderPricing({
                  startDate: linkedOrder.startDate,
                  endDate: linkedOrder.endDate,
                  payMultiplier: linkedOrder.payMultiplier,
                  lines: linkedOrder.lines,
                  discount: linkedOrder,
                });
                const orderLines: ProjectEstimateReadLine[] = linkedOrder.lines.map((line, index) => {
                  const qty = line.requestedQty;
                  const clientTotal = Math.round(pricing.lineAllocations[index]?.rentalAfterDiscount ?? 0);
                  return {
                    id: line.id,
                    position: line.position,
                    lineNumber: index + 1,
                    name: line.item.name,
                    description: [line.greenwichComment, line.warehouseComment].filter(Boolean).join("\n") || null,
                    lineType: "RENTAL",
                    costClient: String(clientTotal),
                    // Собственный реквизит на складе не задаётся отдельной «себестоимостью» в строке — в марже участвуют только реальные затраты (доп. услуги с полем «внутр.»).
                    costInternal: "0",
                    orderLineId: line.id,
                    itemId: line.itemId,
                    unit: unitLabelFromExtras(extras, line.id),
                    unitPriceClient: calcProjectEstimateRequisiteUnitPricePerDay({
                      totalClient: clientTotal,
                      qty,
                      plannedDays: dayCount,
                    }),
                    qty,
                    plannedDays: dayCount,
                    pricePerDaySnapshot: Number(line.pricePerDaySnapshot ?? 0),
                    maxQtyPhysical: usableStockUnits(line.item),
                  };
                });

                const serviceRows = [
                  linkedOrder.deliveryEnabled
                    ? (() => {
                        const sid = `${linkedOrder.id}:delivery`;
                        const clientTotal = Math.round(
                          linkedOrder.deliveryPrice != null ? Number(linkedOrder.deliveryPrice) : 0,
                        );
                        return {
                          id: sid,
                          position: orderLines.length,
                          lineNumber: orderLines.length + 1,
                          name: "Доставка",
                          description: linkedOrder.deliveryComment ?? null,
                          lineType: "SERVICE",
                          costClient:
                            linkedOrder.deliveryPrice != null ? String(Number(linkedOrder.deliveryPrice)) : null,
                          costInternal:
                            linkedOrder.deliveryInternalCost != null
                              ? String(Math.round(Number(linkedOrder.deliveryInternalCost)))
                              : "0",
                          orderLineId: null,
                          itemId: null,
                          unit: unitLabelFromExtras(extras, sid) ?? "усл.",
                          unitPriceClient: clientTotal,
                          qty: 1,
                          plannedDays: null,
                          maxQtyPhysical: null,
                        };
                      })()
                    : null,
                  linkedOrder.montageEnabled
                    ? (() => {
                        const sid = `${linkedOrder.id}:montage`;
                        const clientTotal = Math.round(
                          linkedOrder.montagePrice != null ? Number(linkedOrder.montagePrice) : 0,
                        );
                        return {
                          id: sid,
                          position: orderLines.length + 1,
                          lineNumber: orderLines.length + 2,
                          name: "Монтаж",
                          description: linkedOrder.montageComment ?? null,
                          lineType: "SERVICE",
                          costClient:
                            linkedOrder.montagePrice != null ? String(Number(linkedOrder.montagePrice)) : null,
                          costInternal:
                            linkedOrder.montageInternalCost != null
                              ? String(Math.round(Number(linkedOrder.montageInternalCost)))
                              : "0",
                          orderLineId: null,
                          itemId: null,
                          unit: unitLabelFromExtras(extras, sid) ?? "усл.",
                          unitPriceClient: clientTotal,
                          qty: 1,
                          plannedDays: null,
                          maxQtyPhysical: null,
                        };
                      })()
                    : null,
                  linkedOrder.demontageEnabled
                    ? (() => {
                        const sid = `${linkedOrder.id}:demontage`;
                        const clientTotal = Math.round(
                          linkedOrder.demontagePrice != null ? Number(linkedOrder.demontagePrice) : 0,
                        );
                        return {
                          id: sid,
                          position: orderLines.length + 2,
                          lineNumber: orderLines.length + 3,
                          name: "Демонтаж",
                          description: linkedOrder.demontageComment ?? null,
                          lineType: "SERVICE",
                          costClient:
                            linkedOrder.demontagePrice != null ? String(Number(linkedOrder.demontagePrice)) : null,
                          costInternal:
                            linkedOrder.demontageInternalCost != null
                              ? String(Math.round(Number(linkedOrder.demontageInternalCost)))
                              : "0",
                          orderLineId: null,
                          itemId: null,
                          unit: unitLabelFromExtras(extras, sid) ?? "усл.",
                          unitPriceClient: clientTotal,
                          qty: 1,
                          plannedDays: null,
                          maxQtyPhysical: null,
                        };
                      })()
                    : null,
                ].filter((line): line is NonNullable<typeof line> => line !== null);
                return {
                  id: section.id,
                  sortOrder: section.sortOrder,
                  title: section.title,
                  kind: "REQUISITE",
                  linkedOrderId: section.linkedOrderId,
                  linkedDraftOrderId: null,
                  linkedOrderStatus: linkedOrder.status,
                  linkedOrderEditable: EDITABLE_ORDER_STATUSES.has(linkedOrder.status),
                  lineLocalExtras: extras,
                  lines: [...orderLines, ...serviceRows],
                };
              }

              const sectionKindOut: "LOCAL" | "CONTRACTOR" =
                section.kind === ProjectEstimateSectionKind.CONTRACTOR ? "CONTRACTOR" : "LOCAL";

              return {
                id: section.id,
                sortOrder: section.sortOrder,
                title: section.title,
                kind: sectionKindOut,
                linkedOrderId: section.linkedOrderId,
                linkedDraftOrderId: null,
                linkedOrderStatus: null,
                linkedOrderEditable: false,
                lineLocalExtras: null,
                lines: section.lines.map((line) => {
                  const qtyNum = line.qty != null ? Number(line.qty) : null;
                  let unitP = line.unitPriceClient != null ? Number(line.unitPriceClient) : null;
                  const costNum = normalizedLocalLineCostClientNumber({
                    costClient: dec(line.costClient),
                    qty: qtyNum,
                    unitPriceClient: unitP,
                  });
                  const costC = costNum != null ? String(costNum) : null;
                  if (
                    unitP == null &&
                    costNum != null &&
                    Number.isFinite(costNum) &&
                    qtyNum != null &&
                    qtyNum > 0
                  ) {
                    unitP = Math.round(costNum / qtyNum);
                  }
                  return {
                    id: line.id,
                    position: line.position,
                    lineNumber: line.lineNumber,
                    name: line.name,
                    description: line.description,
                    lineType: line.lineType,
                    costClient: costC,
                    costInternal: dec(line.costInternal),
                    orderLineId: line.orderLineId,
                    itemId: line.itemId,
                    unit: line.unit?.trim() || null,
                    unitPriceClient: unitP,
                    qty: qtyNum,
                    maxQtyPhysical: null,
                    paymentMethod: line.paymentMethod ?? null,
                    paymentStatus: line.paymentStatus ?? null,
                    contractorNote: line.contractorNote ?? null,
                    contractorRequisites: line.contractorRequisites ?? null,
                  };
                }),
              };
            }),
              ...(draftOrder && draftOrder.lines.length > 0
                ? [
                    {
                      id: `draft-order:${draftOrder.id}`,
                      sortOrder:
                        (versionRow.sections.length > 0
                          ? Math.max(...versionRow.sections.map((section) => section.sortOrder)) + 1
                          : 0),
                      title: draftOrder.title?.trim() || "Demo-заявка без дат",
                      kind: "DRAFT_REQUISITE" as const,
                      linkedOrderId: null,
                      linkedDraftOrderId: draftOrder.id,
                      linkedOrderStatus: null,
                      linkedOrderEditable: false,
                      lineLocalExtras: null,
                      lines: draftOrder.lines.map((line, index) => {
                        const qty = line.qty;
                        const days = normalizeProjectEstimateDays(line.plannedDays ?? 1) ?? 1;
                        const clientTotal =
                          line.pricePerDaySnapshot != null
                            ? calcProjectEstimateRequisiteTotal({
                                pricePerDay: line.pricePerDaySnapshot,
                                qty,
                                plannedDays: days,
                              })
                            : null;
                        return {
                          id: line.id,
                          position: line.sortOrder,
                          lineNumber: index + 1,
                          name: line.itemNameSnapshot || line.item.name,
                          description:
                            [
                              `Кол-во: ${line.qty}`,
                              `Дней: ${days}`,
                              line.comment,
                              line.periodGroup ? `Группа периода: ${line.periodGroup}` : null,
                            ]
                              .filter(Boolean)
                              .join("\n") || null,
                          lineType: "DRAFT_RENTAL",
                          costClient: clientTotal != null ? String(clientTotal) : null,
                          costInternal: "0",
                          orderLineId: null,
                          itemId: line.itemId,
                          unit: "шт",
                          unitPriceClient:
                            clientTotal != null
                              ? calcProjectEstimateRequisiteUnitPricePerDay({
                                  totalClient: clientTotal,
                                  qty,
                                  plannedDays: days,
                                })
                              : null,
                          qty,
                          plannedDays: days,
                          pricePerDaySnapshot:
                            line.pricePerDaySnapshot != null ? Number(line.pricePerDaySnapshot) : null,
                          maxQtyPhysical: usableStockUnits(line.item),
                        };
                      }),
                    },
                  ]
                : []),
            ].sort((a, b) => a.sortOrder - b.sortOrder),
          },
  };
}
