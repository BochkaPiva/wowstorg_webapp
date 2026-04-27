import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/server/db";
import { recomputeGreenwichAchievements } from "@/server/achievements/service";
import { deleteEstimateFile } from "@/server/file-storage";
import { calcOrderPricing } from "@/server/orders/order-pricing";
import { recomputeGreenwichRatingScore } from "@/server/ratings/greenwich-rating";

const ORDER_CLEANUP_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
  "CLOSED",
  "CANCELLED",
] as const;

export const ORDER_CLEANUP_SORT_VALUES = [
  "smart",
  "readyBy_asc",
  "readyBy_desc",
  "created_desc",
  "created_asc",
  "startDate_asc",
  "startDate_desc",
] as const;

type DbClient = PrismaClient | Prisma.TransactionClient;
type CleanupSort = (typeof ORDER_CLEANUP_SORT_VALUES)[number];
type CleanupStatus = (typeof ORDER_CLEANUP_STATUSES)[number];

export type OrderCleanupListFilters = {
  q?: string;
  source?: "all" | "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  sort?: CleanupSort;
  statuses?: CleanupStatus[];
};

export type OrderCleanupListRow = {
  id: string;
  parentOrderId: string | null;
  projectId: string | null;
  projectTitle: string | null;
  status: CleanupStatus;
  source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  customerName: string;
  eventName: string | null;
  greenwichUserName: string | null;
  totalAmount: number;
  hasEstimateFile: boolean;
};

export type OrderCleanupPreview = {
  selectedOrderIds: string[];
  missingOrderIds: string[];
  totalOrdersToDelete: number;
  rootOrdersToDelete: number;
  quickSupplementsToDelete: number;
  autoIncludedQuickSupplementCount: number;
  linesCount: number;
  returnSplitsCount: number;
  incidentsCount: number;
  remindersCount: number;
  lossRecordsAffectedCount: number;
  projectEstimateSectionsAffectedCount: number;
  projectEstimateLinesAffectedCount: number;
  orders: OrderCleanupListRow[];
  blockingProjectLinkedOrders: Array<{
    id: string;
    projectId: string;
    projectTitle: string | null;
    customerName: string;
  }>;
};

type PreparedCleanup = {
  selectedOrderIds: string[];
  missingOrderIds: string[];
  expandedOrderIds: string[];
  autoIncludedOrderIds: string[];
  lineIds: string[];
  affectedGreenwichUserIds: string[];
  estimateFileKeys: string[];
  orders: Array<{
    id: string;
    parentOrderId: string | null;
    projectId: string | null;
    projectTitle: string | null;
    status: CleanupStatus;
    source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
    readyByDate: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    customerName: string;
    eventName: string | null;
    greenwichUserName: string | null;
    totalAmount: number;
    hasEstimateFile: boolean;
    greenwichUserId: string | null;
    estimateFileKey: string | null;
    linesCount: number;
    returnSplitsCount: number;
    incidentsCount: number;
  }>;
  counts: {
    remindersCount: number;
    lossRecordsAffectedCount: number;
    projectEstimateSectionsAffectedCount: number;
    projectEstimateLinesAffectedCount: number;
  };
  blockingProjectLinkedOrders: Array<{
    id: string;
    projectId: string;
    projectTitle: string | null;
    customerName: string;
  }>;
};

