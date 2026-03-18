import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const losses = await prisma.lossRecord.findMany({
    where: { status: "OPEN" },
    orderBy: [{ createdAt: "desc" }],
    include: {
      item: { select: { id: true, name: true } },
      order: { select: { id: true, customer: { select: { name: true } } } },
    },
  });

  return jsonOk({
    losses: losses
      .map((l) => ({
        id: l.id,
        qty: l.qty,
        foundQty: l.foundQty,
        writtenOffQty: l.writtenOffQty,
        remainingQty: Math.max(0, l.qty - l.foundQty - l.writtenOffQty),
        notes: l.notes,
        createdAt: l.createdAt,
        item: { id: l.item.id, name: l.item.name },
        order: l.order ? { id: l.order.id, customerName: l.order.customer.name } : null,
        orderLineId: l.orderLineId,
      }))
      .filter((l) => l.remainingQty > 0),
  });
}

