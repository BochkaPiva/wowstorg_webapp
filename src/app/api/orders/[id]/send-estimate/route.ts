import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { notifyEstimateSent } from "@/server/notifications/order-notifications";

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
      lines: { select: { id: true, itemId: true, requestedQty: true, pricePerDaySnapshot: true } },
    },
  });

  if (!order) return jsonError(404, "Not found");
  const allowedStatuses = ["SUBMITTED", "CHANGES_REQUESTED"] as const;
  if (!allowedStatuses.includes(order.status as (typeof allowedStatuses)[number])) {
    return jsonError(400, "Смету можно отправить только для заявки в статусе «Новая» или «Запрошены изменения»");
  }

  const missing: string[] = [];
  if (order.deliveryEnabled && (order.deliveryPrice == null || Number(order.deliveryPrice) <= 0))
    missing.push("Доставка");
  if (order.montageEnabled && (order.montagePrice == null || Number(order.montagePrice) <= 0))
    missing.push("Монтаж");
  if (order.demontageEnabled && (order.demontagePrice == null || Number(order.demontagePrice) <= 0))
    missing.push("Демонтаж");
  if (missing.length > 0) {
    return jsonError(
      400,
      `Укажите цену для включённых доп. услуг: ${missing.join(", ")}`,
    );
  }

  const snapshot = order.lines.map((l) => ({
    orderLineId: l.id,
    itemId: l.itemId,
    requestedQty: l.requestedQty,
    pricePerDaySnapshot: l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : null,
  }));

  await prisma.order.update({
    where: { id },
    data: {
      status: "ESTIMATE_SENT",
      estimateSentAt: new Date(),
      estimateSentSnapshot: snapshot as unknown as object,
    },
  });

  const fullOrder = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
  if (fullOrder) {
    void notifyEstimateSent(fullOrder as Parameters<typeof notifyEstimateSent>[0]).catch((e) =>
      console.error("[send-estimate] notifyEstimateSent failed:", e),
    );
  }

  return jsonOk({ ok: true });
}
