import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { calcOrderPricing, validateOrderDiscount } from "@/server/orders/order-pricing";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { makeEstimateArtifactsForOrder } from "@/server/orders/estimate-artifacts";

const LineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().min(1),
  requestedQty: z.number().int().min(0),
  warehouseComment: z.string().trim().max(2000).nullable().optional(),
});
const HiddenExpenseSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(160),
  comment: z.string().trim().max(1000).nullable().optional(),
  cost: z.number().min(0),
  internalPaymentMethod: z.enum(["NON_CASH", "CASH"]).optional(),
});
const DiscountTypeSchema = z.enum(["NONE", "PERCENT", "AMOUNT"]);
const ServicePaymentMethodSchema = z.enum(["NON_CASH", "CASH"]);

const BodySchema = z.object({
  eventName: z.string().trim().max(200).nullable().optional(),
  comment: z.string().trim().max(5000).nullable().optional(),
  deliveryEnabled: z.boolean().optional(),
  deliveryComment: z.string().trim().max(2000).nullable().optional(),
  deliveryPrice: z.number().min(0).optional(),
  deliveryInternalCost: z.number().min(0).nullable().optional(),
  deliveryInternalPaymentMethod: ServicePaymentMethodSchema.optional(),
  montageEnabled: z.boolean().optional(),
  montageComment: z.string().trim().max(2000).nullable().optional(),
  montagePrice: z.number().min(0).optional(),
  montageInternalCost: z.number().min(0).nullable().optional(),
  montageInternalPaymentMethod: ServicePaymentMethodSchema.optional(),
  demontageEnabled: z.boolean().optional(),
  demontageComment: z.string().trim().max(2000).nullable().optional(),
  demontagePrice: z.number().min(0).optional(),
  demontageInternalCost: z.number().min(0).nullable().optional(),
  demontageInternalPaymentMethod: ServicePaymentMethodSchema.optional(),
  rentalDiscountType: DiscountTypeSchema.optional(),
  rentalDiscountPercent: z.number().min(0).max(100).nullable().optional(),
  rentalDiscountAmount: z.number().min(0).nullable().optional(),
  hiddenExpenses: z.array(HiddenExpenseSchema).max(100).optional(),
  lines: z.array(LineSchema).min(1).max(500).optional(),
});

const EDITABLE_STATUSES = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED", "APPROVED_BY_GREENWICH"] as const;
const CYCLE_RESET_STATUSES = ["ESTIMATE_SENT", "APPROVED_BY_GREENWICH"] as const;

