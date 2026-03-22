import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import {
  escapeTelegramHtml,
  getWarehouseChatId,
  getWarehouseTopicId,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/server/telegram";

const LineSchema = z.object({
  itemId: z.string().trim().min(1),
  qty: z.number().int().positive().max(100000),
});

const BodySchema = z.object({
  lines: z.array(LineSchema).min(1).max(500),
});

function buildQuickWarehouseMessage(args: {
  order: {
    id: string;
    readyByDate: Date;
    startDate: Date;
    endDate: Date;
    customerName: string;
    greenwichDisplayName: string;
    eventName?: string | null;
  };
  lines: Array<{ itemName: string; qty: number }>;
}): string {
  const ready = args.order.readyByDate.toLocaleDateString("ru-RU");
  const start = args.order.startDate.toLocaleDateString("ru-RU");
  const end = args.order.endDate.toLocaleDateString("ru-RU");
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
    `📅 Готовность: ${escapeTelegramHtml(ready)} · Период: ${escapeTelegramHtml(start)} — ${escapeTelegramHtml(end)}` +
    eventBlock +
    linesBlock +
    `\n\n${link}`
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("GREENWICH");
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

  const parent = await prisma.order.findUnique({
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
      payMultiplier: true,
    },
  });

  if (!parent) return jsonError(404, "Parent order not found");
  if (parent.status !== "ISSUED") return jsonError(400, "Quick supplement can be created only for ISSUED orders");
  if (parent.greenwichUserId !== auth.user.id) return jsonError(403, "Forbidden");

  const quickRow = await prisma.$queryRaw<Array<{ parentOrderId: string | null }>>`
    SELECT "parentOrderId"
    FROM "Order"
    WHERE "id" = ${parentOrderId}
    LIMIT 1
  `;
  if (quickRow?.[0]?.parentOrderId) {
    return jsonError(400, "Quick supplement can be created only for main orders");
  }

  // Quick supplement MUST NOT use extra services — force disabled on creation.
  const disabledServices = {
    deliveryEnabled: false,
    montageEnabled: false,
    demontageEnabled: false,
    deliveryPrice: undefined,
    montagePrice: undefined,
    demontagePrice: undefined,
    deliveryComment: null,
    montageComment: null,
    demontageComment: null,
  } as const;

  const itemIds = [...new Set(parsed.data.lines.map((l) => l.itemId))];
  const items = await prisma.item.findMany({
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
  if (items.length !== itemIds.length) return jsonError(400, "One or more items not found");

  const itemById = new Map(items.map((i) => [i.id, i]));
  const reservedByItemId = await getReservedQtyByItemId({
    db: prisma,
    startDate: parent.startDate,
    endDate: parent.endDate,
  });

  const requestedTotalByItemId = new Map<string, number>();
  for (const l of parsed.data.lines) {
    requestedTotalByItemId.set(l.itemId, (requestedTotalByItemId.get(l.itemId) ?? 0) + l.qty);
  }

  for (const [itemId, requestedTotal] of requestedTotalByItemId) {
    const item = itemById.get(itemId);
    if (!item) return jsonError(400, "Item not found");
    const availableTotal = Math.max(0, item.total - item.inRepair - item.broken - item.missing);
    const reservedQty = reservedByItemId.get(itemId) ?? 0;
    const availableForDates = Math.max(0, availableTotal - reservedQty);
    if (requestedTotal > availableForDates) {
      return jsonError(400, `EXCEEDS_AVAILABILITY:${item.id}:${availableForDates}`);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        source: "GREENWICH_INTERNAL",
        status: "APPROVED_BY_GREENWICH",
        createdById: auth.user.id,
        greenwichUserId: auth.user.id,
        customerId: parent.customerId,
        eventName: parent.eventName,
        comment: parent.comment,
        readyByDate: parent.readyByDate,
        startDate: parent.startDate,
        endDate: parent.endDate,
        payMultiplier: parent.payMultiplier,
        deliveryEnabled: disabledServices.deliveryEnabled,
        montageEnabled: disabledServices.montageEnabled,
        demontageEnabled: disabledServices.demontageEnabled,
        lines: {
          create: parsed.data.lines.map((l, idx) => {
            const item = itemById.get(l.itemId)!;
            return {
              itemId: l.itemId,
              requestedQty: l.qty,
              position: idx,
              pricePerDaySnapshot: item.pricePerDay,
              greenwichComment: null,
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
  });

  // Notify warehouse (best-effort).
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
          customer: { select: { name: true } },
          greenwichUser: { select: { displayName: true } },
          eventName: true,
          lines: { orderBy: [{ position: "asc" }], select: { requestedQty: true, item: { select: { name: true } } } },
        },
      });

      if (createdOrder && createdOrder.greenwichUser) {
        const msg = buildQuickWarehouseMessage({
          order: {
            id: createdOrder.id,
            readyByDate: createdOrder.readyByDate,
            startDate: createdOrder.startDate,
            endDate: createdOrder.endDate,
            customerName: createdOrder.customer.name,
            greenwichDisplayName: createdOrder.greenwichUser.displayName,
            eventName: createdOrder.eventName,
          },
          lines: createdOrder.lines.map((l) => ({ itemName: l.item.name, qty: l.requestedQty })),
        });

        await sendTelegramMessage(warehouseChatId, msg, {
          messageThreadId: warehouseTopicId ? parseInt(warehouseTopicId, 10) : undefined,
        });
      }
    }
  }

  return jsonOk({ orderId: created.id });
}

