import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const ACTIVE_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
] as const;

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

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH") {
    return jsonError(403, "Forbidden");
  }

  const userId = auth.user.id;

  const [activeCount, completedCount, nearestOrder] = await Promise.all([
    prisma.order.count({
      where: {
        greenwichUserId: userId,
        status: { in: [...ACTIVE_STATUSES] },
      },
    }),
    prisma.order.count({
      where: {
        greenwichUserId: userId,
        status: "CLOSED",
      },
    }),
    prisma.order.findFirst({
      where: {
        greenwichUserId: userId,
        status: { in: [...ACTIVE_STATUSES] },
      },
      orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        customer: { select: { name: true } },
        readyByDate: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        payMultiplier: true,
        deliveryPrice: true,
        montagePrice: true,
        demontagePrice: true,
        lines: { select: { requestedQty: true, pricePerDaySnapshot: true } },
      },
    }),
  ]);

  let nearestParentId: string | null = null;
  if (nearestOrder) {
    const quickRow = await prisma.$queryRaw<Array<{ parentOrderId: string | null }>>`
      SELECT "parentOrderId" FROM "Order" WHERE "id" = ${nearestOrder.id} LIMIT 1
    `;
    nearestParentId = quickRow?.[0]?.parentOrderId ?? null;
  }

  const nearest = nearestOrder
    ? {
        id: nearestOrder.id,
        status: nearestOrder.status,
        parentOrderId: nearestParentId,
        customerName: nearestOrder.customer.name,
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
  });
}

