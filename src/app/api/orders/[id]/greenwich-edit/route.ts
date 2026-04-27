import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { calcOrderPricing, validateOrderDiscount } from "@/server/orders/order-pricing";
import { getReservedQtyByItemId } from "@/server/orders/reserve";

const LineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().min(1),
  requestedQty: z.number().int().min(0).max(100000),
  greenwichComment: z.string().trim().max(2000).optional(),
});
const DiscountTypeSchema = z.enum(["NONE", "PERCENT", "AMOUNT"]);

const BodySchema = z.object({
  eventName: z.string().trim().max(200).optional(),
  comment: z.string().trim().max(5000).optional(),
  deliveryEnabled: z.boolean().optional(),
  deliveryComment: z.string().trim().max(2000).optional(),
  montageEnabled: z.boolean().optional(),
  montageComment: z.string().trim().max(2000).optional(),
  demontageEnabled: z.boolean().optional(),
  demontageComment: z.string().trim().max(2000).optional(),
  greenwichRequestedDiscountType: DiscountTypeSchema.optional(),
  greenwichRequestedDiscountPercent: z.number().min(0).max(100).nullable().optional(),
  greenwichRequestedDiscountAmount: z.number().min(0).nullable().optional(),
  greenwichDiscountRequestComment: z.string().trim().max(1000).nullable().optional(),
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

    let orderBefore: unknown;
    let shouldRequestChanges = false;

    try {
      await prisma.$transaction(
        async (tx) => {
          const order = await tx.order.findUnique({
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
          if (!order) throw new Error("NOT_FOUND");
          if (order.greenwichUserId !== auth.user.id) throw new Error("FORBIDDEN_USER");

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
            where: { id: { in: itemIds }, isActive: true, internalOnly: false },
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
          if (items.length !== itemIds.length) throw new Error("ITEM_NOT_FOUND");

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
          const linePriceById = new Map(order.lines.map((l) => [l.id, l.pricePerDaySnapshot]));
          const requestedDiscount = {
            rentalDiscountType: data.greenwichRequestedDiscountType ?? order.greenwichRequestedDiscountType,
            rentalDiscountPercent:
              (data.greenwichRequestedDiscountType ?? order.greenwichRequestedDiscountType) === "PERCENT"
                ? data.greenwichRequestedDiscountPercent ?? Number(order.greenwichRequestedDiscountPercent ?? 0)
                : null,
            rentalDiscountAmount:
              (data.greenwichRequestedDiscountType ?? order.greenwichRequestedDiscountType) === "AMOUNT"
                ? data.greenwichRequestedDiscountAmount ?? Number(order.greenwichRequestedDiscountAmount ?? 0)
                : null,
          };
          const pricingPreview = calcOrderPricing({
            startDate: order.startDate,
            endDate: order.endDate,
            payMultiplier: order.payMultiplier,
            lines: data.lines.map((row) => ({
              itemId: row.itemId,
              requestedQty: row.requestedQty,
              pricePerDaySnapshot:
                row.id && linePriceById.has(row.id)
                  ? linePriceById.get(row.id)
                  : itemById.get(row.itemId)!.pricePerDay,
            })),
          });
          const requestValidation = validateOrderDiscount({
            discount: requestedDiscount,
            rentalSubtotalBeforeDiscount: pricingPreview.rentalSubtotalBeforeDiscount,
          });
          if (!requestValidation.ok) throw new Error(`INVALID_DISCOUNT_REQUEST:${requestValidation.message}`);

          shouldRequestChanges = order.status === "ESTIMATE_SENT" || order.status === "APPROVED_BY_GREENWICH";

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
                  greenwichRequestedDiscountType: data.greenwichRequestedDiscountType ?? order.greenwichRequestedDiscountType,
                  greenwichRequestedDiscountPercent:
                    data.greenwichRequestedDiscountType === "PERCENT"
                      ? data.greenwichRequestedDiscountPercent ?? null
                      : order.greenwichRequestedDiscountPercent != null
                        ? Number(order.greenwichRequestedDiscountPercent)
                        : null,
                  greenwichRequestedDiscountAmount:
                    data.greenwichRequestedDiscountType === "AMOUNT"
                      ? data.greenwichRequestedDiscountAmount ?? null
                      : order.greenwichRequestedDiscountAmount != null
                        ? Number(order.greenwichRequestedDiscountAmount)
                        : null,
                  greenwichDiscountRequestComment:
                    data.greenwichDiscountRequestComment !== undefined
                      ? (data.greenwichDiscountRequestComment?.trim() || null)
                      : order.greenwichDiscountRequestComment,
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

          orderBefore = order;

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
              ...(data.greenwichRequestedDiscountType !== undefined
                ? {
                    greenwichRequestedDiscountType: data.greenwichRequestedDiscountType,
                    greenwichRequestedDiscountPercent:
                      data.greenwichRequestedDiscountType === "PERCENT"
                        ? data.greenwichRequestedDiscountPercent ?? null
                        : null,
                    greenwichRequestedDiscountAmount:
                      data.greenwichRequestedDiscountType === "AMOUNT"
                        ? data.greenwichRequestedDiscountAmount ?? null
                        : null,
                  }
                : {}),
              ...(data.greenwichDiscountRequestComment !== undefined
                ? { greenwichDiscountRequestComment: data.greenwichDiscountRequestComment?.trim() || null }
                : {}),
              ...(shouldRequestChanges
                ? { status: "CHANGES_REQUESTED", changesRequestedSnapshot: changesRequestedSnapshot as unknown as object }
                : {}),
            },
          });
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
        if (e.message === "FORBIDDEN_USER") return jsonError(403, "Forbidden");
        if (e.message === "FORBIDDEN_QUICK") return jsonError(400, "Быстрая доп.-заявка не редактируется");
        if (e.message === "BAD_STATUS") return jsonError(400, "Редактировать заявку в текущем статусе нельзя");
        if (e.message === "ITEM_NOT_FOUND") return jsonError(400, "Одна или несколько позиций не найдены");
        if (e.message.startsWith("INVALID_DISCOUNT_REQUEST:")) return jsonError(400, e.message.replace("INVALID_DISCOUNT_REQUEST:", ""));
        const m = /^AVAILABILITY:(.+):(\d+):(\d+)$/.exec(e.message);
        if (m) {
          return jsonError(
            400,
            `«${m[1]}»: доступно ${m[2]} шт. на выбранные даты, запрошено ${m[3]}`,
          );
        }
      }
      console.error("[greenwich-edit] transaction error:", e);
      return jsonError(500, e instanceof Error ? e.message : "Ошибка при сохранении");
    }

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
    if (after && orderBefore) {
      const before = orderBefore;
      const afterOrder = after;
      const resend = shouldRequestChanges;
      type Args = Parameters<typeof import("@/server/notifications/order-notifications").notifyGreenwichEdited>[0];
      const payload: Args = {
        before: before as Args["before"],
        after: afterOrder as Args["after"],
        requiresResendEstimate: resend,
      };
      scheduleAfterResponse("notifyGreenwichEdited", async () => {
        const { notifyGreenwichEdited } = await import("@/server/notifications/order-notifications");
        await notifyGreenwichEdited(payload);
      });
    }

    return jsonOk({ ok: true });
  } catch (e) {
    console.error("[greenwich-edit] unexpected error:", e);
    return jsonError(500, e instanceof Error ? e.message : "Ошибка при сохранении");
  }
}
