import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const ConditionSchema = z.enum(["OK", "NEEDS_REPAIR", "BROKEN", "MISSING"]);

const SplitSchema = z.object({
  condition: ConditionSchema,
  qty: z.number().int().min(0),
});

// Новый формат (предпочтительный)
const DeclareBodyV2 = z.object({
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    comment: z.string().trim().max(2000).optional(),
    splits: z.array(SplitSchema).min(1),
  })).min(1),
});

// Старый формат: просто пометить «возврат заявлен» без разбиения
const DeclareBody = DeclareBodyV2.optional();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  let body: unknown = undefined;
  try {
    // тело опционально
    body = await req.json();
  } catch {
    body = undefined;
  }
  const parsed = DeclareBody.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  const order = await prisma.order.findUnique({
    where: { id },
    include: { lines: true },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.status !== "ISSUED") return jsonError(400, "Возврат можно заявить только по выданной заявке");

  const isGreenwich = auth.user.role === "GREENWICH" && order.greenwichUserId === auth.user.id;
  if (!isGreenwich) return jsonError(403, "Только сотрудник Grinvich, на которого оформлена заявка, может отправить возврат на приёмку");

  const maxQtyByLineId = new Map(
    order.lines.map((l) => [
      l.id,
      (l.issuedQty ?? l.approvedQty ?? l.requestedQty) as number,
    ]),
  );

  // Если тело не передали — считаем «всё в норме» по всем позициям
  const linesToDeclare: Array<{ orderLineId: string; comment?: string; splits: Array<{ condition: z.infer<typeof ConditionSchema>; qty: number }> }> =
    parsed.data?.lines ??
    order.lines
      .filter((l) => (l.issuedQty ?? l.approvedQty ?? l.requestedQty) > 0)
      .map((l) => ({
        orderLineId: l.id,
        splits: [{ condition: "OK" as const, qty: (l.issuedQty ?? l.approvedQty ?? l.requestedQty) as number }],
      }));

  // Валидация: для каждой позиции сумма qty должна ровняться выданному (или 0 — пропускаем)
  for (const l of linesToDeclare) {
    const maxQty = maxQtyByLineId.get(l.orderLineId);
    if (maxQty == null) return jsonError(400, "Некорректная позиция приёмки");
    if (maxQty <= 0) continue;
    const sum = l.splits.reduce((s, x) => s + (Number.isFinite(x.qty) ? x.qty : 0), 0);
    if (sum !== maxQty) {
      return jsonError(400, "Сумма количеств по статусам должна совпадать с выданным количеством для каждой позиции");
    }
    const seen = new Set<string>();
    for (const s of l.splits) {
      if (s.qty < 0) return jsonError(400, "Количество не может быть отрицательным");
      if (seen.has(s.condition)) return jsonError(400, "Нельзя повторять один и тот же статус для позиции");
      seen.add(s.condition);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.returnSplit.deleteMany({ where: { orderId: id, phase: "DECLARED" } });

    for (const l of linesToDeclare) {
      for (const s of l.splits) {
        if (s.qty <= 0) continue;
        await tx.returnSplit.create({
          data: {
            orderId: id,
            orderLineId: l.orderLineId,
            phase: "DECLARED",
            condition: s.condition,
            qty: s.qty,
            comment: l.comment?.trim() || null,
          },
        });
      }
    }

    await tx.order.update({
      where: { id },
      data: { status: "RETURN_DECLARED" },
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
    const { notifyReturnDeclared } = await import("@/server/notifications/order-notifications");
    void notifyReturnDeclared(fullOrder as Parameters<typeof notifyReturnDeclared>[0]).catch((e) =>
      console.error("[return-declared] notifyReturnDeclared failed:", e),
    );
  }

  return jsonOk({ ok: true });
}
