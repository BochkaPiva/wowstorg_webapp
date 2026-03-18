import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";

const ARCHIVE_STATUSES = ["CLOSED", "CANCELLED"] as const;

export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const orders = await prisma.order.findMany({
    where: { status: { in: [...ARCHIVE_STATUSES] } },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      source: true,
      readyByDate: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, name: true } },
      greenwichUser: { select: { id: true, displayName: true } },
    },
  });

  return jsonOk({ orders });
}

