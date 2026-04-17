import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { notifyOrderStatusChangedInApp } from "@/server/notifications/in-app";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { listMissingEnabledServicePrices } from "@/server/orders/service-pricing";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      deliveryEnabled: true,
      deliveryPrice: true,
      montageEnabled: true,
      montagePrice: true,
      demontageEnabled: true,
      demontagePrice: true,
    },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.status !== "APPROVED_BY_GREENWICH") {
    return jsonError(
      400,
      "Начать сборку можно только после согласования (статус «Согласована»)",
    );
  }

  const missing = listMissingEnabledServicePrices(order);
  if (missing.length > 0) {
    return jsonError(400, `Укажите цену для включённых доп. услуг: ${missing.join(", ")}`);
  }

  await prisma.order.update({
    where: { id },
    data: { status: "PICKING" },
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
  if (fullOrder) {
    type Fn = typeof import("@/server/notifications/order-notifications").notifyStartPicking;
    const payload = fullOrder as Parameters<Fn>[0];
    scheduleAfterResponse("notifyStartPicking", async () => {
      const { notifyStartPicking } = await import("@/server/notifications/order-notifications");
      await notifyStartPicking(payload);
      await notifyOrderStatusChangedInApp({
        userId: fullOrder.greenwichUserId,
        orderId: fullOrder.id,
        status: "PICKING",
        customerName: fullOrder.customer?.name,
      });
    });
  }

  return jsonOk({ ok: true });
}
