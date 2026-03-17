import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { id: true, name: true, type: true } } },
      },
    },
  });

  if (!order) return jsonError(404, "Not found");

  if (auth.user.role === "GREENWICH" && order.greenwichUserId !== auth.user.id) {
    return jsonError(403, "Forbidden");
  }

  return jsonOk({ order });
}

