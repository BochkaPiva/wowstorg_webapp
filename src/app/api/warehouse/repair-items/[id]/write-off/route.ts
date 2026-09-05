import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getLinkedBalances, unlinkedQuantity } from "@/server/inventory-balances";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const BodySchema = z.object({
  qty: z.number().int().min(1).max(1_000_000),
  condition: z.enum(["NEEDS_REPAIR", "BROKEN"]),
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

  const { qty, condition } = parsed.data;
  const bucketField = condition === "NEEDS_REPAIR" ? "inRepair" : "broken";

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({
        where: { id },
        select: { id: true, total: true, inRepair: true, broken: true, isActive: true },
      });
      if (!item) throw new Error("NOT_FOUND");

      const bucketValue = condition === "NEEDS_REPAIR" ? item.inRepair : item.broken;
      const linked = await getLinkedBalances(tx, id);
      if (qty > unlinkedQuantity(bucketValue, linked[bucketField])) throw new Error("EXCEEDS_BUCKET");
      if (qty > item.total) throw new Error("EXCEEDS_TOTAL");

      await tx.item.update({
        where: { id },
        data: {
          [bucketField]: { decrement: qty },
          total: { decrement: qty },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") return jsonError(409, "Остатки изменились. Обновите список и повторите операцию.");
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NOT_FOUND") return jsonError(404, "Позиция не найдена");
    if (msg === "EXCEEDS_BUCKET") return jsonError(409, "Количество превышает остаток вне заявок. Реквизит из заявки обрабатывайте через соответствующий инцидент.");
    if (msg === "EXCEEDS_TOTAL") return jsonError(409, "Некорректное состояние остатков: total меньше списания");
    return jsonError(400, "Нельзя выполнить операцию");
  }

  return jsonOk({ ok: true });
}
