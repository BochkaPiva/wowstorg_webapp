import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { DateOnlySchema, parseDateOnlyToUtcMidnight, utcTodayDateOnlyString } from "@/server/dates";
import { createOrderInTransaction, CreateOrderError } from "@/server/orders/create-order";
import {
  makeQueuedOrderCreatedResult,
  type OrderCreatedNotifyResult,
} from "@/server/notifications/order-notifications";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";

const LineSchema = z.object({
  itemId: z.string().trim().min(1),
  qty: z.number().int().positive().max(100000),
  comment: z.string().trim().max(2000).optional(),
  sourceKitId: z.string().trim().min(1).optional(),
});

const OrderSourceSchema = z.enum(["GREENWICH_INTERNAL", "WOWSTORG_EXTERNAL"]);
const DiscountTypeSchema = z.enum(["NONE", "PERCENT", "AMOUNT"]);

const BodySchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(1).max(200).optional(),
  readyByDate: DateOnlySchema,
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
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
  deliveryInternalCost: z.number().min(0).nullable().optional(),
  montageInternalCost: z.number().min(0).nullable().optional(),
  demontageInternalCost: z.number().min(0).nullable().optional(),

  source: OrderSourceSchema.optional(),
  greenwichUserId: z.string().trim().min(1).optional(),

  /// Заявка реквизита в рамках проекта (только WOWSTORG): заказчик и источник берутся из проекта.
  projectId: z.string().trim().min(1).optional(),
  targetEstimateVersionId: z.string().trim().min(1).optional(),

  rentalDiscountType: DiscountTypeSchema.optional(),
  rentalDiscountPercent: z.number().min(0).max(100).nullable().optional(),
  rentalDiscountAmount: z.number().min(0).nullable().optional(),
  greenwichRequestedDiscountType: DiscountTypeSchema.optional(),
  greenwichRequestedDiscountPercent: z.number().min(0).max(100).nullable().optional(),
  greenwichRequestedDiscountAmount: z.number().min(0).nullable().optional(),
  greenwichDiscountRequestComment: z.string().trim().max(1000).nullable().optional(),

  lines: z.array(LineSchema).min(1).max(500),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH" && auth.user.role !== "WOWSTORG") {
    return jsonError(403, "Создавать заявки могут только Grinvich или склад");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid input", parsed.error.flatten());
  }

  const data = parsed.data;
  const isWarehouse = auth.user.role === "WOWSTORG";
  const hasProjectId = Boolean(data.projectId?.trim());
  if (hasProjectId && !isWarehouse) {
    return jsonError(403, "Привязка к проекту доступна только со склада (Wowstorg)");
  }

  const hasCustomerId = Boolean(data.customerId?.trim());
  const hasCustomerName = Boolean(data.customerName?.trim());
  if (!hasProjectId && !hasCustomerId && !hasCustomerName) {
    return jsonError(400, "Укажите заказчика (выберите из списка или введите название)");
  }
  const readyByDate = parseDateOnlyToUtcMidnight(data.readyByDate);
  const startDate = parseDateOnlyToUtcMidnight(data.startDate);
  const endDate = parseDateOnlyToUtcMidnight(data.endDate);

  const minCalendarDay = utcTodayDateOnlyString();
  if (
    data.readyByDate < minCalendarDay ||
    data.startDate < minCalendarDay ||
    data.endDate < minCalendarDay
  ) {
    return jsonError(400, "Даты не могут быть в прошлом");
  }

  if (!(readyByDate.getTime() <= startDate.getTime())) {
    return jsonError(400, "readyByDate must be <= startDate");
  }
  if (!(startDate.getTime() <= endDate.getTime())) {
    return jsonError(400, "Дата окончания не может быть раньше даты начала");
  }

  // Serializable: снижает риск overbooking при параллельных POST с пересекающимися датами/позициями
  // (два запроса не «прочитают» одинаковый reserved до коммита другого).
  let result: { id: string; projectId: string | null };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        return createOrderInTransaction(tx, {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          customerId: data.customerId,
          customerName: data.customerName,
          readyByDate: data.readyByDate,
          startDate: data.startDate,
          endDate: data.endDate,
          eventName: data.eventName,
          comment: data.comment,
          deliveryEnabled: data.deliveryEnabled,
          deliveryComment: data.deliveryComment,
          deliveryPrice: data.deliveryPrice,
          montageEnabled: data.montageEnabled,
          montageComment: data.montageComment,
          montagePrice: data.montagePrice,
          demontageEnabled: data.demontageEnabled,
          demontageComment: data.demontageComment,
          demontagePrice: data.demontagePrice,
          ...(isWarehouse
            ? {
                deliveryInternalCost: data.deliveryInternalCost,
                montageInternalCost: data.montageInternalCost,
                demontageInternalCost: data.demontageInternalCost,
              }
            : {}),
          source: data.source,
          greenwichUserId: data.greenwichUserId,
          projectId: data.projectId,
          targetEstimateVersionId: data.targetEstimateVersionId,
          rentalDiscountType: isWarehouse ? data.rentalDiscountType : "NONE",
          rentalDiscountPercent: isWarehouse ? data.rentalDiscountPercent : null,
          rentalDiscountAmount: isWarehouse ? data.rentalDiscountAmount : null,
          greenwichRequestedDiscountType: !isWarehouse ? data.greenwichRequestedDiscountType : "NONE",
          greenwichRequestedDiscountPercent: !isWarehouse ? data.greenwichRequestedDiscountPercent : null,
          greenwichRequestedDiscountAmount: !isWarehouse ? data.greenwichRequestedDiscountAmount : null,
          greenwichDiscountRequestComment: !isWarehouse ? data.greenwichDiscountRequestComment : null,
          lines: data.lines,
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
      return jsonError(409, "Конфликт при резервировании. Повторите попытку.");
    }
    if (e instanceof CreateOrderError) {
      if (e.code === "CUSTOMER_NOT_FOUND") {
        return jsonError(400, "Заказчик не найден или неактивен");
      }
      if (e.code === "PROJECT_NOT_FOUND") {
        return jsonError(400, "Проект не найден или в архиве");
      }
      if (e.code === "PROJECT_CUSTOMER_CONFLICT") {
        return jsonError(400, "С проектом нельзя создавать нового заказчика по имени — используйте заказчика проекта");
      }
      if (e.code === "PROJECT_CUSTOMER_MISMATCH") {
        return jsonError(400, "Заказчик заявки должен совпадать с заказчиком проекта");
      }
      if (e.code === "ITEM_NOT_FOUND") {
        return jsonError(400, "Одна или несколько позиций недоступны");
      }
      if (e.code === "EXCEEDS_AVAILABILITY") {
        return jsonError(
          400,
          `Недостаточно свободных единиц на выбранные даты (доступно ${String(e.details?.availableForDates ?? 0)})`,
        );
      }
      if (e.code === "GREENWICH_USER_REQUIRED") {
        return jsonError(400, "Укажите сотрудника Grinvich для заявки");
      }
      if (e.code === "CUSTOMER_REQUIRED") {
        return jsonError(400, "Укажите заказчика (выберите из списка или введите название)");
      }
      if (e.code === "PROJECT_FORBIDDEN") {
        return jsonError(403, "Привязка к проекту доступна только со склада (Wowstorg)");
      }
      if (e.code === "DATE_IN_PAST") {
        return jsonError(400, "Даты не могут быть в прошлом");
      }
      if (e.code === "READY_AFTER_START") {
        return jsonError(400, "readyByDate must be <= startDate");
      }
      if (e.code === "END_BEFORE_START") {
        return jsonError(400, "Дата окончания не может быть раньше даты начала");
      }
      if (e.code === "INVALID_DISCOUNT") {
        return jsonError(400, e.message || "Некорректная скидка");
      }
      if (e.code === "INVALID_DISCOUNT_REQUEST") {
        return jsonError(400, e.message || "Некорректный запрос скидки");
      }
    }
    throw e;
  }

  const createdOrder = await prisma.order.findUnique({
    where: { id: result.id },
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
  let notification: OrderCreatedNotifyResult | undefined;
  if (createdOrder) {
    type NotifyCreated = typeof import("@/server/notifications/order-notifications").notifyOrderCreated;
    const orderPayload = createdOrder as Parameters<NotifyCreated>[0];
    notification = makeQueuedOrderCreatedResult();
    scheduleAfterResponse("notifyOrderCreated", async () => {
      const { notifyOrderCreated } = await import("@/server/notifications/order-notifications");
      const { notifyWarehouseOrderInApp } = await import("@/server/notifications/in-app");
      await notifyOrderCreated(orderPayload);
      await notifyWarehouseOrderInApp({
        orderId: createdOrder.id,
        title: "Новая заявка",
        body: `Заказчик: ${createdOrder.customer?.name ?? "—"}`,
      });
    });
    if (
      isWarehouse &&
      createdOrder.source === "GREENWICH_INTERNAL" &&
      createdOrder.rentalDiscountType !== "NONE"
    ) {
      type NotifyDiscount = typeof import("@/server/notifications/order-notifications").notifyRentalDiscountApplied;
      const discountPayload = createdOrder as Parameters<NotifyDiscount>[0];
      scheduleAfterResponse("notifyRentalDiscountApplied", async () => {
        const { notifyRentalDiscountApplied } = await import("@/server/notifications/order-notifications");
        const { notifyOrderDiscountInApp } = await import("@/server/notifications/in-app");
        await notifyRentalDiscountApplied(discountPayload);
        await notifyOrderDiscountInApp({
          userId: createdOrder.greenwichUserId,
          orderId: createdOrder.id,
          title: "Скидка по заявке применена",
          body: `Заказчик: ${createdOrder.customer?.name ?? "—"}`,
        });
      });
    }
  }

  return jsonOk({ orderId: result.id, notification });
}

