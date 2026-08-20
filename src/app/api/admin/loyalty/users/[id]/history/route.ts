import { z } from "zod";

import { requireRole } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import { effectiveRatingEventDelta, recomputeGreenwichRatingScore } from "@/server/ratings/greenwich-rating";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
});

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const query = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) return jsonError(400, "Некорректные параметры истории", query.error.flatten());

  const { id } = await ctx.params;
  const user = await prisma.user.findFirst({
    where: { id, role: "GREENWICH" },
    select: { id: true, displayName: true, login: true, isActive: true },
  });
  if (!user) return jsonError(404, "Сотрудник Grinvich не найден");

  const now = new Date();
  const score = await prisma.$transaction((tx) => recomputeGreenwichRatingScore(tx, user.id, now));
  const skip = (query.data.page - 1) * query.data.pageSize;
  const [total, events] = await Promise.all([
    prisma.greenwichRatingEvent.count({ where: { userId: user.id } }),
    prisma.greenwichRatingEvent.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: query.data.pageSize,
      select: {
        id: true,
        type: true,
        delta: true,
        reason: true,
        recoveryStartsAt: true,
        recoveryEndsAt: true,
        createdAt: true,
        order: { select: { id: true, eventName: true, customer: { select: { name: true } } } },
      },
    }),
  ]);

  return jsonOk({
    user: { ...user, score },
    events: events.map((event) => ({
      ...event,
      effectiveDelta: effectiveRatingEventDelta(event, now),
    })),
    pagination: {
      page: query.data.page,
      pageSize: query.data.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.data.pageSize)),
    },
  });
}
