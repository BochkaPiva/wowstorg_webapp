import { z } from "zod";

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
      const loss = await tx.lossRecord.findUnique({
        where: { id },
        select: { id: true, status: true, itemId: true, qty: true, foundQty: true, writtenOffQty: true },
      });
      if (!loss) throw new Error("NOT_FOUND");
      if (loss.status !== "OPEN") throw new Error("NOT_OPEN");
      const remaining = loss.qty - loss.foundQty - loss.writtenOffQty;
      if (qty > remaining) throw new Error("EXCEEDS_REMAINING");

      const item = await tx.item.findUnique({ where: { id: loss.itemId }, select: { missing: true } });
      if (!item || item.missing < qty) throw new Error("ITEM_BUCKET_UNDERFLOW");
      await tx.item.update({ where: { id: loss.itemId }, data: { missing: { decrement: qty } } });

      const nextFound = loss.foundQty + qty;
      const nextRemaining = loss.qty - nextFound - loss.writtenOffQty;
      await tx.lossRecord.update({
        where: { id },
        data: {
          foundQty: nextFound,
          ...(nextRemaining <= 0
            ? { status: "FOUND", resolvedAt: new Date() }
            : {}),
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NOT_FOUND") return jsonError(404, "Не найдено");
    if (msg === "NOT_OPEN") return jsonError(400, "Запись уже закрыта");
    if (msg === "EXCEEDS_REMAINING") return jsonError(400, "Количество больше остатка");
    if (msg === "ITEM_BUCKET_UNDERFLOW") return jsonError(409, "Некорректное состояние остатков (недостаточно в базе)");
    return jsonError(400, "Нельзя выполнить операцию");
  }

  return jsonOk({ ok: true });
}

