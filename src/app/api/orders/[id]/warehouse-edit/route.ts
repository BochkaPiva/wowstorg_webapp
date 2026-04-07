import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { makeEstimateArtifactsForOrder } from "@/server/orders/estimate-artifacts";

const LineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().min(1),
  requestedQty: z.number().int().min(0).max(100000),
  warehouseComment: z.string().trim().max(2000).optional(),
});

const BodySchema = z.object({
  eventName: z.string().trim().max(200).optional(),
  comment: z.string().trim().max(5000).optional(),
  deliveryEnabled: z.boolean().optional(),
  deliveryComment: z.string().trim().max(2000).optional(),
  deliveryPrice: z.number().min(0).optional(),
  montageEnabled: z.boolean().optional(),
  montageComment: z.string().trim().max(2000).optional(),
  montagePrice: z.number().min(0).optional(),
  demontageEnabled: z.boolean().optional(),
  demontageComment: z.string().trim().max(2000).optional(),
  demontagePrice: z.number().min(0).optional(),
  lines: z.array(LineSchema).min(1).max(500),
});

const EDITABLE_STATUSES = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"] as const;
const CYCLE_RESET_STATUSES = ["APPROVED_BY_GREENWICH"] as const;

export async function PATCH(
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

  const data = parsed.data;

  let wasCycleStatus = false;
  let projectIdForNotify: string | null = null;

  try {
    await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
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

        if (!order) throw new Error("NOT_FOUND");
        projectIdForNotify = order.projectId;

        const quickRow = await tx.$queryRaw<Array<{ parentOrderId: string | null }>>`
          SELECT "parentOrderId"
          FROM "Order"
          WHERE "id" = ${id}
          LIMIT 1
        `;
        if (quickRow?.[0]?.parentOrderId) {
          throw new Error("FORBIDDEN_QUICK");
        }

        if (!EDITABLE_STATUSES.includes(order.status as (typeof EDITABLE_STATUSES)[number])) {
          throw new Error("BAD_STATUS");
        }

        const itemIds = [...new Set(data.lines.map((l) => l.itemId))];
        const items = await tx.item.findMany({
          where: { id: { in: itemIds }, isActive: true },
          select: {
            id: true,
            name: true,
            pricePerDay: true,
            total: true,
            inRepair: true,
            broken: true,
            missing: true,
          },
        });
        const itemById = new Map(items.map((i) => [i.id, i]));
        if (items.length !== itemIds.length) {
          throw new Error("ITEM_NOT_FOUND");
        }

        const requestedByItemId = new Map<string, number>();
        for (const row of data.lines) {
          requestedByItemId.set(row.itemId, (requestedByItemId.get(row.itemId) ?? 0) + row.requestedQty);
        }
        const reserved = await getReservedQtyByItemId({
          db: tx,
          startDate: order.startDate,
          endDate: order.endDate,
          excludeOrderId: id,
        });
        for (const [itemId, requestedTotal] of requestedByItemId) {
          const item = itemById.get(itemId)!;
          const availableTotal = Math.max(0, item.total - item.inRepair - item.broken - item.missing);
          const reservedQty = reserved.get(itemId) ?? 0;
          const availableForDates = Math.max(0, availableTotal - reservedQty);
          if (requestedTotal > availableForDates) {
            throw new Error(`AVAILABILITY:${item.name}:${availableForDates}:${requestedTotal}`);
          }
        }

        const existingIds = new Set(order.lines.map((l) => l.id));
        const incomingIds = new Set(data.lines.filter((l) => l.id).map((l) => l.id as string));
        const toDelete = order.lines.filter((l) => !incomingIds.has(l.id));

        wasCycleStatus = CYCLE_RESET_STATUSES.includes(order.status as (typeof CYCLE_RESET_STATUSES)[number]);

        for (const line of toDelete) {
          await tx.orderLine.delete({ where: { id: line.id } });
        }

        let position = 0;
        for (const row of data.lines) {
          const price = itemById.get(row.itemId)!.pricePerDay;
          if (row.id && existingIds.has(row.id)) {
            await tx.orderLine.update({
              where: { id: row.id },
              data: {
                requestedQty: row.requestedQty,
                warehouseComment: row.warehouseComment?.trim() || null,
                position,
              },
            });
          } else {
            await tx.orderLine.create({
              data: {
                orderId: id,
                itemId: row.itemId,
                requestedQty: row.requestedQty,
                pricePerDaySnapshot: price,
                warehouseComment: row.warehouseComment?.trim() || null,
                position,
              },
            });
          }
          position++;
        }

        await tx.order.update({
          where: { id },
          data: {
            ...(data.eventName !== undefined ? { eventName: data.eventName.trim() || null } : {}),
            ...(data.comment !== undefined ? { comment: data.comment.trim() || null } : {}),
            ...(data.deliveryEnabled !== undefined ? { deliveryEnabled: data.deliveryEnabled } : {}),
            ...(data.deliveryComment !== undefined ? { deliveryComment: data.deliveryComment.trim() || null } : {}),
            ...(data.deliveryPrice !== undefined ? { deliveryPrice: data.deliveryPrice } : {}),
            ...(data.montageEnabled !== undefined ? { montageEnabled: data.montageEnabled } : {}),
            ...(data.montageComment !== undefined ? { montageComment: data.montageComment.trim() || null } : {}),
            ...(data.montagePrice !== undefined ? { montagePrice: data.montagePrice } : {}),
            ...(data.demontageEnabled !== undefined ? { demontageEnabled: data.demontageEnabled } : {}),
            ...(data.demontageComment !== undefined ? { demontageComment: data.demontageComment.trim() || null } : {}),
            ...(data.demontagePrice !== undefined ? { demontagePrice: data.demontagePrice } : {}),
            ...(wasCycleStatus
              ? {
                  status:
                    order.source === "WOWSTORG_EXTERNAL"
                      ? "APPROVED_BY_GREENWICH"
                      : "SUBMITTED",
                }
              : {}),
          },
        });

        if (order.source === "WOWSTORG_EXTERNAL") {
          const artifacts = await makeEstimateArtifactsForOrder(tx, id);
          const now = new Date();
          await tx.order.update({
            where: { id },
            data: {
              status: "APPROVED_BY_GREENWICH",
              estimateSentAt: now,
              estimateSentSnapshot: artifacts.estimateSentSnapshot as unknown as object,
              estimateFileKey: artifacts.estimateFileKey,
              greenwichConfirmedAt: now,
              greenwichConfirmedSnapshot: artifacts.estimateSentSnapshot as unknown as object,
            },
          });
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return jsonError(409, "Конфликт при сохранении. Повторите попытку.");
    }
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") return jsonError(404, "Not found");
      if (e.message === "FORBIDDEN_QUICK") return jsonError(400, "Быстрая доп.-заявка не редактируется");
      if (e.message === "BAD_STATUS") return jsonError(400, "Редактировать заявку в текущем статусе нельзя");
      if (e.message === "ITEM_NOT_FOUND") return jsonError(400, "Одна или несколько позиций не найдены");
      const m = /^AVAILABILITY:(.+):(\d+):(\d+)$/.exec(e.message);
      if (m) {
        return jsonError(
          400,
          `«${m[1]}»: доступно ${m[2]} шт. на выбранные даты, запрошено ${m[3]}`,
        );
      }
      const s = /^MISSING_SERVICE_PRICES:(.+)$/.exec(e.message);
      if (s) {
        const parts = s[1].split(",").filter(Boolean);
        return jsonError(400, `Укажите цену для включённых доп. услуг: ${parts.join(", ")}`);
      }
    }
    console.error("[warehouse-edit] transaction error:", e);
    return jsonError(500, e instanceof Error ? e.message : "Ошибка при сохранении");
  }

  if (projectIdForNotify) {
    scheduleAfterResponse("notifyProjectEstimateFromWarehouseEdit", async () => {
      const { notifyProjectNoisyBlock } = await import("@/server/projects/project-notifications");
      await notifyProjectNoisyBlock({
        projectId: projectIdForNotify!,
        actorUserId: auth.user.id,
        block: "estimate",
        action: "Связанная заявка проекта была обновлена со стороны склада.",
      });
    });
  }

  return jsonOk({ ok: true });
}
