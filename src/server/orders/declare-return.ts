import type { Condition, Role } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  addGreenwichRatingEvent,
  computeGreenwichOverdueDelta,
  ensureGreenwichRatingPolicy,
} from "@/server/ratings/greenwich-rating";

export type ReturnDeclarationLine = {
  orderLineId: string;
  comment?: string;
  splits: Array<{ condition: Condition; qty: number }>;
};

export type DeclareReturnResult =
  | { ok: true; order: NonNullable<Awaited<ReturnType<typeof loadOrderForNotification>>> }
  | {
      ok: false;
      code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATUS" | "INVALID_INPUT" | "CONFLICT";
      message: string;
    };

async function loadOrderForNotification(orderId: string) {
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

/**
 * Единая операция отправки возврата на приёмку для сайта и Telegram.
 * Без lines все выданные позиции считаются возвращёнными в норме.
 */
export async function declareOrderReturn(args: {
  orderId: string;
  actor: { userId: string; role: Role };
  lines?: ReturnDeclarationLine[];
}): Promise<DeclareReturnResult> {
  const order = await prisma.order.findUnique({
    where: { id: args.orderId },
    include: { lines: true },
  });
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Заявка не найдена" };

  const isGreenwich = args.actor.role === "GREENWICH" && order.greenwichUserId === args.actor.userId;
  const isWarehouseExternal = args.actor.role === "WOWSTORG" && order.greenwichUserId == null;
  if (!isGreenwich && !isWarehouseExternal) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Отправить возврат на приёмку может только ответственный сотрудник Grinvich или склад для внешней заявки",
    };
  }
  if (order.status !== "ISSUED") {
    return { ok: false, code: "INVALID_STATUS", message: "Возврат уже отправлен или заявка ещё не выдана" };
  }

  const maxQtyByLineId = new Map(
    order.lines.map((line) => [line.id, line.issuedQty ?? line.approvedQty ?? line.requestedQty]),
  );
  const linesToDeclare: ReturnDeclarationLine[] = args.lines ?? order.lines
    .filter((line) => (line.issuedQty ?? line.approvedQty ?? line.requestedQty) > 0)
    .map((line) => ({
      orderLineId: line.id,
      splits: [{ condition: "OK", qty: line.issuedQty ?? line.approvedQty ?? line.requestedQty }],
    }));

  if (linesToDeclare.length === 0) {
    return { ok: false, code: "INVALID_INPUT", message: "В заявке нет выданных позиций для возврата" };
  }

  for (const line of linesToDeclare) {
    const maxQty = maxQtyByLineId.get(line.orderLineId);
    if (maxQty == null) {
      return { ok: false, code: "INVALID_INPUT", message: "Некорректная позиция приёмки" };
    }
    const total = line.splits.reduce((sum, split) => sum + split.qty, 0);
    if (total !== maxQty) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "Сумма количеств по статусам должна совпадать с выданным количеством для каждой позиции",
      };
    }
    const conditions = new Set<Condition>();
    for (const split of line.splits) {
      if (!Number.isInteger(split.qty) || split.qty < 0) {
        return { ok: false, code: "INVALID_INPUT", message: "Количество должно быть целым и неотрицательным" };
      }
      if (conditions.has(split.condition)) {
        return { ok: false, code: "INVALID_INPUT", message: "Нельзя повторять один и тот же статус для позиции" };
      }
      conditions.add(split.condition);
    }
  }

  const declaredAt = new Date();
  const rows = linesToDeclare.flatMap((line) => line.splits
    .filter((split) => split.qty > 0)
    .map((split) => ({
      orderId: order.id,
      orderLineId: line.orderLineId,
      phase: "DECLARED" as const,
      condition: split.condition,
      qty: split.qty,
      comment: line.comment?.trim() || null,
    })));

  const changed = await prisma.$transaction(async (tx) => {
    const policy = order.greenwichUserId ? await ensureGreenwichRatingPolicy(tx) : null;
    const overdueDelta = policy ? computeGreenwichOverdueDelta(order.endDate, declaredAt, policy) : 0;
    const statusUpdate = await tx.order.updateMany({
      where: { id: order.id, status: "ISSUED" },
      data: {
        status: "RETURN_DECLARED",
        ...(order.greenwichUserId ? { greenwichRatingOverdueDelta: overdueDelta } : {}),
      },
    });
    if (statusUpdate.count === 0) return false;

    await tx.returnSplit.deleteMany({ where: { orderId: order.id, phase: "DECLARED" } });
    if (rows.length > 0) await tx.returnSplit.createMany({ data: rows });

    if (order.greenwichUserId && overdueDelta < 0) {
      await addGreenwichRatingEvent(tx, {
        userId: order.greenwichUserId,
        type: "RETURN_OVERDUE",
        delta: overdueDelta,
        reason: "Возврат отправлен на приёмку позже установленного срока",
        sourceKey: `order:${order.id}:return-overdue`,
        orderId: order.id,
        recoverable: true,
        now: declaredAt,
      });
    }
    return true;
  }, { maxWait: 5_000, timeout: 15_000 });

  if (!changed) {
    return { ok: false, code: "CONFLICT", message: "Возврат уже отправлен на приёмку" };
  }
  const fullOrder = await loadOrderForNotification(order.id);
  if (!fullOrder) return { ok: false, code: "NOT_FOUND", message: "Заявка не найдена" };
  return { ok: true, order: fullOrder };
}
