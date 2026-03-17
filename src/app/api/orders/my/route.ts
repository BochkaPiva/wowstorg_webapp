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
        customer: { select: { id: true, name: true } },
      },
      take: 200,
    });
    return jsonOk({ orders });
  }

  // WOWSTORG: пока оставим отдельный эндпоинт warehouse/queue
  return jsonOk({ orders: [] });
}

