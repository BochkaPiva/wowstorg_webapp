import { Prisma, ProjectActivityKind } from "@prisma/client";
import { z } from "zod";

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
import { restoreGreenwichMonthlyBonusForCancelledOrder } from "@/server/ratings/greenwich-bonuses";

const CANCELLABLE = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"] as const;
const WAREHOUSE_HIGH_RISK_STATUSES = ["PICKING", "ISSUED", "RETURN_DECLARED"] as const;
const BodySchema = z.object({
  confirmInventoryRelease: z.boolean().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let body: unknown = {};
  const raw = await req.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return jsonError(400, "Invalid JSON");
    }
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      greenwichUserId: true,
      greenwichMonthlyBonusId: true,
      createdById: true,
      projectId: true,
    },
  });

  if (!order) return jsonError(404, "Not found");

  const isGreenwich = auth.user.role === "GREENWICH" && order.greenwichUserId === auth.user.id;
  const isWarehouse = auth.user.role === "WOWSTORG";
  if (!isGreenwich && !isWarehouse) return jsonError(403, "Нет прав отменить эту заявку");

  if (order.status === "CANCELLED") return jsonError(409, "Заявка уже отменена");
  if (order.status === "CLOSED") return jsonError(400, "Закрытую заявку отменить нельзя");
  if (
    isGreenwich &&
    !CANCELLABLE.includes(order.status as (typeof CANCELLABLE)[number])
  ) {
    return jsonError(400, "После согласования отменить заявку может только Wowstorg");
  }
  if (
    isWarehouse &&
    WAREHOUSE_HIGH_RISK_STATUSES.includes(
      order.status as (typeof WAREHOUSE_HIGH_RISK_STATUSES)[number],
    ) &&
    parsed.data.confirmInventoryRelease !== true
  ) {
    return jsonError(
      409,
      "Подтвердите отмену: заявка уже находится в складском контуре, её резерв будет освобождён",
    );
  }

  let cancelled = false;
  try {
    cancelled = await prisma.$transaction(
      async (tx) => {
        const changed = await tx.order.updateMany({
          where: { id, status: order.status },
          data: { status: "CANCELLED" },
        });
        if (changed.count === 0) return false;
        await restoreGreenwichMonthlyBonusForCancelledOrder(tx, {
          orderId: order.id,
          orderStatus: order.status,
          userId: order.greenwichUserId,
          bonusId: order.greenwichMonthlyBonusId,
        });
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Статус заявки уже изменился. Повторите попытку.");
    }
    console.error("[orders/cancel] transaction error", error);
    return jsonError(500, "Не удалось отменить заявку");
  }
  if (!cancelled) return jsonError(409, "Статус заявки уже изменился. Обновите страницу.");

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
