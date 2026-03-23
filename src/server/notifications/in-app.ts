import type { OrderStatus } from "@prisma/client";

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
  await prisma.inAppNotification.create({
    data: {
      userId: args.userId,
      type: "ACHIEVEMENT_UNLOCK",
      title: `Статус заявки обновлён: ${label}`,
      body: args.customerName ? `Заказчик: ${args.customerName}` : "Открой заявку, чтобы посмотреть детали.",
      payloadJson: {
        kind: "ORDER_STATUS_CHANGED",
        orderId: args.orderId,
        status: args.status,
      },
    },
  });
}

