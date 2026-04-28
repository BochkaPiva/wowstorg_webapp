import { ProjectActivityKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import {
  makeQueuedOrderCancelledResult,
  type OrderCancelledNotifyResult,
} from "@/server/notifications/order-notifications";
import { notifyOrderStatusChangedInApp } from "@/server/notifications/in-app";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { recomputeGreenwichAchievements } from "@/server/achievements/service";

const CANCELLABLE = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"] as const;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, greenwichUserId: true, createdById: true, projectId: true },
  });

  if (!order) return jsonError(404, "Not found");
  if (!CANCELLABLE.includes(order.status as (typeof CANCELLABLE)[number])) {
    return jsonError(400, "Отменить можно только заявку в статусе «Новая», «Смета отправлена» или «Запрошены изменения»");
  }

  const isGreenwich = auth.user.role === "GREENWICH" && order.greenwichUserId === auth.user.id;
  const isWarehouse = auth.user.role === "WOWSTORG";
  if (!isGreenwich && !isWarehouse) return jsonError(403, "Нет прав отменить эту заявку");

  await prisma.order.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  if (order.projectId) {
    try {
      await appendProjectActivityLog(prisma, {
        projectId: order.projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.ORDER_CANCELLED,
        payload: { orderId: order.id },
      });
    } catch (logErr) {
      console.error("[orders/cancel] appendProjectActivityLog failed", logErr);
    }
  }

  const fullOrder = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
  let notification: OrderCancelledNotifyResult | undefined;
  if (fullOrder) {
    type NotifyCancelled = typeof import("@/server/notifications/order-notifications").notifyOrderCancelled;
    const payload = fullOrder as Parameters<NotifyCancelled>[0];
    notification = makeQueuedOrderCancelledResult();
    scheduleAfterResponse("notifyOrderCancelled", async () => {
      const { notifyOrderCancelled } = await import("@/server/notifications/order-notifications");
      const { notifyWarehouseOrderInApp } = await import("@/server/notifications/in-app");
      await notifyOrderCancelled(payload);
      await notifyWarehouseOrderInApp({
        orderId: fullOrder.id,
        title: "Заявка отменена",
        body: `Заказчик: ${fullOrder.customer?.name ?? "—"}`,
      });
      if (isWarehouse) {
        await notifyOrderStatusChangedInApp({
          userId: fullOrder.greenwichUserId,
          orderId: fullOrder.id,
          status: "CANCELLED",
          customerName: fullOrder.customer?.name,
        });
      }
    });
  }

  if (order.greenwichUserId) {
    const userId = order.greenwichUserId;
    scheduleAfterResponse("recomputeGreenwichAchievementsOnCancel", async () => {
      await prisma.$transaction(async (tx) => {
        await recomputeGreenwichAchievements(tx, userId);
      });
    });
  }

  return jsonOk({ ok: true, notification });
}
