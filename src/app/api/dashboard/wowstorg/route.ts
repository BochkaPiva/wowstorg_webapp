import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";
import { getOrSetRuntimeCache } from "@/server/runtime-cache";
import { calcOrderPricing } from "@/server/orders/order-pricing";

const ACTIVE_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
] as const;

const OMSK_TZ = "Asia/Omsk";

function getOmskTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function computeBaseAvailableNow(p: { total: number; inRepair: number; broken: number; missing: number }): number {
  return Math.max(0, p.total - p.inRepair - p.broken - p.missing);
}

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;
  const data = await getOrSetRuntimeCache("dash:wowstorg", 12_000, async () => {
    const [activeCount, completedCount, nearestOrder, activeOrdersRaw, catalogAgg, catalogItems, warehouseItems, inRentOrders] = await Promise.all([
    prisma.order.count({
      where: { status: { in: [...ACTIVE_STATUSES] } },
    }),
    prisma.order.count({
      where: { status: "CLOSED" },
    }),
    prisma.order.findFirst({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      orderBy: [{ readyByDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        customer: { select: { name: true } },
        readyByDate: true,
        startDate: true,
        endDate: true,
        payMultiplier: true,
        deliveryPrice: true,
        montagePrice: true,
        demontagePrice: true,
        rentalDiscountType: true,
        rentalDiscountPercent: true,
        rentalDiscountAmount: true,
        greenwichUser: {
          select: {
            displayName: true,
            greenwichRating: { select: { score: true } },
          },
        },
        lines: { select: { requestedQty: true, pricePerDaySnapshot: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      orderBy: [{ readyByDate: "asc" }, { createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        status: true,
        customer: { select: { name: true } },
        readyByDate: true,
        startDate: true,
        endDate: true,
        payMultiplier: true,
        deliveryPrice: true,
        montagePrice: true,
        demontagePrice: true,
        rentalDiscountType: true,
        rentalDiscountPercent: true,
        rentalDiscountAmount: true,
        greenwichUser: {
          select: {
            displayName: true,
            greenwichRating: { select: { score: true } },
          },
        },
        lines: { select: { requestedQty: true, pricePerDaySnapshot: true } },
      },
    }),
    prisma.item.aggregate({
      where: { internalOnly: false, isActive: true },
      _sum: { broken: true, missing: true, inRepair: true },
    }),
    prisma.item.findMany({
      where: { internalOnly: false, isActive: true },
      select: { id: true, name: true, total: true, inRepair: true, broken: true, missing: true },
    }),
    prisma.item.findMany({
      where: { internalOnly: true, isActive: true },
      select: { id: true, name: true, total: true, inRepair: true, broken: true, missing: true },
    }),
    prisma.order.findMany({
      where: { status: { in: ["ISSUED", "RETURN_DECLARED"] } },
      select: {
        endDate: true,
        lines: { select: { itemId: true, issuedQty: true, requestedQty: true } },
      },
    }),
    ]);

    const omskTodayYmd = getOmskTodayYmd();
    const todayUtc = parseDateOnlyToUtcMidnight(omskTodayYmd);
    const reservedByItemId = await getReservedQtyByItemId({
      db: prisma,
      startDate: todayUtc,
      endDate: todayUtc,
    });

    const catalogPositions = catalogItems.map((it) => {
    const baseAvailable = computeBaseAvailableNow(it);
    const reserved = reservedByItemId.get(it.id) ?? 0;
    const availableNow = Math.max(0, baseAvailable - reserved);
    return { ...it, baseAvailable, reserved, availableNow };
  });

    const positionsInStockCount = catalogPositions.filter((p) => p.availableNow > 0).length;

    const warehousePositions = warehouseItems.map((it) => {
    const baseAvailable = computeBaseAvailableNow(it);
    const reserved = reservedByItemId.get(it.id) ?? 0;
    const availableNow = Math.max(0, baseAvailable - reserved);
    return { ...it, baseAvailable, reserved, availableNow };
  });

    const endedPositions = warehousePositions
      .filter((p) => p.availableNow === 0)
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));

    const rentedItemIds = new Set<string>();
    let rentedUnitsTotal = 0;
    let nearestReleaseDate: string | null = null;
    for (const o of inRentOrders) {
    const endYmd = o.endDate.toISOString().slice(0, 10);
    if (nearestReleaseDate == null || endYmd < nearestReleaseDate) nearestReleaseDate = endYmd;
    for (const l of o.lines) {
      const qty = l.issuedQty ?? l.requestedQty;
      if (qty <= 0) continue;
      rentedItemIds.add(l.itemId);
      rentedUnitsTotal += qty;
    }
    }

    let nearestParentId: string | null = null;
    if (nearestOrder) {
    const quickRow = await prisma.$queryRaw<Array<{ parentOrderId: string | null }>>`
      SELECT "parentOrderId" FROM "Order" WHERE "id" = ${nearestOrder.id} LIMIT 1
    `;
    nearestParentId = quickRow?.[0]?.parentOrderId ?? null;
    }

    const activeOrderIds = activeOrdersRaw.map((o) => o.id);
    let activeParentById = new Map<string, string | null>();
    if (activeOrderIds.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ id: string; parentOrderId: string | null }>>`
      SELECT "id", "parentOrderId"
      FROM "Order"
      WHERE "id" IN (${Prisma.join(activeOrderIds)})
    `;
    activeParentById = new Map(rows.map((r) => [r.id, r.parentOrderId]));
    }

    const activeOrders = activeOrdersRaw.map((o) => ({
    id: o.id,
    status: o.status,
    parentOrderId: activeParentById.get(o.id) ?? null,
    customerName: o.customer.name,
    greenwichUser:
      o.greenwichUser != null
        ? {
            displayName: o.greenwichUser.displayName,
            ratingScore: o.greenwichUser.greenwichRating?.score ?? 100,
          }
        : null,
    readyByDate: o.readyByDate.toISOString().slice(0, 10),
    startDate: o.startDate.toISOString().slice(0, 10),
    endDate: o.endDate.toISOString().slice(0, 10),
    totalAmount: calcOrderPricing({
      startDate: o.startDate,
      endDate: o.endDate,
      payMultiplier: o.payMultiplier,
      deliveryPrice: o.deliveryPrice,
      montagePrice: o.montagePrice,
      demontagePrice: o.demontagePrice,
      lines: o.lines,
      discount: o,
    }).grandTotal,
    }));

    const nearest = nearestOrder
      ? {
        id: nearestOrder.id,
        status: nearestOrder.status,
        parentOrderId: nearestParentId,
        customerName: nearestOrder.customer.name,
        greenwichUser:
          nearestOrder.greenwichUser != null
            ? {
                displayName: nearestOrder.greenwichUser.displayName,
                ratingScore: nearestOrder.greenwichUser.greenwichRating?.score ?? 100,
              }
            : null,
        readyByDate: nearestOrder.readyByDate.toISOString().slice(0, 10),
        startDate: nearestOrder.startDate.toISOString().slice(0, 10),
        endDate: nearestOrder.endDate.toISOString().slice(0, 10),
          totalAmount: calcOrderPricing({
          startDate: nearestOrder.startDate,
          endDate: nearestOrder.endDate,
            payMultiplier: nearestOrder.payMultiplier,
            deliveryPrice: nearestOrder.deliveryPrice,
            montagePrice: nearestOrder.montagePrice,
            demontagePrice: nearestOrder.demontagePrice,
          lines: nearestOrder.lines,
            discount: nearestOrder,
          }).grandTotal,
        }
      : null;

    return {
      activeCount,
      completedCount,
      nearest,
      activeOrders,
      equipment: {
        brokenQty: catalogAgg._sum.broken ?? 0,
        lostQty: catalogAgg._sum.missing ?? 0,
        inRepairQty: catalogAgg._sum.inRepair ?? 0,
        positionsInStockCount,
        rentedPositionsCount: rentedItemIds.size,
        rentedUnitsTotal,
        nearestReleaseDate,
        endedPositions: endedPositions.map((p) => ({
          id: p.id,
          name: p.name,
        })),
      },
    };
  });
  return jsonOk(data);
}

