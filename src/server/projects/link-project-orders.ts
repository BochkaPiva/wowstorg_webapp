import { Prisma, ProjectActivityKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { seedProjectEstimateFromOrder } from "@/server/projects/seed-estimate-from-order";

const INACTIVE_ORDER_STATUSES = ["CLOSED", "CANCELLED"] as const;

export type LinkableProjectOrder = {
  id: string;
  status: string;
  source: string;
  eventName: string | null;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  linesCount: number;
};

export class LinkProjectOrdersError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.details = details;
  }
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function listLinkableProjectOrders(projectId: string): Promise<LinkableProjectOrder[] | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, archivedAt: null },
    select: { customerId: true },
  });
  if (!project) return null;

  const orders = await prisma.order.findMany({
    where: {
      customerId: project.customerId,
      projectId: null,
      parentOrderId: null,
      status: { notIn: [...INACTIVE_ORDER_STATUSES] },
      lines: { some: {} },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      source: true,
      eventName: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      _count: { select: { lines: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    source: order.source,
    eventName: order.eventName,
    readyByDate: toDateOnly(order.readyByDate),
    startDate: toDateOnly(order.startDate),
    endDate: toDateOnly(order.endDate),
    createdAt: order.createdAt.toISOString(),
    linesCount: order._count.lines,
  }));
}

export async function linkOrdersToProject(args: {
  projectId: string;
  actorUserId: string;
  orderIds: string[];
  targetEstimateVersionId?: string | null;
}) {
  const uniqueOrderIds = [...new Set(args.orderIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueOrderIds.length === 0) {
    throw new LinkProjectOrdersError("ORDER_IDS_REQUIRED", "Выберите хотя бы одну заявку");
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: args.projectId, archivedAt: null },
      select: { id: true, customerId: true, title: true },
    });
    if (!project) throw new LinkProjectOrdersError("PROJECT_NOT_FOUND", "Проект не найден");

    const orders = await tx.order.findMany({
      where: { id: { in: uniqueOrderIds } },
      select: {
        id: true,
        customerId: true,
        projectId: true,
        parentOrderId: true,
        status: true,
      },
    });
    if (orders.length !== uniqueOrderIds.length) {
      throw new LinkProjectOrdersError("ORDER_NOT_FOUND", "Одна или несколько заявок не найдены", {
        missingOrderIds: uniqueOrderIds.filter((id) => !orders.some((order) => order.id === id)),
      });
    }

    for (const order of orders) {
      if (order.customerId !== project.customerId) {
        throw new LinkProjectOrdersError(
          "ORDER_CUSTOMER_MISMATCH",
          "Заявку можно привязать только к проекту того же заказчика",
          { orderId: order.id },
        );
      }
      if (order.parentOrderId) {
        throw new LinkProjectOrdersError(
          "ORDER_IS_SUPPLEMENT",
          "Дополнительные выдачи к заявке привязываются через основную заявку",
          { orderId: order.id },
        );
      }
      if (INACTIVE_ORDER_STATUSES.includes(order.status as (typeof INACTIVE_ORDER_STATUSES)[number])) {
        throw new LinkProjectOrdersError(
          "ORDER_INACTIVE",
          "Нельзя привязать закрытую или отменённую заявку",
          { orderId: order.id, status: order.status },
        );
      }
      if (order.projectId && order.projectId !== project.id) {
        throw new LinkProjectOrdersError(
          "ORDER_ALREADY_LINKED",
          "Заявка уже привязана к другому проекту",
          { orderId: order.id, projectId: order.projectId },
        );
      }
      if (order.projectId === project.id) {
        throw new LinkProjectOrdersError(
          "ORDER_ALREADY_IN_PROJECT",
          "Заявка уже привязана к этому проекту",
          { orderId: order.id },
        );
      }
    }

    const targetEstimateVersionId = args.targetEstimateVersionId?.trim() || null;
    let estimateVersion =
      targetEstimateVersionId != null
        ? await tx.projectEstimateVersion.findFirst({
            where: { id: targetEstimateVersionId, projectId: project.id },
            select: { id: true, versionNumber: true },
          })
        : await tx.projectEstimateVersion.findFirst({
            where: { projectId: project.id },
            orderBy: [{ isPrimary: "desc" }, { versionNumber: "desc" }],
            select: { id: true, versionNumber: true },
          });

    const linkedOrderIds: string[] = [];
    let estimateSectionsAdded = 0;

    for (const orderId of uniqueOrderIds) {
      await tx.order.update({
        where: { id: orderId },
        data: { projectId: project.id },
      });
      linkedOrderIds.push(orderId);

      if (!estimateVersion) {
        estimateVersion = await tx.projectEstimateVersion.create({
          data: {
            projectId: project.id,
            versionNumber: 1,
            createdById: args.actorUserId,
            isPrimary: true,
          },
          select: { id: true, versionNumber: true },
        });
      }

      const existingSection = await tx.projectEstimateSection.findFirst({
        where: { versionId: estimateVersion.id, linkedOrderId: orderId },
        select: { id: true },
      });
      if (!existingSection) {
        const maxSo = await tx.projectEstimateSection.aggregate({
          where: { versionId: estimateVersion.id },
          _max: { sortOrder: true },
        });
        await seedProjectEstimateFromOrder(tx, {
          projectId: project.id,
          orderId,
          actorUserId: args.actorUserId,
          targetVersionId: estimateVersion.id,
          sortOrder: (maxSo._max.sortOrder ?? -1) + 1,
        });
        estimateSectionsAdded += 1;
      }

      await appendProjectActivityLog(tx, {
        projectId: project.id,
        actorUserId: args.actorUserId,
        kind: ProjectActivityKind.ORDER_LINKED,
        payload: { orderId, linkedExisting: true },
      });
    }

    return {
      linkedOrderIds,
      estimateSectionsAdded,
      estimateVersionNumber: estimateVersion?.versionNumber ?? null,
    };
  });
}
