import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!order) return jsonError(404, "Not found");
  if (order.status !== "APPROVED_BY_GREENWICH") {
    return jsonError(
      400,
      "Начать сборку можно только после согласования сметы Greenwich (статус «Согласована»)",
    );
  }

  await prisma.order.update({
    where: { id },
    data: { status: "PICKING" },
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
    const { notifyStartPicking } = await import("@/server/notifications/order-notifications");
    void notifyStartPicking(fullOrder as Parameters<typeof notifyStartPicking>[0]).catch((e) =>
      console.error("[start-picking] notifyStartPicking failed:", e),
    );
  }

  return jsonOk({ ok: true });
}
