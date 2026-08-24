import { prisma } from "@/server/db";

type ApprovalLine = {
  orderLineId: string;
  approvedQty: number;
};

type ApprovalFailure = {
  ok: false;
  code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATUS" | "UNKNOWN_LINE" | "CONFLICT";
  message: string;
};

export async function approveGreenwichEstimate(args: {
  orderId: string;
  greenwichUserId: string;
  lines?: ApprovalLine[];
}): Promise<ApprovalFailure | { ok: true; order: NonNullable<Awaited<ReturnType<typeof loadOrderForNotification>>> }> {
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    include: { lines: { select: { id: true, requestedQty: true } } },
  });

  if (!order) return { ok: false, code: "NOT_FOUND", message: "Заявка не найдена" };
  if (order.greenwichUserId !== args.greenwichUserId) {
    return { ok: false, code: "FORBIDDEN", message: "Согласовать может только сотрудник Grinvich, на которого оформлена заявка" };
  }
  if (order.status !== "ESTIMATE_SENT" && order.status !== "CHANGES_REQUESTED") {
    return { ok: false, code: "INVALID_STATUS", message: "Смета уже обработана или больше не ожидает согласования" };
  }

  const lineUpdates = args.lines ?? order.lines.map((line) => ({ orderLineId: line.id, approvedQty: line.requestedQty }));
  const lineById = new Map(order.lines.map((line) => [line.id, line]));
  for (const line of lineUpdates) {
    if (!lineById.has(line.orderLineId)) {
      return { ok: false, code: "UNKNOWN_LINE", message: "В смете обнаружена неизвестная строка" };
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: {
        id: args.orderId,
        greenwichUserId: args.greenwichUserId,
        status: { in: ["ESTIMATE_SENT", "CHANGES_REQUESTED"] },
      },
      data: {
        status: "APPROVED_BY_GREENWICH",
        greenwichConfirmedAt: new Date(),
        greenwichConfirmedSnapshot: order.lines.map((line) => ({
          id: line.id,
          requestedQty: line.requestedQty,
        })),
      },
    });
    if (claimed.count === 0) return false;

    for (const { orderLineId, approvedQty } of lineUpdates) {
      const line = lineById.get(orderLineId)!;
      await tx.orderLine.update({
        where: { id: orderLineId },
        data: { approvedQty: Math.min(approvedQty, line.requestedQty) },
      });
    }
    return true;
  });

  if (!updated) return { ok: false, code: "CONFLICT", message: "Статус заявки уже изменился. Обновите данные." };
  const fullOrder = await loadOrderForNotification(args.orderId);
  if (!fullOrder) return { ok: false, code: "NOT_FOUND", message: "Заявка не найдена после обновления" };
  return { ok: true, order: fullOrder };
}

function loadOrderForNotification(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
}

