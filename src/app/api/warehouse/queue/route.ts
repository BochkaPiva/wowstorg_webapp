import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

const QUEUE_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
] as const;

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const orders = await prisma.order.findMany({
    where: { status: { in: [...QUEUE_STATUSES] } },
    orderBy: [{ readyByDate: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      source: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      warehouseInternalNote: true,
      payMultiplier: true,
      deliveryPrice: true,
      montagePrice: true,
      demontagePrice: true,
      customer: { select: { id: true, name: true } },
      greenwichUser: { select: { id: true, displayName: true } },
      lines: {
        select: { requestedQty: true, pricePerDaySnapshot: true },
      },
    },
  });

  function daysBetween(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
    return days === 0 ? 1 : days;
  }

  const serialized = orders.map((o) => {
    const startStr = o.startDate.toISOString().slice(0, 10);
    const endStr = o.endDate.toISOString().slice(0, 10);
    const days = daysBetween(o.startDate, o.endDate);
    const multiplier = o.payMultiplier != null ? Number(o.payMultiplier) : 1;
    const rental = o.lines.reduce(
      (sum, l) => sum + (l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0) * l.requestedQty * days * multiplier,
      0,
    );
    const services =
      (o.deliveryPrice != null ? Number(o.deliveryPrice) : 0) +
      (o.montagePrice != null ? Number(o.montagePrice) : 0) +
      (o.demontagePrice != null ? Number(o.demontagePrice) : 0);
    const totalAmount = Math.round(rental + services);
    return {
      id: o.id,
      status: o.status,
      source: o.source,
      readyByDate: o.readyByDate.toISOString().slice(0, 10),
      startDate: startStr,
      endDate: endStr,
      createdAt: o.createdAt.toISOString(),
      warehouseInternalNote: o.warehouseInternalNote ?? null,
      customer: o.customer,
      greenwichUser: o.greenwichUser,
      totalAmount,
    };
  });

  return jsonOk({ orders: serialized });
}

