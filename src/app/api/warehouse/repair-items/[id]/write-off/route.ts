import { z } from "zod";

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
      if (!item || !item.isActive) throw new Error("NOT_FOUND");

      const bucketValue = condition === "NEEDS_REPAIR" ? item.inRepair : item.broken;
      if (qty > bucketValue) throw new Error("EXCEEDS_BUCKET");
      if (qty > item.total) throw new Error("EXCEEDS_TOTAL");

      await tx.item.update({
        where: { id },
        data: {
          [bucketField]: { decrement: qty },
          total: { decrement: qty },
        },
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NOT_FOUND") return jsonError(404, "Позиция не найдена");
    if (msg === "EXCEEDS_BUCKET") return jsonError(400, "Количество больше доступного в этом статусе");
    if (msg === "EXCEEDS_TOTAL") return jsonError(409, "Некорректное состояние остатков: total меньше списания");
    return jsonError(400, "Нельзя выполнить операцию");
  }

  return jsonOk({ ok: true });
}
