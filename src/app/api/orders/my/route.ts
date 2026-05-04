import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { calcOrderPricing } from "@/server/orders/order-pricing";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (auth.user.role === "GREENWICH") {
    const orders = await prisma.order.findMany({
      where: { greenwichUserId: auth.user.id },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        source: true,
        eventName: true,
        readyByDate: true,
        startDate: true,
        endDate: true,
        rentalStartPartOfDay: true,
        rentalEndPartOfDay: true,
        createdAt: true,
        payMultiplier: true,
        deliveryPrice: true,
        montagePrice: true,
        demontagePrice: true,
        rentalDiscountType: true,
        rentalDiscountPercent: true,
        rentalDiscountAmount: true,
        customer: { select: { id: true, name: true } },
        lines: {
          select: { requestedQty: true, pricePerDaySnapshot: true },
        },
      },
      take: 200,
    });
    const withTotal = orders.map((o) => {
      const pricing = calcOrderPricing({
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
      });
      return {
        id: o.id,
        parentOrderId: null as string | null,
        status: o.status,
        source: o.source,
        eventName: o.eventName,
        readyByDate: o.readyByDate.toISOString().slice(0, 10),
        startDate: o.startDate.toISOString().slice(0, 10),
        endDate: o.endDate.toISOString().slice(0, 10),
        rentalStartPartOfDay: o.rentalStartPartOfDay,
        rentalEndPartOfDay: o.rentalEndPartOfDay,
        createdAt: o.createdAt.toISOString(),
        customer: o.customer,
        totalAmount: pricing.grandTotal,
        taxAmount: pricing.taxAmount,
        discount:
          pricing.discountAmount > 0
            ? {
                type: o.rentalDiscountType,
                percent: o.rentalDiscountPercent != null ? Number(o.rentalDiscountPercent) : null,
                amount: pricing.discountAmount,
              }
            : null,
      };
    });

    const ids = withTotal.map((o) => o.id);
    if (ids.length > 0) {
      const quickRows = await prisma.$queryRaw<Array<{ id: string; parentOrderId: string | null }>>`
        SELECT "id", "parentOrderId"
        FROM "Order"
        WHERE "id" IN (${Prisma.join(ids)})
      `;
      const parentById = new Map(quickRows.map((r) => [r.id, r.parentOrderId]));
      for (const row of withTotal) {
        row.parentOrderId = parentById.get(row.id) ?? null;
      }
    }

    return jsonOk({ orders: withTotal });
  }

  // WOWSTORG: пока оставим отдельный эндпоинт warehouse/queue
  return jsonOk({ orders: [] });
}

