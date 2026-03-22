import { Prisma } from "@prisma/client";
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
      greenwichUser: {
        select: {
          id: true,
          displayName: true,
          greenwichRating: { select: { score: true } },
        },
      },
    },
  });

  const serialized = orders.map((o) => ({
    id: o.id,
    parentOrderId: null as string | null,
    status: o.status,
    source: o.source,
    readyByDate: o.readyByDate.toISOString(),
    startDate: o.startDate.toISOString(),
    endDate: o.endDate.toISOString(),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    customer: o.customer,
    greenwichUser: o.greenwichUser
      ? {
          id: o.greenwichUser.id,
          displayName: o.greenwichUser.displayName,
          ratingScore: o.greenwichUser.greenwichRating?.score ?? 100,
        }
      : null,
  }));

  const ids = serialized.map((o) => o.id);
  if (ids.length > 0) {
    const quickRows = await prisma.$queryRaw<Array<{ id: string; parentOrderId: string | null }>>`
      SELECT "id", "parentOrderId"
      FROM "Order"
      WHERE "id" IN (${Prisma.join(ids)})
    `;
    const parentById = new Map(quickRows.map((r) => [r.id, r.parentOrderId]));
    for (const row of serialized) {
      row.parentOrderId = parentById.get(row.id) ?? null;
    }
  }

  return jsonOk({
    orders: serialized,
  });
}

