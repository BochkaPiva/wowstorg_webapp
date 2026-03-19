import { z } from "zod";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { DateOnlySchema, parseDateOnlyToUtcMidnight } from "@/server/dates";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";

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
  const hasCustomerId = Boolean(data.customerId?.trim());
  const hasCustomerName = Boolean(data.customerName?.trim());
  if (!hasCustomerId && !hasCustomerName) {
    return jsonError(400, "Укажите заказчика (выберите из списка или введите название)");
  }
  const readyByDate = parseDateOnlyToUtcMidnight(data.readyByDate);
  const startDate = parseDateOnlyToUtcMidnight(data.startDate);
  const endDate = parseDateOnlyToUtcMidnight(data.endDate);

  if (!(readyByDate.getTime() <= startDate.getTime())) {
    return jsonError(400, "readyByDate must be <= startDate");
  }
  if (!(startDate.getTime() < endDate.getTime())) {
    return jsonError(400, "startDate must be < endDate");
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

  const isWarehouse = auth.user.role === "WOWSTORG";
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

  const result = await prisma.$transaction(async (tx) => {
    let customerIdToUse: string;
    if (hasCustomerName) {
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

    return order;
  });

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
  if (createdOrder) {
    const { notifyOrderCreated } = await import("@/server/notifications/order-notifications");
    void notifyOrderCreated(createdOrder as Parameters<typeof notifyOrderCreated>[0]).catch((e) =>
      console.error("[orders] notifyOrderCreated failed:", e),
    );
  }

  return jsonOk({ orderId: result.id });
}

