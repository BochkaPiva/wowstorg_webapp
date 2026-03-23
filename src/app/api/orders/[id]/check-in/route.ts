import { z } from "zod";
import type { Condition, ItemType } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { notifyOrderStatusChangedInApp } from "@/server/notifications/in-app";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import {
  computeGreenwichIncidentsDelta,
  recomputeGreenwichRatingScore,
} from "@/server/ratings/greenwich-rating";
import { recomputeGreenwichAchievements } from "@/server/achievements/service";

const ConditionSchema = z.enum(["OK", "NEEDS_REPAIR", "BROKEN", "MISSING"]);

// Новый формат
const BodySchemaV2 = z.object({
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    comment: z.string().trim().max(2000).optional(),
    splits: z.array(z.object({
      condition: ConditionSchema,
      qty: z.number().int().min(0),
    })).min(1),
  })).min(1),
});

// Старый формат (для обратной совместимости): плоский массив
const BodySchemaV1 = z.object({
  lines: z.array(z.object({
    orderLineId: z.string().min(1),
    condition: ConditionSchema,
    qty: z.number().int().min(0),
  })).min(1),
});

const BodySchema = z.union([BodySchemaV2, BodySchemaV1]);

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

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      lines: {
        include: { item: { select: { type: true } } },
      },
    },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.status !== "RETURN_DECLARED") {
    return jsonError(400, "Приёмка доступна только когда клиент заявил возврат");
  }

  const lineById = new Map(order.lines.map((l) => [l.id, l]));
  const maybeFirstLine = (parsed.data as unknown as { lines?: unknown[] })?.lines?.[0];
  const isV2 =
    Boolean(maybeFirstLine) &&
    Array.isArray((maybeFirstLine as { splits?: unknown })?.splits);

  // Валидация нового формата до транзакции (чтобы не возвращать Response из transaction callback)
  if (isV2) {
    const lines = (parsed.data as z.infer<typeof BodySchemaV2>).lines;
    for (const l of lines) {
      const line = lineById.get(l.orderLineId);
      if (!line) return jsonError(400, "Некорректная позиция приёмки");
      const maxQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
      const sum = l.splits.reduce((s, x) => s + x.qty, 0);
      if (sum !== maxQty) {
        return jsonError(400, "Сумма количеств по статусам должна совпадать с полученным количеством");
      }
      const seen = new Set<string>();
      for (const s of l.splits) {
        if (seen.has(s.condition)) return jsonError(400, "Нельзя повторять один и тот же статус для позиции");
        seen.add(s.condition);
      }
    }
  }

  const ratingRows: Array<{ condition: Condition; qty: number; itemType: ItemType }> = [];

  await prisma.$transaction(async (tx) => {
    await tx.returnSplit.deleteMany({ where: { orderId: id, phase: "CHECKED_IN" } });

    if (isV2) {
      const lines = (parsed.data as z.infer<typeof BodySchemaV2>).lines;
      for (const l of lines) {
        const line = lineById.get(l.orderLineId);
        if (!line) continue;
        const maxQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
        const seen = new Set<string>();
        for (const s of l.splits) {
          if (s.qty <= 0) continue;
          if (seen.has(s.condition)) continue;
          seen.add(s.condition);
          const actualQty = Math.min(s.qty, maxQty);
          if (actualQty <= 0) continue;
          if (order.greenwichUserId) {
            ratingRows.push({
              condition: s.condition,
              qty: actualQty,
              itemType: line.item.type,
            });
          }
          await tx.returnSplit.create({
            data: {
              orderId: id,
              orderLineId: l.orderLineId,
              phase: "CHECKED_IN",
              condition: s.condition,
              qty: actualQty,
              comment: l.comment?.trim() || null,
            },
          });

          // Движения в “базы” по статусам (кроме OK)
          if (s.condition === "NEEDS_REPAIR" || s.condition === "BROKEN") {
            await tx.incident.create({
              data: {
                orderId: id,
                orderLineId: l.orderLineId,
                condition: s.condition,
                qty: actualQty,
                comment: l.comment?.trim() || null,
              },
            });
            const itemId = line.itemId;
            if (s.condition === "NEEDS_REPAIR") {
              await tx.item.update({
                where: { id: itemId },
                data: { inRepair: { increment: actualQty } },
              });
            } else {
              await tx.item.update({
                where: { id: itemId },
                data: { broken: { increment: actualQty } },
              });
            }
          } else if (s.condition === "MISSING") {
            await tx.lossRecord.create({
              data: {
                status: "OPEN",
                itemId: line.itemId,
                orderId: id,
                orderLineId: l.orderLineId,
                qty: actualQty,
                notes: l.comment?.trim() || null,
              },
            });
            await tx.item.update({
              where: { id: line.itemId },
              data: { missing: { increment: actualQty } },
            });
          }
        }
      }
    } else {
      const lines = (parsed.data as z.infer<typeof BodySchemaV1>).lines;
      for (const { orderLineId, condition, qty } of lines) {
        const line = lineById.get(orderLineId);
        if (!line || qty <= 0) continue;
        const maxQty = line.issuedQty ?? line.approvedQty ?? line.requestedQty;
        const actualQty = Math.min(qty, maxQty);
        if (actualQty <= 0) continue;
        if (order.greenwichUserId) {
          ratingRows.push({
            condition,
            qty: actualQty,
            itemType: line.item.type,
          });
        }
        await tx.returnSplit.create({
          data: {
            orderId: id,
            orderLineId,
            phase: "CHECKED_IN",
            condition,
            qty: actualQty,
          },
        });

        if (condition === "NEEDS_REPAIR" || condition === "BROKEN") {
          await tx.incident.create({
            data: {
              orderId: id,
              orderLineId,
              condition,
              qty: actualQty,
            },
          });
          if (condition === "NEEDS_REPAIR") {
            await tx.item.update({
              where: { id: line.itemId },
              data: { inRepair: { increment: actualQty } },
            });
          } else {
            await tx.item.update({
              where: { id: line.itemId },
              data: { broken: { increment: actualQty } },
            });
          }
        } else if (condition === "MISSING") {
          await tx.lossRecord.create({
            data: {
              status: "OPEN",
              itemId: line.itemId,
              orderId: id,
              orderLineId,
              qty: actualQty,
            },
          });
          await tx.item.update({
            where: { id: line.itemId },
            data: { missing: { increment: actualQty } },
          });
        }
      }
    }
    const incidentsDelta = order.greenwichUserId
      ? computeGreenwichIncidentsDelta(ratingRows)
      : 0;

    await tx.order.update({
      where: { id },
      data: {
        status: "CLOSED",
        ...(order.greenwichUserId != null
          ? { greenwichRatingIncidentsDelta: incidentsDelta }
          : {}),
      },
    });

    if (order.greenwichUserId) {
      await recomputeGreenwichRatingScore(tx, order.greenwichUserId);
    }
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
      returnSplits: {
        where: { phase: "CHECKED_IN" },
        include: { orderLine: { include: { item: { select: { name: true } } } } },
      },
    },
  });
  if (fullOrder) {
    type Fn = typeof import("@/server/notifications/order-notifications").notifyCheckInClosed;
    const payload = fullOrder as Parameters<Fn>[0];
    scheduleAfterResponse("notifyCheckInClosed", async () => {
      const { notifyCheckInClosed } = await import("@/server/notifications/order-notifications");
      await notifyCheckInClosed(payload);
      await notifyOrderStatusChangedInApp({
        userId: fullOrder.greenwichUserId,
        orderId: fullOrder.id,
        status: "CLOSED",
        customerName: fullOrder.customer?.name,
      });
    });
  }

  if (order.greenwichUserId) {
    const userId = order.greenwichUserId;
    scheduleAfterResponse("recomputeGreenwichAchievementsOnClosed", async () => {
      await prisma.$transaction(async (tx) => {
        await recomputeGreenwichAchievements(tx, userId);
      });
    });
  }

  return jsonOk({ ok: true });
}
