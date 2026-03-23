import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { getReservedQtyByItemId } from "@/server/orders/reserve";
import { parseDateOnlyToUtcMidnight } from "@/server/dates";

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

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
}

function calcOrderTotalAmount(args: {
  startDate: Date;
  endDate: Date;
  payMultiplier: number | null;
  deliveryPrice: number | null;
  montagePrice: number | null;
  demontagePrice: number | null;
  lines: Array<{ requestedQty: number; pricePerDaySnapshot: unknown }>;
}): number {
  const days = daysBetween(args.startDate, args.endDate);
  const multiplier = args.payMultiplier ?? 1;
  const rental = args.lines.reduce((sum, l) => {
    const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
    return sum + price * l.requestedQty * days * multiplier;
  }, 0);
  const services =
    (args.deliveryPrice ?? 0) + (args.montagePrice ?? 0) + (args.demontagePrice ?? 0);
  return Math.round(rental + services);
}

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
    totalAmount: calcOrderTotalAmount({
      startDate: o.startDate,
      endDate: o.endDate,
      payMultiplier: o.payMultiplier != null ? Number(o.payMultiplier) : null,
      deliveryPrice: o.deliveryPrice != null ? Number(o.deliveryPrice) : null,
      montagePrice: o.montagePrice != null ? Number(o.montagePrice) : null,
      demontagePrice: o.demontagePrice != null ? Number(o.demontagePrice) : null,
      lines: o.lines,
    }),
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
        totalAmount: calcOrderTotalAmount({
          startDate: nearestOrder.startDate,
          endDate: nearestOrder.endDate,
          payMultiplier: nearestOrder.payMultiplier != null ? Number(nearestOrder.payMultiplier) : null,
          deliveryPrice: nearestOrder.deliveryPrice != null ? Number(nearestOrder.deliveryPrice) : null,
          montagePrice: nearestOrder.montagePrice != null ? Number(nearestOrder.montagePrice) : null,
          demontagePrice: nearestOrder.demontagePrice != null ? Number(nearestOrder.demontagePrice) : null,
          lines: nearestOrder.lines,
        }),
      }
    : null;

  return jsonOk({
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
  });
}

