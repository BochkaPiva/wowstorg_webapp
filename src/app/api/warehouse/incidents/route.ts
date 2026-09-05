import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const QuerySchema = z.object({
  condition: z.enum(["NEEDS_REPAIR", "BROKEN"]).optional(),
  status: z.enum(["OPEN", "CLOSED"]).default("OPEN"),
});

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    condition: url.searchParams.get("condition") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "Invalid query");

  const incidents = await prisma.incident.findMany({
    where: {
      status: parsed.data.status,
      ...(parsed.data.condition ? { condition: parsed.data.condition } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      order: { select: { id: true, eventName: true, createdBy: { select: { displayName: true } }, customer: { select: { name: true } } } },
      orderLine: { select: { id: true, itemId: true, item: { select: { name: true } } } },
    },
  });

  return jsonOk({
    incidents: incidents
      .map((i) => ({
        id: i.id,
        condition: i.condition,
        qty: i.qty,
        repairedQty: i.repairedQty,
        utilizedQty: i.utilizedQty,
        remainingQty: Math.max(0, i.qty - i.repairedQty - i.utilizedQty),
        comment: i.comment,
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
        order: i.order ? { id: i.order.id, customerName: i.order.customer.name, eventName: i.order.eventName, employeeName: i.order.createdBy.displayName } : null,
        item: i.orderLine?.item ? { id: i.orderLine.itemId, name: i.orderLine.item.name } : null,
        orderLineId: i.orderLineId,
      }))
      .filter((i) => parsed.data.status === "CLOSED" || i.remainingQty > 0),
  });
}

