import { ProjectEstimateSectionKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { daysBetween } from "@/server/orders/order-total";

function dec(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
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
  qty?: number | null;
  plannedDays?: number | null;
  pricePerDaySnapshot?: number | null;
};

export type ProjectEstimateReadSection = {
  id: string;
  sortOrder: number;
  title: string;
  kind: "LOCAL" | "REQUISITE" | "DRAFT_REQUISITE";
  linkedOrderId: string | null;
  linkedDraftOrderId: string | null;
  linkedOrderStatus: string | null;
  linkedOrderEditable: boolean;
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
          montageEnabled: true,
          montageComment: true,
          montagePrice: true,
          demontageEnabled: true,
          demontageComment: true,
          demontagePrice: true,
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
              item: { select: { name: true } },
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
            select: { id: true, name: true },
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
                const dayCount = daysBetween(linkedOrder.startDate, linkedOrder.endDate);
                const payMultiplier =
                  linkedOrder.payMultiplier != null ? Number(linkedOrder.payMultiplier) : 1;
                const orderLines: ProjectEstimateReadLine[] = linkedOrder.lines.map((line, index) => ({
                  id: line.id,
                  position: line.position,
                  lineNumber: index + 1,
                  name: line.item.name,
                  description: [line.greenwichComment, line.warehouseComment].filter(Boolean).join("\n") || null,
                  lineType: "RENTAL",
                  costClient: String(
                    Math.round(
                      Number(line.pricePerDaySnapshot ?? 0) * line.requestedQty * dayCount * payMultiplier,
                    ),
                  ),
                  costInternal: String(
                    Math.round(Number(line.pricePerDaySnapshot ?? 0) * line.requestedQty * dayCount),
                  ),
                  orderLineId: line.id,
                  itemId: line.itemId,
                  qty: line.requestedQty,
                  plannedDays: dayCount,
                  pricePerDaySnapshot: Number(line.pricePerDaySnapshot ?? 0),
                }));

                const serviceRows = [
                  linkedOrder.deliveryEnabled
                    ? {
                        id: `${linkedOrder.id}:delivery`,
                        position: orderLines.length,
                        lineNumber: orderLines.length + 1,
                        name: "Доставка",
                        description: linkedOrder.deliveryComment ?? null,
                        lineType: "SERVICE",
                        costClient:
                          linkedOrder.deliveryPrice != null ? String(Number(linkedOrder.deliveryPrice)) : null,
                        costInternal: null,
                        orderLineId: null,
                        itemId: null,
                      }
                    : null,
                  linkedOrder.montageEnabled
                    ? {
                        id: `${linkedOrder.id}:montage`,
                        position: orderLines.length + 1,
                        lineNumber: orderLines.length + 2,
                        name: "Монтаж",
                        description: linkedOrder.montageComment ?? null,
                        lineType: "SERVICE",
                        costClient:
                          linkedOrder.montagePrice != null ? String(Number(linkedOrder.montagePrice)) : null,
                        costInternal: null,
                        orderLineId: null,
                        itemId: null,
                      }
                    : null,
                  linkedOrder.demontageEnabled
                    ? {
                        id: `${linkedOrder.id}:demontage`,
                        position: orderLines.length + 2,
                        lineNumber: orderLines.length + 3,
                        name: "Демонтаж",
                        description: linkedOrder.demontageComment ?? null,
                        lineType: "SERVICE",
                        costClient:
                          linkedOrder.demontagePrice != null ? String(Number(linkedOrder.demontagePrice)) : null,
                        costInternal: null,
                        orderLineId: null,
                        itemId: null,
                      }
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
                  lines: [...orderLines, ...serviceRows],
                };
              }

              return {
                id: section.id,
                sortOrder: section.sortOrder,
                title: section.title,
                kind: section.kind,
                linkedOrderId: section.linkedOrderId,
                linkedDraftOrderId: null,
                linkedOrderStatus: null,
                linkedOrderEditable: false,
                lines: section.lines.map((line) => ({
                  id: line.id,
                  position: line.position,
                  lineNumber: line.lineNumber,
                  name: line.name,
                  description: line.description,
                  lineType: line.lineType,
                  costClient: dec(line.costClient),
                  costInternal: dec(line.costInternal),
                  orderLineId: line.orderLineId,
                  itemId: line.itemId,
                })),
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
                      lines: draftOrder.lines.map((line, index) => ({
                        id: line.id,
                        position: line.sortOrder,
                        lineNumber: index + 1,
                        name: line.itemNameSnapshot || line.item.name,
                        description:
                          [
                            `Кол-во: ${line.qty}`,
                            `Дней: ${Math.max(1, line.plannedDays ?? 1)}`,
                            line.comment,
                            line.periodGroup ? `Группа периода: ${line.periodGroup}` : null,
                          ]
                            .filter(Boolean)
                            .join("\n") || null,
                        lineType: "DRAFT_RENTAL",
                        costClient:
                          line.pricePerDaySnapshot != null
                            ? String(
                                Math.round(
                                  Number(line.pricePerDaySnapshot) * line.qty * Math.max(1, line.plannedDays ?? 1),
                                ),
                              )
                            : null,
                        costInternal:
                          line.pricePerDaySnapshot != null
                            ? String(
                                Math.round(
                                  Number(line.pricePerDaySnapshot) * line.qty * Math.max(1, line.plannedDays ?? 1),
                                ),
                              )
                            : null,
                        orderLineId: null,
                        itemId: line.itemId,
                        qty: line.qty,
                        plannedDays: Math.max(1, line.plannedDays ?? 1),
                        pricePerDaySnapshot:
                          line.pricePerDaySnapshot != null ? Number(line.pricePerDaySnapshot) : null,
                      })),
                    },
                  ]
                : []),
            ].sort((a, b) => a.sortOrder - b.sortOrder),
          },
  };
}
