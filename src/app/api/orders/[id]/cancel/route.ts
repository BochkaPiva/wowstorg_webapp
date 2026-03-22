import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  makeQueuedOrderCancelledResult,
  type OrderCancelledNotifyResult,
} from "@/server/notifications/order-notifications";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";

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
    select: { id: true, status: true, greenwichUserId: true, createdById: true },
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
      await notifyOrderCancelled(payload);
    });
  }

  return jsonOk({ ok: true, notification });
}
