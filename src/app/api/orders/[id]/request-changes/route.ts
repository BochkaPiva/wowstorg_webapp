import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("GREENWICH");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, greenwichUserId: true },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.greenwichUserId !== auth.user.id) {
    return jsonError(403, "Запросить правки может только сотрудник Grinvich, на которого оформлена заявка");
  }
  if (order.status !== "ESTIMATE_SENT" && order.status !== "CHANGES_REQUESTED") {
    return jsonError(
      400,
      "Запросить правки можно только после отправки сметы складом (статус «Смета отправлена»)",
    );
  }

  await prisma.order.update({
    where: { id },
    data: { status: "CHANGES_REQUESTED" },
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
    const { notifyChangesRequested } = await import("@/server/notifications/order-notifications");
    void notifyChangesRequested(fullOrder as Parameters<typeof notifyChangesRequested>[0]).catch((e) =>
      console.error("[request-changes] notifyChangesRequested failed:", e),
    );
  }

  return jsonOk({ ok: true });
}
