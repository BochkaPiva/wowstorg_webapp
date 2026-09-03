import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { notifyOrderDiscountInApp } from "@/server/notifications/in-app";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";

const BodySchema = z.object({
  comment: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
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

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          select: {
            status: true,
            greenwichRequestedDiscountType: true,
          },
        });
        if (!order) throw new Error("NOT_FOUND");
        if (order.status === "CLOSED" || order.status === "CANCELLED") {
          throw new Error("BAD_STATUS");
        }
        if (order.greenwichRequestedDiscountType === "NONE") {
          throw new Error("NO_REQUEST");
        }

        const changed = await tx.order.updateMany({
          where: {
            id,
            greenwichRequestedDiscountType: { not: "NONE" },
          },
          data: {
            greenwichRequestedDiscountType: "NONE",
            greenwichRequestedDiscountPercent: null,
            greenwichRequestedDiscountAmount: null,
            greenwichDiscountRequestComment: null,
          },
        });
        if (changed.count === 0) throw new Error("CONFLICT");
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    );
    if (!result) return jsonError(409, "Запрос скидки уже изменился. Обновите страницу.");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Запрос скидки уже изменился. Повторите попытку.");
    }
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return jsonError(404, "Not found");
      if (error.message === "BAD_STATUS") return jsonError(400, "Завершённую или отменённую заявку менять нельзя");
      if (error.message === "NO_REQUEST") return jsonError(409, "Активного запроса скидки уже нет");
      if (error.message === "CONFLICT") return jsonError(409, "Запрос скидки уже изменился. Обновите страницу.");
    }
    console.error("[orders/discount-request/reject] transaction error", error);
    return jsonError(500, "Не удалось отклонить запрос скидки");
  }

  const orderForNotify = await prisma.order.findUnique({
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
  if (orderForNotify) {
    const comment = parsed.data.comment?.trim() || null;
    scheduleAfterResponse("notifyDiscountRequestRejected", async () => {
      const { notifyDiscountRequestRejected } = await import("@/server/notifications/order-notifications");
      await notifyDiscountRequestRejected(orderForNotify, comment);
      await notifyOrderDiscountInApp({
        userId: orderForNotify.greenwichUserId,
        orderId: orderForNotify.id,
        title: "Запрос скидки отклонён",
        body: comment || `Заказчик: ${orderForNotify.customer.name}`,
      });
    });
  }

  return jsonOk({ ok: true });
}
