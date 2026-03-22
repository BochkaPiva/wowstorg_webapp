import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getReservedQtyByItemId } from "@/server/orders/reserve";

const LineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().min(1),
  requestedQty: z.number().int().min(0).max(100000),
  greenwichComment: z.string().trim().max(2000).optional(),
});

const BodySchema = z.object({
  eventName: z.string().trim().max(200).optional(),
  comment: z.string().trim().max(5000).optional(),
  deliveryEnabled: z.boolean().optional(),
  deliveryComment: z.string().trim().max(2000).optional(),
  montageEnabled: z.boolean().optional(),
  montageComment: z.string().trim().max(2000).optional(),
  demontageEnabled: z.boolean().optional(),
  demontageComment: z.string().trim().max(2000).optional(),
  lines: z.array(LineSchema).min(1).max(500),
});

const EDITABLE_STATUSES = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"] as const;

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;
    if (auth.user.role !== "GREENWICH") return jsonError(403, "Forbidden");

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

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      greenwichUser: { select: { id: true, displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
  if (!order) return jsonError(404, "Not found");
  if (order.greenwichUserId !== auth.user.id) return jsonError(403, "Forbidden");

  // Quick supplement (быстрая доп.-выдача) нельзя редактировать обычными формами.
  const quickRow = await prisma.$queryRaw<Array<{ parentOrderId: string | null }>>`
    SELECT "parentOrderId"
    FROM "Order"
    WHERE "id" = ${id}
    LIMIT 1
  `;
  if (quickRow?.[0]?.parentOrderId) {
    return jsonError(400, "Быстрая доп.-заявка не редактируется");
  }

  if (!EDITABLE_STATUSES.includes(order.status as (typeof EDITABLE_STATUSES)[number])) {
    return jsonError(400, "Редактировать заявку в текущем статусе нельзя");
  }

  const itemIds = [...new Set(data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, isActive: true, internalOnly: false },
    select: { id: true, name: true, pricePerDay: true, total: true, inRepair: true, broken: true, missing: true },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  if (items.length !== itemIds.length) return jsonError(400, "Одна или несколько позиций не найдены");

  const requestedByItemId = new Map<string, number>();
  for (const row of data.lines) {
    requestedByItemId.set(row.itemId, (requestedByItemId.get(row.itemId) ?? 0) + row.requestedQty);
  }
  const reserved = await getReservedQtyByItemId({
    db: prisma,
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
      return jsonError(
        400,
        `«${item.name}»: доступно ${availableForDates} шт. на выбранные даты, запрошено ${requestedTotal}`,
      );
    }
  }

  const existingIds = new Set(order.lines.map((l) => l.id));
  const incomingIds = new Set(data.lines.filter((l) => l.id).map((l) => l.id as string));
  const toDelete = order.lines.filter((l) => !incomingIds.has(l.id));

  const shouldRequestChanges = order.status === "ESTIMATE_SENT" || order.status === "APPROVED_BY_GREENWICH";

  const changesRequestedSnapshot =
    shouldRequestChanges
      ? ({
          eventName: data.eventName !== undefined ? (data.eventName.trim() || null) : order.eventName,
          comment: data.comment !== undefined ? (data.comment.trim() || null) : order.comment,
          deliveryEnabled: data.deliveryEnabled ?? order.deliveryEnabled,
          deliveryComment: data.deliveryComment !== undefined ? (data.deliveryComment.trim() || null) : order.deliveryComment,
          montageEnabled: data.montageEnabled ?? order.montageEnabled,
          montageComment: data.montageComment !== undefined ? (data.montageComment.trim() || null) : order.montageComment,
          demontageEnabled: data.demontageEnabled ?? order.demontageEnabled,
          demontageComment: data.demontageComment !== undefined ? (data.demontageComment.trim() || null) : order.demontageComment,
          lines: [...data.lines]
            .map((l) => ({
              itemId: l.itemId,
              requestedQty: l.requestedQty,
              greenwichComment: (l.greenwichComment ?? "").trim() || null,
            }))
            .sort((a, b) =>
              a.itemId.localeCompare(b.itemId) ||
              a.requestedQty - b.requestedQty ||
              (a.greenwichComment ?? "").localeCompare(b.greenwichComment ?? ""),
            ),
        } as const)
      : undefined;

  await prisma.$transaction(async (tx) => {
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
            greenwichComment: row.greenwichComment?.trim() || null,
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
            greenwichComment: row.greenwichComment?.trim() || null,
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
        ...(data.montageEnabled !== undefined ? { montageEnabled: data.montageEnabled } : {}),
        ...(data.montageComment !== undefined ? { montageComment: data.montageComment.trim() || null } : {}),
        ...(data.demontageEnabled !== undefined ? { demontageEnabled: data.demontageEnabled } : {}),
        ...(data.demontageComment !== undefined ? { demontageComment: data.demontageComment.trim() || null } : {}),
        ...(shouldRequestChanges ? { status: "CHANGES_REQUESTED", changesRequestedSnapshot: changesRequestedSnapshot as unknown as object } : {}),
      },
    });
  });

  const after = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
    if (after) {
      const { notifyGreenwichEdited } = await import("@/server/notifications/order-notifications");
      void notifyGreenwichEdited({
        before: order as Parameters<typeof notifyGreenwichEdited>[0]["before"],
        after: after as Parameters<typeof notifyGreenwichEdited>[0]["after"],
        requiresResendEstimate: shouldRequestChanges,
      }).catch((e) => console.error("[greenwich-edit] notifyGreenwichEdited failed:", e));
    }

    return jsonOk({ ok: true });
  } catch (e) {
    console.error("[greenwich-edit] unexpected error:", e);
    return jsonError(500, e instanceof Error ? e.message : "Ошибка при сохранении");
  }
}

