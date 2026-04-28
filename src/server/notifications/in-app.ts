import type { InAppNotificationType, OrderStatus, Prisma, Role } from "@prisma/client";

import { prisma } from "@/server/db";

function statusLabel(status: OrderStatus): string {
  if (status === "ESTIMATE_SENT") return "Смета отправлена";
  if (status === "APPROVED_BY_GREENWICH") return "Согласована";
  if (status === "PICKING") return "Сборка";
  if (status === "ISSUED") return "Выдана";
  if (status === "RETURN_DECLARED") return "На приёмке";
  if (status === "CLOSED") return "Закрыта";
  if (status === "CANCELLED") return "Отменена";
  if (status === "CHANGES_REQUESTED") return "Запрошены изменения";
  return "Обновлена";
}

export async function notifyOrderStatusChangedInApp(args: {
  userId: string | null | undefined;
  orderId: string;
  status: OrderStatus;
  customerName?: string | null;
}): Promise<void> {
  if (!args.userId) return;
  const label = statusLabel(args.status);
  await createInAppNotification({
    userId: args.userId,
    type: "ORDER_STATUS_CHANGED",
    title: `Статус заявки: ${label}`,
    body: args.customerName ? `Заказчик: ${args.customerName}` : "Открой заявку, чтобы посмотреть детали.",
    payloadJson: {
      kind: "ORDER_STATUS_CHANGED",
      orderId: args.orderId,
      status: args.status,
      href: `/orders/${args.orderId}?from=notification`,
    },
  });
}

export async function createInAppNotification(args: {
  userId: string | null | undefined;
  type: InAppNotificationType;
  title: string;
  body: string;
  payloadJson?: Prisma.InputJsonValue;
}): Promise<void> {
  if (!args.userId) return;
  try {
    await prisma.inAppNotification.create({
      data: {
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        ...(args.payloadJson !== undefined ? { payloadJson: args.payloadJson } : {}),
      },
    });
  } catch (error) {
    console.error("[in-app] create notification failed", error);
  }
}

export async function notifyOrderDiscountInApp(args: {
  userId: string | null | undefined;
  orderId: string;
  title: string;
  body?: string | null;
}): Promise<void> {
  await createInAppNotification({
    userId: args.userId,
    type: "ORDER_DISCOUNT",
    title: args.title,
    body: args.body?.trim() || "Открой заявку, чтобы посмотреть детали.",
    payloadJson: {
      kind: "ORDER_DISCOUNT",
      orderId: args.orderId,
      href: `/orders/${args.orderId}?from=notification`,
    },
  });
}

export async function createInAppNotificationForRole(args: {
  role: Role;
  type: InAppNotificationType;
  title: string;
  body: string;
  payloadJson?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { role: args.role, isActive: true },
      select: { id: true },
    });
    if (users.length === 0) return;
    await prisma.inAppNotification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        type: args.type,
        title: args.title,
        body: args.body,
        ...(args.payloadJson !== undefined ? { payloadJson: args.payloadJson } : {}),
      })),
    });
  } catch (error) {
    console.error("[in-app] create role notifications failed", error);
  }
}

export async function notifyWarehouseOrderInApp(args: {
  orderId: string;
  title: string;
  body: string;
  type?: InAppNotificationType;
}): Promise<void> {
  await createInAppNotificationForRole({
    role: "WOWSTORG",
    type: args.type ?? "ORDER_UPDATED",
    title: args.title,
    body: args.body,
    payloadJson: {
      kind: args.type ?? "ORDER_UPDATED",
      orderId: args.orderId,
      href: `/orders/${args.orderId}?from=notification`,
    },
  });
}

