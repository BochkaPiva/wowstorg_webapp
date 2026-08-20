import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(["newest", "oldest", "rating_asc", "rating_desc"]).default("newest"),
  q: z.string().trim().max(120).optional().default(""),
});

export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const query = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) return jsonError(400, "Некорректные параметры", query.error.flatten());
  const { page, pageSize, rating, sort, q } = query.data;

  const where: Prisma.OrderServiceFeedbackWhereInput = {
    ...(rating ? { rating } : {}),
    ...(q
      ? {
          OR: [
            { comment: { contains: q, mode: "insensitive" } },
            { author: { displayName: { contains: q, mode: "insensitive" } } },
            { order: { eventName: { contains: q, mode: "insensitive" } } },
            { order: { customer: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.OrderServiceFeedbackOrderByWithRelationInput[] = sort === "oldest"
    ? [{ updatedAt: "asc" }]
    : sort === "rating_asc"
      ? [{ rating: "asc" }, { updatedAt: "desc" }]
      : sort === "rating_desc"
        ? [{ rating: "desc" }, { updatedAt: "desc" }]
        : [{ updatedAt: "desc" }];

  const eligibleOrderWhere: Prisma.OrderWhereInput = {
    source: "GREENWICH_INTERNAL",
    status: "CLOSED",
    parentOrderId: null,
    greenwichUserId: { not: null },
  };

  const [eligibleOrders, summary, lowRatings, skipped, distribution, total, feedback] = await Promise.all([
    prisma.order.count({ where: eligibleOrderWhere }),
    prisma.orderServiceFeedback.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    prisma.orderServiceFeedback.count({ where: { rating: { lte: 3 } } }),
    prisma.order.count({
      where: {
        ...eligibleOrderWhere,
        serviceFeedbackPromptDismissedAt: { not: null },
        serviceFeedback: { is: null },
      },
    }),
    prisma.orderServiceFeedback.groupBy({ by: ["rating"], _count: { _all: true }, orderBy: { rating: "desc" } }),
    prisma.orderServiceFeedback.count({ where }),
    prisma.orderServiceFeedback.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, displayName: true, login: true } },
        order: {
          select: {
            id: true,
            eventName: true,
            closedAt: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const responseCount = summary._count._all;
  return jsonOk({
    summary: {
      averageRating: summary._avg.rating == null ? null : Math.round(summary._avg.rating * 100) / 100,
      responseCount,
      eligibleOrders,
      responseRate: eligibleOrders > 0 ? Math.round((responseCount / eligibleOrders) * 1000) / 10 : 0,
      lowRatings,
      skipped,
      distribution: [5, 4, 3, 2, 1].map((value) => ({
        rating: value,
        count: distribution.find((entry) => entry.rating === value)?._count._all ?? 0,
      })),
    },
    feedback,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}
