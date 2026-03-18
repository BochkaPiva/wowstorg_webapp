import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const d = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return d === 0 ? 1 : d;
}

/** Аналитика: топ реквизита по выдачам и по выручке, топ заказчиков. Только WOWSTORG. */
export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const closedOrders = await prisma.order.findMany({
    where: { status: "CLOSED" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      payMultiplier: true,
      deliveryPrice: true,
      montagePrice: true,
      demontagePrice: true,
      customerId: true,
      customer: { select: { name: true } },
      lines: {
        select: {
          itemId: true,
          item: { select: { name: true } },
          requestedQty: true,
          issuedQty: true,
          pricePerDaySnapshot: true,
        },
      },
    },
  });

  const itemIssued = new Map<string, number>();
  const itemRevenue = new Map<string, { name: string; revenue: number }>();
  const customerTotal = new Map<string, { name: string; total: number }>();

  for (const order of closedOrders) {
    const days = daysBetween(order.startDate, order.endDate);
    const mult = order.payMultiplier != null ? Number(order.payMultiplier) : 1;
    let orderRevenue = 0;

    for (const line of order.lines) {
      const price = line.pricePerDaySnapshot != null ? Number(line.pricePerDaySnapshot) : 0;
      const qty = line.issuedQty ?? line.requestedQty;
      const lineRevenue = price * line.requestedQty * days * mult;
      orderRevenue += lineRevenue;

      itemIssued.set(line.itemId, (itemIssued.get(line.itemId) ?? 0) + qty);
      const name = line.item.name;
      itemRevenue.set(line.itemId, {
        name,
        revenue: (itemRevenue.get(line.itemId)?.revenue ?? 0) + lineRevenue,
      });
    }

    const services =
      (order.deliveryPrice != null ? Number(order.deliveryPrice) : 0) +
      (order.montagePrice != null ? Number(order.montagePrice) : 0) +
      (order.demontagePrice != null ? Number(order.demontagePrice) : 0);
    orderRevenue = Math.round(orderRevenue + services);

    const cid = order.customerId;
    customerTotal.set(cid, {
      name: order.customer.name,
      total: (customerTotal.get(cid)?.total ?? 0) + orderRevenue,
    });
  }

  const topByIssued = [...itemIssued.entries()]
    .map(([itemId, qty]) => {
      const rev = itemRevenue.get(itemId);
      return { itemId, itemName: rev?.name ?? "—", issuedQty: qty };
    })
    .sort((a, b) => b.issuedQty - a.issuedQty)
    .slice(0, 20);

  const topByRevenue = [...itemRevenue.entries()]
    .map(([itemId, v]) => ({ itemId, itemName: v.name, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  const topCustomers = [...customerTotal.entries()]
    .map(([customerId, v]) => ({ customerId, customerName: v.name, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  return jsonOk({
    topByIssued,
    topByRevenue: topByRevenue.slice(0, 20),
    topCustomers,
  });
}
