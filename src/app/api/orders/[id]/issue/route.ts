import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { lines: true },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.status !== "PICKING") {
    return jsonError(400, "Выдать можно только после начала сборки (статус «Сборка»)");
  }

  await prisma.$transaction(async (tx) => {
    for (const line of order.lines) {
      const qty = line.approvedQty ?? line.requestedQty;
      await tx.orderLine.update({
        where: { id: line.id },
        data: { issuedQty: qty },
      });
    }
    await tx.order.update({
      where: { id },
      data: { status: "ISSUED" },
    });
  });

  const fullOrder = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
  if (fullOrder) {
    type Fn = typeof import("@/server/notifications/order-notifications").notifyIssued;
    const payload = fullOrder as Parameters<Fn>[0];
    scheduleAfterResponse("notifyIssued", async () => {
      const { notifyIssued } = await import("@/server/notifications/order-notifications");
      await notifyIssued(payload);
    });
  }

  return jsonOk({ ok: true });
}
