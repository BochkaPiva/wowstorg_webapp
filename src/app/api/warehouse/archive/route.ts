import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const ARCHIVE_STATUSES = ["CLOSED", "CANCELLED"] as const;

const SORT_VALUES = [
  "updated_desc",
  "updated_asc",
  "readyBy_desc",
  "readyBy_asc",
  "created_desc",
  "created_asc",
  "startDate_desc",
  "startDate_asc",
] as const;

const SOURCE_VALUES = ["all", "GREENWICH_INTERNAL", "WOWSTORG_EXTERNAL"] as const;

const QuerySchema = z.object({
  sort: z.enum(SORT_VALUES).optional().default("updated_desc"),
  /** CLOSED | CANCELLED | all */
  status: z.enum(["all", "CLOSED", "CANCELLED"]).optional().default("all"),
  q: z.string().trim().max(120).optional(),
  source: z.enum(SOURCE_VALUES).optional().default("all"),
});

function orderByFromSort(sort: (typeof SORT_VALUES)[number]): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case "updated_asc":
      return [{ updatedAt: "asc" }];
    case "readyBy_desc":
      return [{ readyByDate: "desc" }, { updatedAt: "desc" }];
    case "readyBy_asc":
      return [{ readyByDate: "asc" }, { updatedAt: "desc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "startDate_desc":
      return [{ startDate: "desc" }, { updatedAt: "desc" }];
    case "startDate_asc":
      return [{ startDate: "asc" }, { updatedAt: "desc" }];
    case "updated_desc":
    default:
      return [{ updatedAt: "desc" }];
  }
}

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    sort: url.searchParams.get("sort") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Некорректные параметры запроса", parsed.error.flatten());
  }

  const { sort, status: statusFilter, q, source } = parsed.data;

  const statusIn =
    statusFilter === "all" ? [...ARCHIVE_STATUSES] : [statusFilter as "CLOSED" | "CANCELLED"];

  const searchWhere: Prisma.OrderWhereInput | undefined =
    q && q.length > 0
      ? {
          OR: [
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { greenwichUser: { displayName: { contains: q, mode: "insensitive" } } },
            { id: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined;

  const sourceWhere: Prisma.OrderWhereInput | undefined =
    source === "all"
      ? undefined
      : { source: source as "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL" };

  const where: Prisma.OrderWhereInput = {
    AND: [
      { status: { in: statusIn } },
      ...(sourceWhere ? [sourceWhere] : []),
      ...(searchWhere ? [searchWhere] : []),
    ],
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: orderByFromSort(sort),
    take: 500,
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
