import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
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

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH") {
    return jsonError(403, "Forbidden");
  }

  const userId = auth.user.id;
  const data = await getOrSetRuntimeCache(`dash:greenwich:${userId}`, 12_000, async () => {
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
        rentalDiscountType: true,
        rentalDiscountPercent: true,
        rentalDiscountAmount: true,
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
    };
  });
  return jsonOk(data);
}

