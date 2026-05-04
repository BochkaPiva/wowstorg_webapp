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
const PROJECT_ATTENTION_BLOCK_KEY = "dashboard-attention";

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

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

async function getProjectAttention() {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      archivedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    orderBy: { updatedAt: "asc" },
    take: 80,
    select: {
      id: true,
      title: true,
      status: true,
      eventStartDate: true,
      eventDateConfirmed: true,
      updatedAt: true,
      orders: { select: { id: true }, take: 1 },
      estimateVersions: { where: { isPrimary: true }, select: { id: true }, take: 1 },
      notificationCooldowns: {
        where: { blockKey: PROJECT_ATTENTION_BLOCK_KEY, muteUntil: { gt: now } },
        select: { muteUntil: true },
        take: 1,
      },
    },
  });

  return projects
    .flatMap((project) => {
      if (project.notificationCooldowns.length > 0) return [];
      const hasPrimaryEstimate = project.estimateVersions.length > 0;
      const hasLinkedOrder = project.orders.length > 0;
      const hasFutureDate =
        project.eventStartDate != null && project.eventStartDate.getTime() >= new Date(now.toISOString().slice(0, 10)).getTime();
      const readyToWait =
        project.status === "READY_TO_RUN" &&
        project.eventDateConfirmed &&
        hasFutureDate &&
        hasPrimaryEstimate &&
        hasLinkedOrder;

      const inactivityDays = daysSince(project.updatedAt, now);
      const reasons: string[] = [];
      let severity: "warning" | "critical" = "warning";

      if (!hasPrimaryEstimate) reasons.push("Нет основной сметы");
      if (!hasLinkedOrder) reasons.push("Нет связанной заявки");
      if (!project.eventDateConfirmed) reasons.push("Дата не подтверждена");
      if (!readyToWait && inactivityDays >= 14) {
        reasons.push("Нет активности 14+ дней");
        severity = "critical";
      } else if (!readyToWait && inactivityDays >= 7) {
        reasons.push("Нет активности 7+ дней");
      }

      if (reasons.length === 0) return [];
      return [
        {
          projectId: project.id,
          title: project.title,
          status: project.status,
          severity,
          reasons,
          primaryReason: reasons[0],
          daysSinceActivity: inactivityDays,
        },
      ];
    })
    .sort((a, b) => (a.severity === b.severity ? b.daysSinceActivity - a.daysSinceActivity : a.severity === "critical" ? -1 : 1))
    .slice(0, 6);
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
        rentalStartPartOfDay: true,
        rentalEndPartOfDay: true,
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
        rentalStartPartOfDay: true,
        rentalEndPartOfDay: true,
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
    rentalStartPartOfDay: o.rentalStartPartOfDay,
    rentalEndPartOfDay: o.rentalEndPartOfDay,
    totalAmount: calcOrderPricing({
      startDate: o.startDate,
      endDate: o.endDate,
      rentalStartPartOfDay: o.rentalStartPartOfDay,
      rentalEndPartOfDay: o.rentalEndPartOfDay,
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
        rentalStartPartOfDay: nearestOrder.rentalStartPartOfDay,
        rentalEndPartOfDay: nearestOrder.rentalEndPartOfDay,
          totalAmount: calcOrderPricing({
          startDate: nearestOrder.startDate,
          endDate: nearestOrder.endDate,
            rentalStartPartOfDay: nearestOrder.rentalStartPartOfDay,
            rentalEndPartOfDay: nearestOrder.rentalEndPartOfDay,
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
  const projectAttention = await getProjectAttention();
  return jsonOk({ ...data, projectAttention });
}

