import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getLinkedBalances } from "@/server/inventory-balances";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const BodySchema = z.object({
  qty: z.number().int().min(1).max(1_000_000),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
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

  const qty = parsed.data.qty;

  try {
    await prisma.$transaction(async (tx) => {
      const inc = await tx.incident.findUnique({
        where: { id },
        include: { orderLine: { select: { itemId: true } } },
      });
      if (!inc) throw new Error("NOT_FOUND");
      if (inc.status !== "OPEN") throw new Error("NOT_OPEN");
      if (inc.condition !== "NEEDS_REPAIR" && inc.condition !== "BROKEN") throw new Error("BAD_CONDITION");
      const remaining = inc.qty - inc.repairedQty - inc.utilizedQty;
      if (qty > remaining) throw new Error("EXCEEDS_REMAINING");
      const itemId = inc.orderLine.itemId;
      const linked = await getLinkedBalances(tx, itemId);

      // Утилизация: уменьшаем “ведро” + общий total
      const item = await tx.item.findUnique({
        where: { id: itemId },
        select: { total: true, inRepair: true, broken: true },
      });
      if (!item) throw new Error("ITEM_NOT_FOUND");
      if (item.total < qty) throw new Error("TOTAL_UNDERFLOW");
      if (inc.condition === "NEEDS_REPAIR") {
        if (item.inRepair < Math.max(qty, linked.inRepair)) throw new Error("ITEM_BUCKET_UNDERFLOW");
        await tx.item.update({
          where: { id: itemId },
          data: { inRepair: { decrement: qty }, total: { decrement: qty } },
        });
      } else {
        if (item.broken < Math.max(qty, linked.broken)) throw new Error("ITEM_BUCKET_UNDERFLOW");
        await tx.item.update({
          where: { id: itemId },
          data: { broken: { decrement: qty }, total: { decrement: qty } },
        });
      }

      const nextUtil = inc.utilizedQty + qty;
      const nextRemaining = inc.qty - inc.repairedQty - nextUtil;
      await tx.incident.update({
        where: { id },
        data: {
          utilizedQty: nextUtil,
          ...(nextRemaining <= 0
            ? { status: "CLOSED", resolvedAt: new Date() }
            : {}),
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return jsonError(409, "Остатки изменились. Обновите список и повторите операцию.");
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NOT_FOUND") return jsonError(404, "Не найдено");
    if (msg === "NOT_OPEN") return jsonError(400, "Запись уже закрыта");
    if (msg === "EXCEEDS_REMAINING") return jsonError(400, "Количество больше остатка");
    if (msg === "ITEM_BUCKET_UNDERFLOW") return jsonError(409, "Некорректное состояние остатков (недостаточно в базе)");
    if (msg === "TOTAL_UNDERFLOW") return jsonError(409, "Некорректное состояние остатков (total меньше списания)");
    return jsonError(400, "Нельзя выполнить операцию");
  }

  return jsonOk({ ok: true });
}

