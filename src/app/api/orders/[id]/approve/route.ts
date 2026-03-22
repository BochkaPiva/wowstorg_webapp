import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";

const BodySchema = z.object({
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    approvedQty: z.number().int().min(0),
  })).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const order = await prisma.order.findUnique({
    where: { id },
    include: { lines: { select: { id: true, requestedQty: true } } },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.greenwichUserId !== auth.user.id) {
    return jsonError(403, "Согласовать может только сотрудник Grinvich, на которого оформлена заявка");
  }
  if (order.status !== "ESTIMATE_SENT" && order.status !== "CHANGES_REQUESTED") {
    return jsonError(400, "Согласовать смету можно только после отправки сметы складом или после запроса правок");
  }

  const lineUpdates = parsed.data.lines ?? order.lines.map((l) => ({ orderLineId: l.id, approvedQty: l.requestedQty }));
  const lineById = new Map(order.lines.map((l) => [l.id, l]));

  for (const { orderLineId } of lineUpdates) {
    if (!lineById.has(orderLineId)) {
      return jsonError(400, "Неизвестная строка заявки", { orderLineId });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const { orderLineId, approvedQty } of lineUpdates) {
      const line = lineById.get(orderLineId)!;
      const qty = Math.min(approvedQty, line.requestedQty);
      await tx.orderLine.update({
        where: { id: orderLineId },
        data: { approvedQty: qty },
      });
    }
    await tx.order.update({
      where: { id },
      data: {
        status: "APPROVED_BY_GREENWICH",
        greenwichConfirmedAt: new Date(),
        greenwichConfirmedSnapshot: order.lines.map((l) => ({
          id: l.id,
          requestedQty: l.requestedQty,
        })) as unknown as object,
      },
    });
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
    type Fn = typeof import("@/server/notifications/order-notifications").notifyEstimateApproved;
    const payload = fullOrder as Parameters<Fn>[0];
    scheduleAfterResponse("notifyEstimateApproved", async () => {
      const { notifyEstimateApproved } = await import("@/server/notifications/order-notifications");
      await notifyEstimateApproved(payload);
    });
  }

  return jsonOk({ ok: true });
}
