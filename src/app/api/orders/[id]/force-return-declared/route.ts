import { Prisma, ProjectActivityKind } from "@prisma/client";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { notifyOrderStatusChangedInApp } from "@/server/notifications/in-app";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { appendProjectActivityLog } from "@/server/projects/activity-log";

const TERMINAL_STATUSES = ["RETURN_DECLARED", "CLOSED", "CANCELLED"] as const;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  let projectId: string | null = null;

  try {
    await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          include: { lines: { orderBy: [{ position: "asc" }] } },
        });
        if (!order) throw new Error("NOT_FOUND");
        if (TERMINAL_STATUSES.includes(order.status as (typeof TERMINAL_STATUSES)[number])) {
          throw new Error(order.status === "RETURN_DECLARED" ? "ALREADY_DECLARED" : "BAD_STATUS");
        }

        const issuedQtyByLine = order.lines.map((line) => ({
          lineId: line.id,
          qty: line.issuedQty ?? line.approvedQty ?? line.requestedQty,
        }));
        if (!issuedQtyByLine.some((line) => line.qty > 0)) {
          throw new Error("NO_LINES");
        }

        const changed = await tx.order.updateMany({
          where: { id, status: order.status },
          data: { status: "RETURN_DECLARED" },
        });
        if (changed.count === 0) throw new Error("CONFLICT");

        for (const line of issuedQtyByLine) {
          await tx.orderLine.updateMany({
            where: { id: line.lineId, orderId: id },
            data: { issuedQty: line.qty },
          });
        }

        await tx.returnSplit.deleteMany({ where: { orderId: id, phase: "DECLARED" } });
        await tx.returnSplit.createMany({
          data: issuedQtyByLine
            .filter((line) => line.qty > 0)
            .map((line) => ({
              orderId: id,
              orderLineId: line.lineId,
              phase: "DECLARED" as const,
              condition: "OK" as const,
              qty: line.qty,
              comment: "Технически переведено на приёмку сотрудником Wowstorg",
            })),
        });
        projectId = order.projectId;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError(409, "Статус заявки уже изменился. Повторите попытку.");
    }
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") return jsonError(404, "Not found");
      if (error.message === "ALREADY_DECLARED") return jsonError(409, "Заявка уже находится на приёмке");
      if (error.message === "BAD_STATUS") return jsonError(400, "Закрытую или отменённую заявку нельзя отправить на приёмку");
      if (error.message === "NO_LINES") return jsonError(400, "В заявке нет позиций для приёмки");
      if (error.message === "CONFLICT") return jsonError(409, "Статус заявки уже изменился. Обновите страницу.");
    }
    console.error("[orders/force-return-declared] transaction error", error);
    return jsonError(500, "Не удалось перевести заявку на приёмку");
  }

  if (projectId) {
    try {
      await appendProjectActivityLog(prisma, {
        projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.PROJECT_UPDATED,
        payload: { orderId: id, action: "FORCE_RETURN_DECLARED" },
      });
    } catch (error) {
      console.error("[orders/force-return-declared] appendProjectActivityLog failed", error);
    }
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
    scheduleAfterResponse("notifyForcedReturnDeclared", async () => {
      const { notifyForcedReturnDeclared } = await import("@/server/notifications/order-notifications");
      await notifyForcedReturnDeclared(orderForNotify);
      await notifyOrderStatusChangedInApp({
        userId: orderForNotify.greenwichUserId,
        orderId: orderForNotify.id,
        status: "RETURN_DECLARED",
        customerName: orderForNotify.customer.name,
      });
    });
  }

  return jsonOk({ ok: true });
}