function discountValueForCompare(discount: {
  rentalDiscountType: string;
  rentalDiscountPercent: unknown;
  rentalDiscountAmount: unknown;
}): string {
  const type = discount.rentalDiscountType === "PERCENT" || discount.rentalDiscountType === "AMOUNT"
    ? discount.rentalDiscountType
    : "NONE";
  const percent = type === "PERCENT" && discount.rentalDiscountPercent != null
    ? Number(discount.rentalDiscountPercent)
    : null;
  const amount = type === "AMOUNT" && discount.rentalDiscountAmount != null
    ? Number(discount.rentalDiscountAmount)
    : null;
  return JSON.stringify({ type, percent, amount });
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizedNumber(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function serviceValueForCompare(service: {
  enabled: boolean;
  comment: string | null | undefined;
  price: unknown;
}): string {
  return JSON.stringify({
    enabled: service.enabled,
    comment: service.enabled ? normalizedText(service.comment) : "",
    price: service.enabled ? normalizedNumber(service.price) : 0,
  });
}

async function replaceHiddenExpenses(args: {
  tx: Prisma.TransactionClient;
  orderId: string;
  actorUserId: string;
  hiddenExpenses: z.infer<typeof HiddenExpenseSchema>[];
}) {
  await args.tx.orderHiddenExpense.deleteMany({ where: { orderId: args.orderId } });
  const rows = args.hiddenExpenses
    .map((expense, index) => ({
      orderId: args.orderId,
      title: expense.title.trim(),
      comment: expense.comment?.trim() || null,
      cost: expense.cost,
      internalPaymentMethod: expense.internalPaymentMethod ?? "NON_CASH",
      sortOrder: index,
      createdById: args.actorUserId,
    }))
    .filter((expense) => expense.title.length > 0 || Number(expense.cost) > 0);
  if (rows.length > 0) {
    await args.tx.orderHiddenExpense.createMany({ data: rows });
  }
}

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
  const hasDiscountInput =
    data.rentalDiscountType !== undefined ||
    data.rentalDiscountPercent !== undefined ||
    data.rentalDiscountAmount !== undefined;

  let wasCycleStatus = false;
  let projectIdForNotify: string | null = null;
  let rentalDiscountChanged = false;

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
        const isQuickSupplement = Boolean(quickRow?.[0]?.parentOrderId);

        const isRegularEditableStatus = EDITABLE_STATUSES.includes(
          order.status as (typeof EDITABLE_STATUSES)[number],
        );
        const hasClientFacingInput =
          data.eventName !== undefined ||
          data.comment !== undefined ||
          data.deliveryEnabled !== undefined ||
          data.deliveryComment !== undefined ||
          data.deliveryPrice !== undefined ||
          data.montageEnabled !== undefined ||
          data.montageComment !== undefined ||
          data.montagePrice !== undefined ||
          data.demontageEnabled !== undefined ||
          data.demontageComment !== undefined ||
          data.demontagePrice !== undefined;
        const hasInternalServiceInput =
          data.deliveryInternalCost !== undefined ||
          data.deliveryInternalPaymentMethod !== undefined ||
          data.montageInternalCost !== undefined ||
          data.montageInternalPaymentMethod !== undefined ||
          data.demontageInternalCost !== undefined ||
          data.demontageInternalPaymentMethod !== undefined;
        const hasHiddenExpenseInput = data.hiddenExpenses !== undefined;
        const isInternalOnlyPatch =
          order.status !== "CANCELLED" &&
          data.lines === undefined &&
          !hasDiscountInput &&
          !hasClientFacingInput &&
          (hasInternalServiceInput || hasHiddenExpenseInput);

        if (!isRegularEditableStatus && !isInternalOnlyPatch) {
          throw new Error("BAD_STATUS");
        }
        if (hasDiscountInput && !isRegularEditableStatus) {
          throw new Error("DISCOUNT_STATUS");
        }

        if (isInternalOnlyPatch) {
          await tx.order.update({
            where: { id },
            data: {
              ...(data.deliveryInternalCost !== undefined ? { deliveryInternalCost: data.deliveryInternalCost } : {}),
              ...(data.deliveryInternalPaymentMethod !== undefined
                ? { deliveryInternalPaymentMethod: data.deliveryInternalPaymentMethod }
                : {}),
              ...(data.montageInternalCost !== undefined ? { montageInternalCost: data.montageInternalCost } : {}),
              ...(data.montageInternalPaymentMethod !== undefined
                ? { montageInternalPaymentMethod: data.montageInternalPaymentMethod }
                : {}),
              ...(data.demontageInternalCost !== undefined ? { demontageInternalCost: data.demontageInternalCost } : {}),
              ...(data.demontageInternalPaymentMethod !== undefined
                ? { demontageInternalPaymentMethod: data.demontageInternalPaymentMethod }
                : {}),
            },
          });
          if (data.hiddenExpenses !== undefined) {
            await replaceHiddenExpenses({
              tx,
              orderId: id,
              actorUserId: auth.user.id,
              hiddenExpenses: data.hiddenExpenses,
            });
          }
          return;
        }

        const editLines = data.lines;
        if (!editLines?.length) {
          throw new Error("BAD_LINES");
        }

        const itemIds = [...new Set(editLines.map((l) => l.itemId))];
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
        for (const row of editLines) {
          requestedByItemId.set(row.itemId, (requestedByItemId.get(row.itemId) ?? 0) + row.requestedQty);
        }
        const reserved = await getReservedQtyByItemId({
          db: tx,
          startDate: order.startDate,
          endDate: order.endDate,
          rentalStartPartOfDay: order.rentalStartPartOfDay ?? "MORNING",
          rentalEndPartOfDay: order.rentalEndPartOfDay ?? "MORNING",
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
        const incomingIds = new Set(editLines.filter((l) => l.id).map((l) => l.id as string));
        const toDelete = order.lines.filter((l) => !incomingIds.has(l.id));

        wasCycleStatus = CYCLE_RESET_STATUSES.includes(order.status as (typeof CYCLE_RESET_STATUSES)[number]);

        const linePriceById = new Map(order.lines.map((l) => [l.id, l.pricePerDaySnapshot]));
        const nextDeliveryEnabled = data.deliveryEnabled ?? order.deliveryEnabled;
        const nextMontageEnabled = data.montageEnabled ?? order.montageEnabled;
        const nextDemontageEnabled = data.demontageEnabled ?? order.demontageEnabled;
        const nextDeliveryPrice = data.deliveryPrice ?? order.deliveryPrice;
        const nextMontagePrice = data.montagePrice ?? order.montagePrice;
        const nextDemontagePrice = data.demontagePrice ?? order.demontagePrice;
        const nextDiscount = {
          rentalDiscountType: data.rentalDiscountType ?? order.rentalDiscountType,
          rentalDiscountPercent:
            (data.rentalDiscountType ?? order.rentalDiscountType) === "PERCENT"
              ? data.rentalDiscountPercent ?? Number(order.rentalDiscountPercent ?? 0)
              : null,
          rentalDiscountAmount:
            (data.rentalDiscountType ?? order.rentalDiscountType) === "AMOUNT"
              ? data.rentalDiscountAmount ?? Number(order.rentalDiscountAmount ?? 0)
              : null,
        };
        if (hasDiscountInput) {
          rentalDiscountChanged =
            discountValueForCompare(order) !==
            discountValueForCompare({
              rentalDiscountType: nextDiscount.rentalDiscountType,
              rentalDiscountPercent: nextDiscount.rentalDiscountPercent,
              rentalDiscountAmount: nextDiscount.rentalDiscountAmount,
            });
        }
        const existingClientLineSignature = JSON.stringify(
          order.lines.map((line) => ({
            itemId: line.itemId,
            requestedQty: line.requestedQty,
          })),
        );
        const nextClientLineSignature = JSON.stringify(
          editLines.map((line) => ({
            itemId: line.itemId,
            requestedQty: line.requestedQty,
          })),
        );
        const clientFacingChanged =
          existingClientLineSignature !== nextClientLineSignature ||
          (data.eventName !== undefined && normalizedText(data.eventName) !== normalizedText(order.eventName)) ||
          (data.comment !== undefined && normalizedText(data.comment) !== normalizedText(order.comment)) ||
          serviceValueForCompare({
            enabled: order.deliveryEnabled,
            comment: order.deliveryComment,
            price: order.deliveryPrice,
          }) !==
            serviceValueForCompare({
              enabled: nextDeliveryEnabled,
              comment: data.deliveryComment !== undefined ? data.deliveryComment : order.deliveryComment,
              price: nextDeliveryPrice,
            }) ||
          serviceValueForCompare({
            enabled: order.montageEnabled,
            comment: order.montageComment,
            price: order.montagePrice,
          }) !==
            serviceValueForCompare({
              enabled: nextMontageEnabled,
              comment: data.montageComment !== undefined ? data.montageComment : order.montageComment,
              price: nextMontagePrice,
            }) ||
          serviceValueForCompare({
            enabled: order.demontageEnabled,
            comment: order.demontageComment,
            price: order.demontagePrice,
          }) !==
            serviceValueForCompare({
              enabled: nextDemontageEnabled,
              comment: data.demontageComment !== undefined ? data.demontageComment : order.demontageComment,
              price: nextDemontagePrice,
            }) ||
          rentalDiscountChanged;
        const pricingPreview = calcOrderPricing({
          startDate: order.startDate,
          endDate: order.endDate,
          rentalStartPartOfDay: order.rentalStartPartOfDay,
          rentalEndPartOfDay: order.rentalEndPartOfDay,
          payMultiplier: order.payMultiplier,
          deliveryEnabled: nextDeliveryEnabled,
          deliveryPrice: nextDeliveryPrice,
          montageEnabled: nextMontageEnabled,
          montagePrice: nextMontagePrice,
          demontageEnabled: nextDemontageEnabled,
          demontagePrice: nextDemontagePrice,
          lines: editLines.map((row) => ({
            itemId: row.itemId,
            requestedQty: row.requestedQty,
            pricePerDaySnapshot:
              row.id && linePriceById.has(row.id)
                ? linePriceById.get(row.id)
                : itemById.get(row.itemId)!.pricePerDay,
          })),
          discount: nextDiscount,
        });
        const discountValidation = validateOrderDiscount({
          discount: nextDiscount,
          rentalSubtotalBeforeDiscount: pricingPreview.rentalSubtotalBeforeDiscount,
        });
        if (!discountValidation.ok) throw new Error(`INVALID_DISCOUNT:${discountValidation.message}`);

        for (const line of toDelete) {
          await tx.orderLine.delete({ where: { id: line.id } });
        }

        let position = 0;
        for (const row of editLines) {
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
            ...(data.eventName !== undefined ? { eventName: data.eventName?.trim() || null } : {}),
            ...(data.comment !== undefined ? { comment: data.comment?.trim() || null } : {}),
            ...(data.deliveryEnabled !== undefined ? { deliveryEnabled: data.deliveryEnabled } : {}),
            ...(data.deliveryComment !== undefined ? { deliveryComment: data.deliveryComment?.trim() || null } : {}),
            ...(data.deliveryPrice !== undefined ? { deliveryPrice: data.deliveryPrice } : {}),
            ...(data.deliveryInternalCost !== undefined ? { deliveryInternalCost: data.deliveryInternalCost } : {}),
            ...(data.deliveryInternalPaymentMethod !== undefined
              ? { deliveryInternalPaymentMethod: data.deliveryInternalPaymentMethod }
              : {}),
            ...(data.montageEnabled !== undefined ? { montageEnabled: data.montageEnabled } : {}),
            ...(data.montageComment !== undefined ? { montageComment: data.montageComment?.trim() || null } : {}),
            ...(data.montagePrice !== undefined ? { montagePrice: data.montagePrice } : {}),
            ...(data.montageInternalCost !== undefined ? { montageInternalCost: data.montageInternalCost } : {}),
            ...(data.montageInternalPaymentMethod !== undefined
              ? { montageInternalPaymentMethod: data.montageInternalPaymentMethod }
              : {}),
            ...(data.demontageEnabled !== undefined ? { demontageEnabled: data.demontageEnabled } : {}),
            ...(data.demontageComment !== undefined ? { demontageComment: data.demontageComment?.trim() || null } : {}),
            ...(data.demontagePrice !== undefined ? { demontagePrice: data.demontagePrice } : {}),
            ...(data.demontageInternalCost !== undefined ? { demontageInternalCost: data.demontageInternalCost } : {}),
            ...(data.demontageInternalPaymentMethod !== undefined
              ? { demontageInternalPaymentMethod: data.demontageInternalPaymentMethod }
              : {}),
            ...(hasDiscountInput
              ? {
                  rentalDiscountType: nextDiscount.rentalDiscountType,
                  rentalDiscountPercent:
                    nextDiscount.rentalDiscountType === "PERCENT" ? nextDiscount.rentalDiscountPercent : null,
                  rentalDiscountAmount:
                    nextDiscount.rentalDiscountType === "AMOUNT" ? nextDiscount.rentalDiscountAmount : null,
                }
              : {}),
            ...(wasCycleStatus && clientFacingChanged
              ? {
                  status:
                    order.source === "WOWSTORG_EXTERNAL" || isQuickSupplement
                      ? "APPROVED_BY_GREENWICH"
                      : "SUBMITTED",
                }
              : {}),
          },
        });

        if (data.hiddenExpenses !== undefined) {
          await replaceHiddenExpenses({
            tx,
            orderId: id,
            actorUserId: auth.user.id,
            hiddenExpenses: data.hiddenExpenses,
          });
        }

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
      if (e.message === "BAD_LINES") return jsonError(400, "В заявке должна быть хотя бы одна позиция");
      if (e.message === "BAD_STATUS") return jsonError(400, "Редактировать заявку в текущем статусе нельзя");
      if (e.message === "DISCOUNT_STATUS") return jsonError(400, "Скидку можно менять только до начала сборки");
      if (e.message === "ITEM_NOT_FOUND") return jsonError(400, "Одна или несколько позиций не найдены");
      if (e.message.startsWith("INVALID_DISCOUNT:")) return jsonError(400, e.message.replace("INVALID_DISCOUNT:", ""));
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

  if (rentalDiscountChanged) {
    const orderForNotify = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        greenwichUser: { select: { displayName: true } },
        createdBy: { select: { displayName: true } },
        lines: {
          orderBy: [{ position: "asc" }],
          include: { item: { select: { name: true } } },
        },
      },
    });
    if (orderForNotify) {
      type NotifyDiscount = typeof import("@/server/notifications/order-notifications").notifyRentalDiscountApplied;
      const payload = orderForNotify as Parameters<NotifyDiscount>[0];
      scheduleAfterResponse("notifyRentalDiscountApplied", async () => {
        const { notifyRentalDiscountApplied } = await import("@/server/notifications/order-notifications");
        const { notifyOrderDiscountInApp } = await import("@/server/notifications/in-app");
        await notifyRentalDiscountApplied(payload);
        await notifyOrderDiscountInApp({
          userId: orderForNotify.greenwichUserId,
          orderId: orderForNotify.id,
          title: "Скидка по заявке применена",
          body: `Заказчик: ${orderForNotify.customer?.name ?? "—"}`,
        });
      });
    }
  }

  return jsonOk({ ok: true });
}
