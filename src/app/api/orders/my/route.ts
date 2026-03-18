import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

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
        readyByDate: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        payMultiplier: true,
        deliveryPrice: true,
        montagePrice: true,
        demontagePrice: true,
        customer: { select: { id: true, name: true } },
        lines: {
          select: { requestedQty: true, pricePerDaySnapshot: true },
        },
      },
      take: 200,
    });
    function daysBetween(start: Date, end: Date): number {
      const ms = end.getTime() - start.getTime();
      const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
      return days === 0 ? 1 : days;
    }
    const withTotal = orders.map((o) => {
      const days = daysBetween(o.startDate, o.endDate);
      const multiplier = o.payMultiplier != null ? Number(o.payMultiplier) : 1;
      const rental = o.lines.reduce(
        (sum, l) =>
          sum +
          (l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0) *
            l.requestedQty *
            days *
            multiplier,
        0,
      );
      const services =
        (o.deliveryPrice != null ? Number(o.deliveryPrice) : 0) +
        (o.montagePrice != null ? Number(o.montagePrice) : 0) +
        (o.demontagePrice != null ? Number(o.demontagePrice) : 0);
      return {
        id: o.id,
        status: o.status,
        source: o.source,
        readyByDate: o.readyByDate.toISOString().slice(0, 10),
        startDate: o.startDate.toISOString().slice(0, 10),
        endDate: o.endDate.toISOString().slice(0, 10),
        createdAt: o.createdAt.toISOString(),
        customer: o.customer,
        totalAmount: Math.round(rental + services),
      };
    });
    return jsonOk({ orders: withTotal });
  }

  // WOWSTORG: пока оставим отдельный эндпоинт warehouse/queue
  return jsonOk({ orders: [] });
}