export class OrderCleanupError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const STATUS_PRIORITY: Record<CleanupStatus, number> = {
  ISSUED: 0,
  RETURN_DECLARED: 1,
  PICKING: 2,
  APPROVED_BY_GREENWICH: 3,
  CHANGES_REQUESTED: 4,
  ESTIMATE_SENT: 5,
  SUBMITTED: 6,
  CLOSED: 7,
  CANCELLED: 8,
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function calcOrderTotalAmount(args: {
  startDate: Date;
  endDate: Date;
  payMultiplier: Prisma.Decimal | number | null;
  deliveryPrice: Prisma.Decimal | number | null;
  montagePrice: Prisma.Decimal | number | null;
  demontagePrice: Prisma.Decimal | number | null;
  rentalDiscountType?: string | null;
  rentalDiscountPercent?: Prisma.Decimal | number | null;
  rentalDiscountAmount?: Prisma.Decimal | number | null;
  lines: Array<{ requestedQty: number; pricePerDaySnapshot: Prisma.Decimal | number | null }>;
}): number {
  return calcOrderPricing({
    ...args,
    discount: args,
  }).grandTotal;
}

function orderByFromSort(sort: CleanupSort): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case "smart":
      return [{ readyByDate: "asc" }, { createdAt: "desc" }];
    case "readyBy_desc":
      return [{ readyByDate: "desc" }, { createdAt: "desc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "startDate_asc":
      return [{ startDate: "asc" }, { readyByDate: "asc" }];
    case "startDate_desc":
      return [{ startDate: "desc" }, { readyByDate: "desc" }];
    case "readyBy_asc":
    default:
      return [{ readyByDate: "asc" }, { createdAt: "desc" }];
  }
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function listOrdersForCleanup(
  db: DbClient,
  filters: OrderCleanupListFilters,
): Promise<OrderCleanupListRow[]> {
  const statuses = filters.statuses?.length ? filters.statuses : [...ORDER_CLEANUP_STATUSES];
  const q = filters.q?.trim();
  const source = filters.source ?? "all";
  const sort = filters.sort ?? "readyBy_asc";

  const searchWhere: Prisma.OrderWhereInput | undefined =
    q && q.length > 0
      ? {
          OR: [
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { greenwichUser: { displayName: { contains: q, mode: "insensitive" } } },
            { eventName: { contains: q, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined;

  const sourceWhere: Prisma.OrderWhereInput | undefined =
    source === "all" ? undefined : { source };

  const orders = await db.order.findMany({
    where: {
      AND: [
        { status: { in: statuses } },
        ...(sourceWhere ? [sourceWhere] : []),
        ...(searchWhere ? [searchWhere] : []),
      ],
    },
    orderBy: orderByFromSort(sort),
    take: 500,
    select: {
      id: true,
      parentOrderId: true,
      projectId: true,
      project: { select: { title: true } },
      status: true,
      source: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      eventName: true,
      estimateFileKey: true,
      payMultiplier: true,
      deliveryPrice: true,
      montagePrice: true,
      demontagePrice: true,
      rentalDiscountType: true,
      rentalDiscountPercent: true,
      rentalDiscountAmount: true,
      customer: { select: { name: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        select: {
          requestedQty: true,
          pricePerDaySnapshot: true,
        },
      },
    },
  });

  const rows = orders.map<OrderCleanupListRow>((order) => ({
    id: order.id,
    parentOrderId: order.parentOrderId,
    projectId: order.projectId,
    projectTitle: order.project?.title ?? null,
    status: order.status,
    source: order.source,
    readyByDate: formatDateOnly(order.readyByDate),
    startDate: formatDateOnly(order.startDate),
    endDate: formatDateOnly(order.endDate),
    createdAt: order.createdAt.toISOString(),
    customerName: order.customer.name,
    eventName: order.eventName ?? null,
    greenwichUserName: order.greenwichUser?.displayName ?? null,
    totalAmount: calcOrderTotalAmount({
      startDate: order.startDate,
      endDate: order.endDate,
      payMultiplier: order.payMultiplier,
      deliveryPrice: order.deliveryPrice,
      montagePrice: order.montagePrice,
      demontagePrice: order.demontagePrice,
      lines: order.lines,
    }),
    hasEstimateFile: Boolean(order.estimateFileKey),
  }));

  if (sort === "smart") {
    rows.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      const readyCmp = a.readyByDate.localeCompare(b.readyByDate);
      if (readyCmp !== 0) return readyCmp;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }

  return rows;
}

async function expandSelectedOrderIds(
  db: DbClient,
  rawOrderIds: string[],
): Promise<{ selectedOrderIds: string[]; missingOrderIds: string[]; expandedOrderIds: string[] }> {
  const selectedOrderIds = uniqueIds(rawOrderIds);
  if (selectedOrderIds.length === 0) {
    return { selectedOrderIds: [], missingOrderIds: [], expandedOrderIds: [] };
  }

  const selectedOrders = await db.order.findMany({
    where: { id: { in: selectedOrderIds } },
    select: { id: true, parentOrderId: true },
  });
  const existingIds = new Set(selectedOrders.map((order) => order.id));
  const expandedIds = new Set(selectedOrders.map((order) => order.id));
  const missingOrderIds = selectedOrderIds.filter((id) => !existingIds.has(id));

  let frontier = selectedOrders.filter((order) => order.parentOrderId == null).map((order) => order.id);
  while (frontier.length > 0) {
    const children = await db.order.findMany({
      where: { parentOrderId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const child of children) {
      if (expandedIds.has(child.id)) continue;
      expandedIds.add(child.id);
      frontier.push(child.id);
    }
  }

  return {
    selectedOrderIds: [...existingIds],
    missingOrderIds,
    expandedOrderIds: [...expandedIds],
  };
}

async function prepareOrderCleanup(
  db: DbClient,
  rawOrderIds: string[],
): Promise<PreparedCleanup> {
  const { selectedOrderIds, missingOrderIds, expandedOrderIds } = await expandSelectedOrderIds(db, rawOrderIds);
  if (expandedOrderIds.length === 0) {
    return {
      selectedOrderIds,
      missingOrderIds,
      expandedOrderIds: [],
      autoIncludedOrderIds: [],
      lineIds: [],
      affectedGreenwichUserIds: [],
      estimateFileKeys: [],
      orders: [],
      counts: {
        remindersCount: 0,
        lossRecordsAffectedCount: 0,
        projectEstimateSectionsAffectedCount: 0,
        projectEstimateLinesAffectedCount: 0,
      },
      blockingProjectLinkedOrders: [],
    };
  }

  const orders = await db.order.findMany({
    where: { id: { in: expandedOrderIds } },
    select: {
      id: true,
      parentOrderId: true,
      projectId: true,
      project: { select: { title: true } },
      status: true,
      source: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      eventName: true,
      greenwichUserId: true,
      greenwichUser: { select: { displayName: true } },
      estimateFileKey: true,
      payMultiplier: true,
      deliveryPrice: true,
      montagePrice: true,
      demontagePrice: true,
      rentalDiscountType: true,
      rentalDiscountPercent: true,
      rentalDiscountAmount: true,
      customer: { select: { name: true } },
      lines: {
        select: {
          requestedQty: true,
          pricePerDaySnapshot: true,
        },
      },
      _count: {
        select: {
          lines: true,
          returnSplits: true,
          incidents: true,
        },
      },
    },
  });

  const lineRows = await db.orderLine.findMany({
    where: { orderId: { in: expandedOrderIds } },
    select: { id: true },
  });
  const lineIds = lineRows.map((line) => line.id);

  const [remindersCount, lossRecordsAffectedCount, projectEstimateSectionsAffectedCount, projectEstimateLinesAffectedCount] =
    await Promise.all([
      db.reminderSent.count({ where: { orderId: { in: expandedOrderIds } } }),
      db.lossRecord.count({
        where: {
          OR: [
            { orderId: { in: expandedOrderIds } },
            ...(lineIds.length > 0 ? [{ orderLineId: { in: lineIds } }] : []),
          ],
        },
      }),
      db.projectEstimateSection.count({
        where: { linkedOrderId: { in: expandedOrderIds } },
      }),
      lineIds.length > 0
        ? db.projectEstimateLine.count({
            where: { orderLineId: { in: lineIds } },
          })
        : Promise.resolve(0),
    ]);

  const autoIncludedOrderIds = expandedOrderIds.filter((id) => !selectedOrderIds.includes(id));
  const preparedOrders = orders.map((order) => ({
    id: order.id,
    parentOrderId: order.parentOrderId,
    projectId: order.projectId,
    projectTitle: order.project?.title ?? null,
    status: order.status,
    source: order.source,
    readyByDate: formatDateOnly(order.readyByDate),
    startDate: formatDateOnly(order.startDate),
    endDate: formatDateOnly(order.endDate),
    createdAt: order.createdAt.toISOString(),
    customerName: order.customer.name,
    eventName: order.eventName ?? null,
    greenwichUserName: order.greenwichUser?.displayName ?? null,
    totalAmount: calcOrderTotalAmount({
      startDate: order.startDate,
      endDate: order.endDate,
      payMultiplier: order.payMultiplier,
      deliveryPrice: order.deliveryPrice,
      montagePrice: order.montagePrice,
      demontagePrice: order.demontagePrice,
      lines: order.lines,
    }),
    hasEstimateFile: Boolean(order.estimateFileKey),
    greenwichUserId: order.greenwichUserId ?? null,
    estimateFileKey: order.estimateFileKey ?? null,
    linesCount: order._count.lines,
    returnSplitsCount: order._count.returnSplits,
    incidentsCount: order._count.incidents,
  }));

  preparedOrders.sort((a, b) => {
    if (a.parentOrderId == null && b.parentOrderId != null) return -1;
    if (a.parentOrderId != null && b.parentOrderId == null) return 1;
    const readyCmp = a.readyByDate.localeCompare(b.readyByDate);
    if (readyCmp !== 0) return readyCmp;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return {
    selectedOrderIds,
    missingOrderIds,
    expandedOrderIds,
    autoIncludedOrderIds,
    lineIds,
    affectedGreenwichUserIds: uniqueIds(
      preparedOrders.map((order) => order.greenwichUserId ?? "").filter(Boolean),
    ),
    estimateFileKeys: uniqueIds(
      preparedOrders.map((order) => order.estimateFileKey ?? "").filter(Boolean),
    ),
    orders: preparedOrders,
    counts: {
      remindersCount,
      lossRecordsAffectedCount,
      projectEstimateSectionsAffectedCount,
      projectEstimateLinesAffectedCount,
    },
    blockingProjectLinkedOrders: preparedOrders
      .filter((order) => order.projectId)
      .map((order) => ({
        id: order.id,
        projectId: order.projectId as string,
        projectTitle: order.projectTitle,
        customerName: order.customerName,
      })),
  };
}

export async function previewOrderCleanupSelection(
  db: DbClient,
  rawOrderIds: string[],
): Promise<OrderCleanupPreview> {
  const prepared = await prepareOrderCleanup(db, rawOrderIds);

  return {
    selectedOrderIds: prepared.selectedOrderIds,
    missingOrderIds: prepared.missingOrderIds,
    totalOrdersToDelete: prepared.orders.length,
    rootOrdersToDelete: prepared.orders.filter((order) => order.parentOrderId == null).length,
    quickSupplementsToDelete: prepared.orders.filter((order) => order.parentOrderId != null).length,
    autoIncludedQuickSupplementCount: prepared.orders.filter(
      (order) => order.parentOrderId != null && prepared.autoIncludedOrderIds.includes(order.id),
    ).length,
    linesCount: prepared.orders.reduce((sum, order) => sum + order.linesCount, 0),
    returnSplitsCount: prepared.orders.reduce((sum, order) => sum + order.returnSplitsCount, 0),
    incidentsCount: prepared.orders.reduce((sum, order) => sum + order.incidentsCount, 0),
    remindersCount: prepared.counts.remindersCount,
    lossRecordsAffectedCount: prepared.counts.lossRecordsAffectedCount,
    projectEstimateSectionsAffectedCount: prepared.counts.projectEstimateSectionsAffectedCount,
    projectEstimateLinesAffectedCount: prepared.counts.projectEstimateLinesAffectedCount,
    orders: prepared.orders.map((order) => ({
      id: order.id,
      parentOrderId: order.parentOrderId,
      projectId: order.projectId,
      projectTitle: order.projectTitle,
      status: order.status,
      source: order.source,
      readyByDate: order.readyByDate,
      startDate: order.startDate,
      endDate: order.endDate,
      createdAt: order.createdAt,
      customerName: order.customerName,
      eventName: order.eventName,
      greenwichUserName: order.greenwichUserName,
      totalAmount: order.totalAmount,
      hasEstimateFile: order.hasEstimateFile,
    })),
    blockingProjectLinkedOrders: prepared.blockingProjectLinkedOrders,
  };
}

export async function deleteOrdersForCleanup(rawOrderIds: string[]) {
  const prepared = await prepareOrderCleanup(prisma, rawOrderIds);
  if (prepared.selectedOrderIds.length === 0) {
    throw new OrderCleanupError(400, "Не выбраны заявки для удаления");
  }
  if (prepared.orders.length === 0) {
    throw new OrderCleanupError(404, "Выбранные заявки не найдены", {
      missingOrderIds: prepared.missingOrderIds,
    });
  }
  if (prepared.blockingProjectLinkedOrders.length > 0) {
    throw new OrderCleanupError(
      400,
      "Нельзя удалить заявки, привязанные к проектам, через эту версию очистки",
      { blockingOrders: prepared.blockingProjectLinkedOrders },
    );
  }

  await prisma.$transaction(async (tx) => {
    if (prepared.expandedOrderIds.length > 0) {
      await tx.reminderSent.deleteMany({
        where: { orderId: { in: prepared.expandedOrderIds } },
      });
      await tx.lossRecord.updateMany({
        where: { orderId: { in: prepared.expandedOrderIds } },
        data: { orderId: null },
      });
      await tx.projectEstimateSection.updateMany({
        where: { linkedOrderId: { in: prepared.expandedOrderIds } },
        data: { linkedOrderId: null },
      });
    }

    if (prepared.lineIds.length > 0) {
      await tx.lossRecord.updateMany({
        where: { orderLineId: { in: prepared.lineIds } },
        data: { orderLineId: null },
      });
      await tx.projectEstimateLine.updateMany({
        where: { orderLineId: { in: prepared.lineIds } },
        data: { orderLineId: null },
      });
    }

    await tx.order.deleteMany({
      where: { id: { in: prepared.expandedOrderIds } },
    });

    for (const userId of prepared.affectedGreenwichUserIds) {
      await recomputeGreenwichRatingScore(tx, userId);
      await recomputeGreenwichAchievements(tx, userId);
    }
  });

  await Promise.all(prepared.estimateFileKeys.map((key) => deleteEstimateFile(key)));

  return {
    deletedOrderCount: prepared.orders.length,
    deletedRootOrdersCount: prepared.orders.filter((order) => order.parentOrderId == null).length,
    deletedQuickSupplementsCount: prepared.orders.filter((order) => order.parentOrderId != null).length,
    affectedGreenwichUsersCount: prepared.affectedGreenwichUserIds.length,
    deletedEstimateFilesCount: prepared.estimateFileKeys.length,
    missingOrderIds: prepared.missingOrderIds,
  };
}
