import { z } from "zod";
import { Prisma, ProjectActivityKind } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { DateOnlySchema, parseDateOnlyToUtcMidnight, utcTodayDateOnlyString } from "@/server/dates";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";
import {
  makeQueuedOrderCreatedResult,
  type OrderCreatedNotifyResult,
} from "@/server/notifications/order-notifications";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { makeEstimateArtifactsForOrder } from "@/server/orders/estimate-artifacts";
import { appendProjectActivityLog } from "@/server/projects/activity-log";
import { seedProjectEstimateFromOrder } from "@/server/projects/seed-estimate-from-order";

const LineSchema = z.object({
  itemId: z.string().trim().min(1),
  qty: z.number().int().positive().max(100000),
  comment: z.string().trim().max(2000).optional(),
  sourceKitId: z.string().trim().min(1).optional(),
});

const OrderSourceSchema = z.enum(["GREENWICH_INTERNAL", "WOWSTORG_EXTERNAL"]);

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

  source: OrderSourceSchema.optional(),
  greenwichUserId: z.string().trim().min(1).optional(),

  /// Заявка реквизита в рамках проекта (только WOWSTORG): заказчик и источник берутся из проекта.
  projectId: z.string().trim().min(1).optional(),

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

  // Нормализуем строки: группируем по (itemId, sourceKitId) чтобы не плодить дубли.
  const grouped = new Map<string, (typeof data.lines)[number] & { qty: number }>();
  for (const l of data.lines) {
    const key = `${l.itemId}::${l.sourceKitId ?? ""}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.qty += l.qty;
      if (l.comment) prev.comment = prev.comment ? `${prev.comment}\n${l.comment}` : l.comment;
    } else {
      grouped.set(key, { ...l });
    }
  }
  const lines = [...grouped.values()];

  let source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  let greenwichUserId: string | null;
  let payMultiplier: string;

  if (isWarehouse) {
    source = data.source ?? "WOWSTORG_EXTERNAL";
    if (source === "GREENWICH_INTERNAL") {
      if (!data.greenwichUserId?.trim()) {
        return jsonError(400, "Укажите сотрудника Grinvich для заявки");
      }
      greenwichUserId = data.greenwichUserId.trim();
      payMultiplier = String(PAY_MULTIPLIER_GREENWICH);
    } else {
      greenwichUserId = null;
      payMultiplier = "1";
    }
  } else {
    source = "GREENWICH_INTERNAL";
    greenwichUserId = auth.user.id;
    payMultiplier = String(PAY_MULTIPLIER_GREENWICH);
  }

  /** При создании из проекта — всегда внешняя заявка и полная цена (см. brain/features/projects.md). */
  if (hasProjectId) {
    source = "WOWSTORG_EXTERNAL";
    greenwichUserId = null;
    payMultiplier = "1";
  }

  // Serializable: снижает риск overbooking при параллельных POST с пересекающимися датами/позициями
  // (два запроса не «прочитают» одинаковый reserved до коммита другого).
  let result: { id: string; projectId: string | null };
  try {
    result = await prisma.$transaction(
      async (tx) => {
    let customerIdToUse: string;
    let orderProjectId: string | null = null;

    if (data.projectId?.trim()) {
      const proj = await tx.project.findFirst({
        where: { id: data.projectId!.trim(), archivedAt: null },
        select: { id: true, customerId: true },
      });
      if (!proj) throw new Error("PROJECT_NOT_FOUND");
      if (hasCustomerName) throw new Error("PROJECT_CUSTOMER_CONFLICT");
      if (hasCustomerId && data.customerId!.trim() !== proj.customerId) {
        throw new Error("PROJECT_CUSTOMER_MISMATCH");
      }
      customerIdToUse = proj.customerId;
      orderProjectId = proj.id;
    } else if (hasCustomerName) {
      const name = data.customerName!.trim();
      const existing = await tx.customer.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        customerIdToUse = existing.id;
      } else {
        const created = await tx.customer.create({
          data: { name },
          select: { id: true },
        });
        customerIdToUse = created.id;
      }
    } else {
      const customer = await tx.customer.findFirst({
        where: { id: data.customerId!, isActive: true },
        select: { id: true },
      });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      customerIdToUse = customer.id;
    }

    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const items = await tx.item.findMany({
      where: { id: { in: itemIds }, isActive: true, internalOnly: isWarehouse ? undefined : false },
      select: {
        id: true,
        pricePerDay: true,
        total: true,
        inRepair: true,
        broken: true,
        missing: true,
        internalOnly: true,
      },
    });
    if (items.length !== itemIds.length) {
      throw new Error("ITEM_NOT_FOUND");
    }
    if (!isWarehouse && items.some((i) => i.internalOnly)) {
      throw new Error("ITEM_NOT_FOUND");
    }
    const itemById = new Map(items.map((i) => [i.id, i]));

    const reserved = await getReservedQtyByItemId({ db: tx, startDate, endDate });
    for (const l of lines) {
      const item = itemById.get(l.itemId)!;
      const availableTotal = Math.max(0, item.total - item.inRepair - item.broken - item.missing);
      const reservedQty = reserved.get(l.itemId) ?? 0;
      const availableForDates = Math.max(0, availableTotal - reservedQty);
      if (l.qty > availableForDates) {
        throw new Error(`EXCEEDS_AVAILABILITY:${l.itemId}:${availableForDates}`);
      }
    }

    const order = await tx.order.create({
      data: {
        source,
        status: "SUBMITTED",
        createdById: auth.user.id,
        greenwichUserId,
        customerId: customerIdToUse,
        projectId: orderProjectId ?? undefined,
        eventName: data.eventName,
        comment: data.comment,
        readyByDate,
        startDate,
        endDate,
        deliveryEnabled: data.deliveryEnabled ?? false,
        deliveryComment: data.deliveryComment,
        deliveryPrice: data.deliveryPrice != null ? data.deliveryPrice : undefined,
        montageEnabled: data.montageEnabled ?? false,
        montageComment: data.montageComment,
        montagePrice: data.montagePrice != null ? data.montagePrice : undefined,
        demontageEnabled: data.demontageEnabled ?? false,
        demontageComment: data.demontageComment,
        demontagePrice: data.demontagePrice != null ? data.demontagePrice : undefined,
        payMultiplier,
        lines: {
          create: lines.map((l, idx) => ({
            itemId: l.itemId,
            sourceKitId: l.sourceKitId,
            requestedQty: l.qty,
            pricePerDaySnapshot: itemById.get(l.itemId)!.pricePerDay,
            greenwichComment: l.comment,
            position: idx,
          })),
        },
      },
      select: { id: true },
    });

    // Внешняя заявка склада не ждёт шага Greenwich:
    // сразу формируем смету и переводим в «Согласована».
    if (source === "WOWSTORG_EXTERNAL") {
      const artifacts = await makeEstimateArtifactsForOrder(tx, order.id);
      const now = new Date();
      await tx.order.update({
        where: { id: order.id },
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

    if (orderProjectId) {
      await seedProjectEstimateFromOrder(tx, {
        projectId: orderProjectId,
        orderId: order.id,
        actorUserId: auth.user.id,
      });
    }

    return { id: order.id, projectId: orderProjectId };
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
    if (e instanceof Error) {
      if (e.message === "CUSTOMER_NOT_FOUND") {
        return jsonError(400, "Заказчик не найден или неактивен");
      }
      if (e.message === "PROJECT_NOT_FOUND") {
        return jsonError(400, "Проект не найден или в архиве");
      }
      if (e.message === "PROJECT_CUSTOMER_CONFLICT") {
        return jsonError(400, "С проектом нельзя создавать нового заказчика по имени — используйте заказчика проекта");
      }
      if (e.message === "PROJECT_CUSTOMER_MISMATCH") {
        return jsonError(400, "Заказчик заявки должен совпадать с заказчиком проекта");
      }
      if (e.message === "ITEM_NOT_FOUND") {
        return jsonError(400, "Одна или несколько позиций недоступны");
      }
      const m = /^EXCEEDS_AVAILABILITY:[^:]+:(\d+)$/.exec(e.message);
      if (m) {
        return jsonError(400, `Недостаточно свободных единиц на выбранные даты (доступно ${m[1]})`);
      }
      const s = /^MISSING_SERVICE_PRICES:(.+)$/.exec(e.message);
      if (s) {
        const parts = s[1].split(",").filter(Boolean);
        return jsonError(400, `Укажите цену для включённых доп. услуг: ${parts.join(", ")}`);
      }
    }
    throw e;
  }

  if (result.projectId) {
    try {
      await appendProjectActivityLog(prisma, {
        projectId: result.projectId,
        actorUserId: auth.user.id,
        kind: ProjectActivityKind.ORDER_LINKED,
        payload: { orderId: result.id },
      });
    } catch (logErr) {
      console.error("[orders] appendProjectActivityLog failed", logErr);
    }
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
      await notifyOrderCreated(orderPayload);
    });
  }

  return jsonOk({ orderId: result.id, notification });
}

