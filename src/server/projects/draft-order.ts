import { Prisma, ProjectActivityKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { CreateOrderError, createOrderInTransaction } from "@/server/orders/create-order";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

function computeAvailableNow(item: {
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
}) {
  return Math.max(0, item.total - item.inRepair - item.broken - item.missing);
}

export type DraftOrderLineDto = {
  id: string;
  sortOrder: number;
  itemId: string;
  itemName: string;
  qty: number;
  comment: string | null;
  periodGroup: string | null;
  pricePerDaySnapshot: number | null;
  availableNow: number;
  lastAvailableQty: number | null;
  lastAvailabilityNote: string | null;
};

export type DraftOrderDto = {
  id: string;
  estimateVersionId: string | null;
  title: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  lines: DraftOrderLineDto[];
};

type DraftOrderRow = Prisma.ProjectDraftOrderGetPayload<{
  include: {
    lines: {
      orderBy: { sortOrder: "asc" };
      include: {
        item: {
          select: {
            id: true;
            name: true;
            total: true;
            inRepair: true;
            broken: true;
            missing: true;
          };
        };
      };
    };
  };
}>;

export function serializeDraftOrder(row: DraftOrderRow | null): DraftOrderDto | null {
  if (!row) return null;
  return {
    id: row.id,
    estimateVersionId: row.estimateVersionId ?? null,
    title: row.title ?? null,
    comment: row.comment ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      sortOrder: line.sortOrder,
      itemId: line.itemId,
      itemName: line.itemNameSnapshot || line.item.name,
      qty: line.qty,
      comment: line.comment ?? null,
      periodGroup: line.periodGroup ?? null,
      pricePerDaySnapshot: line.pricePerDaySnapshot != null ? Number(line.pricePerDaySnapshot) : null,
      availableNow: computeAvailableNow(line.item),
      lastAvailableQty: line.lastAvailableQty ?? null,
      lastAvailabilityNote: line.lastAvailabilityNote ?? null,
    })),
  };
}

export type MaterializeDraftPeriodInput = {
  key: string;
  title?: string | null;
  readyByDate: string;
  startDate: string;
  endDate: string;
  lineIds: string[];
};

export class ProjectDraftOrderError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.details = details;
  }
}

