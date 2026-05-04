import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { assertEnabledServicePricesPresent } from "@/server/orders/service-pricing";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import {
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";
import { formatRentalPeriodRangeFromUtcDatesRu, type RentalPartOfDay } from "@/lib/rental-days";

const LineSchema = z.object({
  itemId: z.string().trim().min(1),
  qty: z.number().int().positive().max(100000),
});

const BodySchema = z.object({
  lines: z.array(LineSchema).min(1).max(500),
  deliveryEnabled: z.boolean().optional(),
  deliveryComment: z.string().trim().max(2000).optional(),
  deliveryPrice: z.number().min(0).optional(),
  deliveryInternalCost: z.number().min(0).nullable().optional(),
  montageEnabled: z.boolean().optional(),
  montageComment: z.string().trim().max(2000).optional(),
  montagePrice: z.number().min(0).optional(),
  montageInternalCost: z.number().min(0).nullable().optional(),
  demontageEnabled: z.boolean().optional(),
  demontageComment: z.string().trim().max(2000).optional(),
  demontagePrice: z.number().min(0).optional(),
  demontageInternalCost: z.number().min(0).nullable().optional(),
});

function buildQuickWarehouseMessage(args: {
  order: {
    id: string;
    readyByDate: Date;
    startDate: Date;
    endDate: Date;
    rentalStartPartOfDay?: RentalPartOfDay | null;
    rentalEndPartOfDay?: RentalPartOfDay | null;
    customerName: string;
    greenwichDisplayName: string;
    eventName?: string | null;
  };
  lines: Array<{ itemName: string; qty: number }>;
}): string {
  const ready = args.order.readyByDate.toLocaleDateString("ru-RU");
  const period = formatRentalPeriodRangeFromUtcDatesRu({
    startDate: args.order.startDate,
    endDate: args.order.endDate,
    rentalStartPartOfDay: args.order.rentalStartPartOfDay,
    rentalEndPartOfDay: args.order.rentalEndPartOfDay,
  });
  const eventBlock = args.order.eventName ? `\n📌 ${escapeTelegramHtml(args.order.eventName)}` : "";
  const linesBlock =
    args.lines.length > 0
      ? `\n\n📦 Позиции:\n${args.lines
          .map((l) => `• ${escapeTelegramHtml(l.itemName)} — ${l.qty} шт.`)
          .join("\n")}`
      : "";

  const site = process.env.NEXT_PUBLIC_APP_URL || "https://wowstorg.example.com";
  const link = `<a href="${site}/orders/${args.order.id}">Открыть заявку</a>`;

  return (
    `🚨 <b>СРОЧНО!! ПРИШЛА БЫСТРАЯ ЗАЯВКА</b>\n\n` +
    `👤 ${escapeTelegramHtml(args.order.customerName)} · ${escapeTelegramHtml(args.order.greenwichDisplayName)}\n` +
    `📅 Готовность: ${escapeTelegramHtml(ready)} · Период: ${escapeTelegramHtml(period)}` +
    eventBlock +
    linesBlock +
    `\n\n${link}`
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: parentOrderId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());
  try {
    assertEnabledServicePricesPresent(parsed.data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const match = /^MISSING_SERVICE_PRICES:(.+)$/.exec(message);
    if (match) {
      return jsonError(400, `Укажите цену для включённых доп. услуг: ${match[1].split(",").filter(Boolean).join(", ")}`);
    }
    return jsonError(400, "Invalid input");
  }

  let created: { id: string };
  try {
    created = await prisma.$transaction(
      async (tx) => {
        const parent = await tx.order.findUnique({
          where: { id: parentOrderId },
          select: {
            id: true,
            status: true,
            customerId: true,
            eventName: true,
            comment: true,
            customer: { select: { name: true } },
            greenwichUserId: true,
            readyByDate: true,
            startDate: true,
            endDate: true,
            rentalStartPartOfDay: true,
            rentalEndPartOfDay: true,
            payMultiplier: true,
          },
        });

        if (!parent) throw new Error("NOT_FOUND");
        if (parent.status !== "ISSUED") throw new Error("NOT_ISSUED");
        if (!parent.greenwichUserId) throw new Error("NO_GREENWICH");

        const quickRow = await tx.$queryRaw<Array<{ parentOrderId: string | null }>>`
          SELECT "parentOrderId"
          FROM "Order"
          WHERE "id" = ${parentOrderId}
          LIMIT 1
        `;
        if (quickRow?.[0]?.parentOrderId) {
          throw new Error("NOT_MAIN");
        }

        const itemIds = [...new Set(parsed.data.lines.map((l) => l.itemId))];
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
        if (items.length !== itemIds.length) throw new Error("ITEM_NOT_FOUND");

        const itemById = new Map(items.map((i) => [i.id, i]));
        const reservedByItemId = await getReservedQtyByItemId({
          db: tx,
          startDate: parent.startDate,
          endDate: parent.endDate,
        });

        const requestedTotalByItemId = new Map<string, number>();
        for (const l of parsed.data.lines) {
          requestedTotalByItemId.set(l.itemId, (requestedTotalByItemId.get(l.itemId) ?? 0) + l.qty);
        }

        for (const [itemId, requestedTotal] of requestedTotalByItemId) {
          const item = itemById.get(itemId);
          if (!item) throw new Error("ITEM_NOT_FOUND");
          const availableTotal = Math.max(0, item.total - item.inRepair - item.broken - item.missing);
          const reservedQty = reservedByItemId.get(itemId) ?? 0;
          const availableForDates = Math.max(0, availableTotal - reservedQty);
          if (requestedTotal > availableForDates) {
            throw new Error(`AVAILABILITY:${item.name}:${availableForDates}:${requestedTotal}`);
          }
        }

        const createdOrder = await tx.order.create({
          data: {
            source: "GREENWICH_INTERNAL",
            status: "PICKING",
            createdById: auth.user.id,
            greenwichUserId: parent.greenwichUserId,
            customerId: parent.customerId,
            eventName: parent.eventName,
            comment: parent.comment,
            readyByDate: parent.readyByDate,
            startDate: parent.startDate,
            endDate: parent.endDate,
            rentalStartPartOfDay: parent.rentalStartPartOfDay,
            rentalEndPartOfDay: parent.rentalEndPartOfDay,
            payMultiplier: parent.payMultiplier,
            deliveryEnabled: parsed.data.deliveryEnabled ?? false,
            deliveryComment: parsed.data.deliveryEnabled ? parsed.data.deliveryComment?.trim() || null : null,
            deliveryPrice: parsed.data.deliveryEnabled ? parsed.data.deliveryPrice : undefined,
            deliveryInternalCost: parsed.data.deliveryEnabled ? parsed.data.deliveryInternalCost : null,
            montageEnabled: parsed.data.montageEnabled ?? false,
            montageComment: parsed.data.montageEnabled ? parsed.data.montageComment?.trim() || null : null,
            montagePrice: parsed.data.montageEnabled ? parsed.data.montagePrice : undefined,
            montageInternalCost: parsed.data.montageEnabled ? parsed.data.montageInternalCost : null,
            demontageEnabled: parsed.data.demontageEnabled ?? false,
            demontageComment: parsed.data.demontageEnabled ? parsed.data.demontageComment?.trim() || null : null,
            demontagePrice: parsed.data.demontageEnabled ? parsed.data.demontagePrice : undefined,
            demontageInternalCost: parsed.data.demontageEnabled ? parsed.data.demontageInternalCost : null,
            lines: {
              create: parsed.data.lines.map((l, idx) => {
                const item = itemById.get(l.itemId)!;
                return {
                  itemId: l.itemId,
                  requestedQty: l.qty,
                  position: idx,
                  pricePerDaySnapshot: item.pricePerDay,
                  warehouseComment: null,
                };
              }),
            },
          },
          select: { id: true },
        });

        await tx.$executeRaw`
          UPDATE "Order"
          SET "parentOrderId" = ${parentOrderId}
          WHERE "id" = ${createdOrder.id}
        `;

        return createdOrder;
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
      if (e.message === "NOT_FOUND") return jsonError(404, "Parent order not found");
      if (e.message === "NOT_ISSUED") return jsonError(400, "Quick supplement can be created only for ISSUED orders");
      if (e.message === "NO_GREENWICH") return jsonError(400, "Parent must have assigned Grinvich employee");
      if (e.message === "NOT_MAIN") return jsonError(400, "Quick supplement can be created only for main orders");
      if (e.message === "ITEM_NOT_FOUND") return jsonError(400, "One or more items not found");
      const m = /^AVAILABILITY:(.+):(\d+):(\d+)$/.exec(e.message);
      if (m) {
        return jsonError(
          400,
          `«${m[1]}»: доступно ${m[2]} шт. на выбранные даты, запрошено ${m[3]}`,
        );
      }
    }
    console.error("[quick-supplement/warehouse]", e);
    return jsonError(500, e instanceof Error ? e.message : "Ошибка");
  }

  if (isTelegramConfigured()) {
    const warehouseChatId = getWarehouseChatId();
    if (warehouseChatId) {
      const warehouseTopicId = getWarehouseTopicId();
      const createdOrder = await prisma.order.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          readyByDate: true,
          startDate: true,
          endDate: true,
          rentalStartPartOfDay: true,
          rentalEndPartOfDay: true,
          customer: { select: { name: true } },
          greenwichUser: { select: { displayName: true } },
          eventName: true,
          lines: {
            orderBy: [{ position: "asc" }],
            select: { requestedQty: true, item: { select: { name: true } } },
          },
        },
      });

      if (createdOrder && createdOrder.greenwichUser) {
        const msg = buildQuickWarehouseMessage({
          order: {
            id: createdOrder.id,
            readyByDate: createdOrder.readyByDate,
            startDate: createdOrder.startDate,
            endDate: createdOrder.endDate,
            rentalStartPartOfDay: createdOrder.rentalStartPartOfDay,
            rentalEndPartOfDay: createdOrder.rentalEndPartOfDay,
            customerName: createdOrder.customer.name,
            greenwichDisplayName: createdOrder.greenwichUser.displayName,
            eventName: createdOrder.eventName,
          },
          lines: createdOrder.lines.map((l) => ({ itemName: l.item.name, qty: l.requestedQty })),
        });

        const threadId = warehouseTopicId ? parseInt(warehouseTopicId, 10) : undefined;
        scheduleAfterResponse("quick-supplement-warehouse-telegram", async () => {
          await sendTelegramMessage(warehouseChatId, msg, {
            messageThreadId: threadId,
          });
        });
      }
    }
  }

  return jsonOk({ orderId: created.id });
}

