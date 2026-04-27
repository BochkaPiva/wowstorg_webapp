import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { calcOrderPricing } from "@/server/orders/order-pricing";

const QUEUE_STATUSES = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
] as const;

type QueueStatus = (typeof QUEUE_STATUSES)[number];

const SORT_VALUES = [
  "smart",
  "readyBy_asc",
  "readyBy_desc",
  "created_desc",
  "created_asc",
  "startDate_asc",
  "startDate_desc",
] as const;

const SOURCE_VALUES = ["all", "GREENWICH_INTERNAL", "WOWSTORG_EXTERNAL"] as const;

const QuerySchema = z.object({
  sort: z.enum(SORT_VALUES).optional().default("readyBy_asc"),
  /** Список статусов через запятую; пусто = все статусы очереди */
  status: z.string().max(500).optional(),
  q: z.string().trim().max(120).optional(),
  source: z.enum(SOURCE_VALUES).optional().default("all"),
});

/** Приоритет для режима smart (как на странице «Мои заявки»). */
const STATUS_PRIORITY: Record<string, number> = {
  ISSUED: 0,
  RETURN_DECLARED: 1,
  PICKING: 2,
  APPROVED_BY_GREENWICH: 3,
  CHANGES_REQUESTED: 4,
  ESTIMATE_SENT: 5,
  SUBMITTED: 6,
};

function parseStatusFilter(raw: string | undefined): QueueStatus[] {
  if (!raw?.trim()) return [...QUEUE_STATUSES];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = new Set<string>(QUEUE_STATUSES);
  const picked = parts.filter((p): p is QueueStatus => allowed.has(p));
  return picked.length > 0 ? picked : [...QUEUE_STATUSES];
}

function orderByFromSort(sort: (typeof SORT_VALUES)[number]): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case "smart":
      return [{ readyByDate: "asc" }, { createdAt: "desc" }];
    case "readyBy_desc":
      return [{ readyByDate: "desc" }, { createdAt: "desc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "startDate_asc":
      return [{ startDate: "asc" }, { readyByDate: "asc" }];
    case "startDate_desc":
      return [{ startDate: "desc" }, { readyByDate: "desc" }];
    case "readyBy_asc":
    default:
      return [{ readyByDate: "asc" }, { createdAt: "desc" }];
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

  const { sort, q, source } = parsed.data;
  const statusIn = parseStatusFilter(parsed.data.status);

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
      warehouseInternalNote: true,
      payMultiplier: true,
      deliveryPrice: true,
      montagePrice: true,
      demontagePrice: true,
      rentalDiscountType: true,
      rentalDiscountPercent: true,
      rentalDiscountAmount: true,
      project: { select: { id: true, title: true } },
      customer: { select: { id: true, name: true } },
      greenwichUser: {
        select: {
          id: true,
          displayName: true,
          greenwichRating: { select: { score: true } },
        },
      },
      lines: {
        select: { requestedQty: true, pricePerDaySnapshot: true },
      },
    },
  });

  const serialized = orders.map((o) => {
    const startStr = o.startDate.toISOString().slice(0, 10);
    const endStr = o.endDate.toISOString().slice(0, 10);
    const pricing = calcOrderPricing({
      startDate: o.startDate,
      endDate: o.endDate,
      payMultiplier: o.payMultiplier,
      deliveryPrice: o.deliveryPrice,
      montagePrice: o.montagePrice,
      demontagePrice: o.demontagePrice,
      lines: o.lines,
      discount: o,
    });
    const totalAmount = pricing.grandTotal;
    return {
      id: o.id,
      parentOrderId: null as string | null,
      status: o.status,
      source: o.source,
      readyByDate: o.readyByDate.toISOString().slice(0, 10),
      startDate: startStr,
      endDate: endStr,
      createdAt: o.createdAt.toISOString(),
      warehouseInternalNote: o.warehouseInternalNote ?? null,
      project: o.project,
      customer: o.customer,
      greenwichUser: o.greenwichUser
        ? {
            id: o.greenwichUser.id,
            displayName: o.greenwichUser.displayName,
            ratingScore: o.greenwichUser.greenwichRating?.score ?? 100,
          }
        : null,
      totalAmount,
      discount:
        pricing.discountAmount > 0
          ? {
              type: o.rentalDiscountType,
              percent: o.rentalDiscountPercent != null ? Number(o.rentalDiscountPercent) : null,
              amount: pricing.discountAmount,
            }
          : null,
    };
  });

  if (sort === "smart") {
    serialized.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      const ra = new Date(a.readyByDate).getTime();
      const rb = new Date(b.readyByDate).getTime();
      return ra - rb;
    });
  }

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

  return jsonOk({ orders: serialized });
}