export async function materializeProjectDraftOrder(args: {
  projectId: string;
  actorUserId: string;
  targetEstimateVersionId?: string | null;
  periods: MaterializeDraftPeriodInput[];
}) {
  return prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: args.projectId, archivedAt: null },
        select: { id: true, title: true, customerId: true },
      });
      if (!project) throw new ProjectDraftOrderError("PROJECT_NOT_FOUND");

      const draft = await tx.projectDraftOrder.findUnique({
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
      if (!draft) throw new ProjectDraftOrderError("DRAFT_NOT_FOUND");
      if (draft.lines.length === 0) throw new ProjectDraftOrderError("DRAFT_EMPTY");
      if (args.periods.length === 0) throw new ProjectDraftOrderError("PERIODS_REQUIRED");

      const targetEstimateVersionId = args.targetEstimateVersionId?.trim() || draft.estimateVersionId || null;
      if (targetEstimateVersionId) {
        const version = await tx.projectEstimateVersion.findFirst({
          where: { id: targetEstimateVersionId, projectId: args.projectId },
          select: { id: true },
        });
        if (!version) throw new ProjectDraftOrderError("ESTIMATE_VERSION_NOT_FOUND");
      }

      const uniqueLineIds = new Set<string>();
      for (const period of args.periods) {
        if (!period.key.trim()) throw new ProjectDraftOrderError("PERIOD_KEY_REQUIRED");
        if (period.lineIds.length === 0) throw new ProjectDraftOrderError("PERIOD_LINES_REQUIRED");
        for (const lineId of period.lineIds) {
          if (uniqueLineIds.has(lineId)) {
            throw new ProjectDraftOrderError("LINE_ASSIGNED_TWICE", undefined, { lineId });
          }
          uniqueLineIds.add(lineId);
        }
      }

      const draftLineById = new Map(draft.lines.map((line) => [line.id, line]));
      if (uniqueLineIds.size !== draft.lines.length) {
        const missingLineIds = draft.lines.map((line) => line.id).filter((id) => !uniqueLineIds.has(id));
        throw new ProjectDraftOrderError("LINES_NOT_ASSIGNED", undefined, { missingLineIds });
      }
      for (const lineId of uniqueLineIds) {
        if (!draftLineById.has(lineId)) {
          throw new ProjectDraftOrderError("LINE_NOT_FOUND", undefined, { lineId });
        }
      }

      const createdOrders: Array<{ id: string; periodKey: string; title: string }> = [];
      const unavailableLines: Array<{ lineId: string; availableQty: number; note: string }> = [];
      const materializedLineIds = new Set<string>();

      for (const period of args.periods) {
        const groupLines = period.lineIds.map((lineId) => draftLineById.get(lineId)!);
        const reserved = await getReservedQtyByItemId({
          db: tx,
          startDate: new Date(`${period.startDate}T00:00:00.000Z`),
          endDate: new Date(`${period.endDate}T00:00:00.000Z`),
        });
        const allocatedByItem = new Map<string, number>();
        const orderLines: Array<{ itemId: string; qty: number; comment?: string | null }> = [];
        const successfulLineIds: string[] = [];

        for (const line of groupLines) {
          const item = line.item;
          const availableNow = computeAvailableNow(item);
          const reservedQty = reserved.get(line.itemId) ?? 0;
          const alreadyAllocated = allocatedByItem.get(line.itemId) ?? 0;
          const availableForPeriod = Math.max(0, availableNow - reservedQty - alreadyAllocated);

          if (line.qty <= availableForPeriod) {
            allocatedByItem.set(line.itemId, alreadyAllocated + line.qty);
            orderLines.push({
              itemId: line.itemId,
              qty: line.qty,
              comment: line.comment ?? undefined,
            });
            successfulLineIds.push(line.id);
          } else {
            unavailableLines.push({
              lineId: line.id,
              availableQty: availableForPeriod,
              note:
                availableForPeriod > 0
                  ? `На период ${period.startDate} — ${period.endDate} доступно только ${availableForPeriod} шт.`
                  : `На период ${period.startDate} — ${period.endDate} сейчас нет свободного остатка.`,
            });
          }
        }

        if (orderLines.length === 0) {
          continue;
        }

        const eventTitleBase = draft.title?.trim() || project.title;
        const periodTitle = period.title?.trim();
        const eventName =
          args.periods.length > 1 && periodTitle ? `${eventTitleBase} · ${periodTitle}` : eventTitleBase;

        const created = await createOrderInTransaction(tx, {
          actorUserId: args.actorUserId,
          actorRole: "WOWSTORG",
          customerId: project.customerId,
          readyByDate: period.readyByDate,
          startDate: period.startDate,
          endDate: period.endDate,
          eventName,
          comment: draft.comment ?? undefined,
          projectId: project.id,
          source: "WOWSTORG_EXTERNAL",
          targetEstimateVersionId,
          lines: orderLines,
        });

        createdOrders.push({
          id: created.id,
          periodKey: period.key,
          title: eventName,
        });

        for (const lineId of successfulLineIds) {
          materializedLineIds.add(lineId);
        }
      }

      if (createdOrders.length === 0) {
        throw new ProjectDraftOrderError("NOTHING_MATERIALIZED", undefined, {
          unavailableLines,
        });
      }

      if (materializedLineIds.size > 0) {
        await tx.projectDraftOrderLine.deleteMany({
          where: {
            draftOrderId: draft.id,
            id: { in: [...materializedLineIds] },
          },
        });
      }

      for (const period of args.periods) {
        await tx.projectDraftOrderLine.updateMany({
          where: {
            draftOrderId: draft.id,
            id: { in: period.lineIds.filter((lineId) => !materializedLineIds.has(lineId)) },
          },
          data: {
            periodGroup: period.key,
          },
        });
      }

      if (materializedLineIds.size > 0) {
        await tx.projectDraftOrderLine.updateMany({
          where: {
            draftOrderId: draft.id,
            id: { in: [...materializedLineIds] },
          },
          data: {
            lastAvailableQty: null,
            lastAvailabilityNote: null,
          },
        });
      }

      for (const unavailable of unavailableLines) {
        await tx.projectDraftOrderLine.update({
          where: { id: unavailable.lineId },
          data: {
            lastAvailableQty: unavailable.availableQty,
            lastAvailabilityNote: unavailable.note,
          },
        });
      }

      const remainingCount = await tx.projectDraftOrderLine.count({
        where: { draftOrderId: draft.id },
      });

      if (remainingCount === 0) {
        await tx.projectDraftOrder.delete({ where: { id: draft.id } });
      } else {
        await tx.projectDraftOrder.update({
          where: { id: draft.id },
          data: { updatedById: args.actorUserId },
        });
      }

      await appendProjectActivityLog(tx, {
        projectId: project.id,
        actorUserId: args.actorUserId,
        kind: ProjectActivityKind.PROJECT_DRAFT_ORDER_MATERIALIZED,
        payload: {
          createdOrderIds: createdOrders.map((order) => order.id),
          createdCount: createdOrders.length,
          remainingDraftLines: remainingCount,
          unavailableCount: unavailableLines.length,
        },
      });

      return {
        createdOrders,
        remainingDraftLines: remainingCount,
        unavailableLines,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}

export function mapCreateOrderErrorToDraftError(error: CreateOrderError): ProjectDraftOrderError {
  return new ProjectDraftOrderError(error.code, error.message, error.details);
}
