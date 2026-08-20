import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getOrSetRuntimeCache } from "@/server/runtime-cache";
import {
  effectiveRatingEventDelta,
  getGreenwichRatingBenefit,
} from "@/server/ratings/greenwich-rating";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH") {
    return jsonError(403, "Доступно только для сотрудников Greenwich");
  }

  const data = await getOrSetRuntimeCache(`greenwich:rating:${auth.user.id}`, 15_000, async () => {
    const now = new Date();
    const benefit = await prisma.$transaction((tx) =>
      getGreenwichRatingBenefit(tx, auth.user.id, now),
    );
    const events = await prisma.greenwichRatingEvent.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        delta: true,
        reason: true,
        recoveryStartsAt: true,
        recoveryEndsAt: true,
        createdAt: true,
      },
    });
    const activeEventDelta = events.reduce(
      (sum, event) => sum + effectiveRatingEventDelta(event, now),
      0,
    );
    const recovering = events.filter(
      (event) =>
        event.delta < 0 &&
        event.recoveryEndsAt !== null &&
        event.recoveryEndsAt.getTime() > now.getTime(),
    ).length;

    return {
      score: benefit.score,
      level: {
        name: benefit.tier.name,
        minScore: benefit.tier.minScore,
        discountPercent: benefit.tier.discountPercent,
        next: benefit.nextTier,
      },
      breakdown: { activeEventDelta, recovering },
      recentEvents: events.slice(0, 6).map((event) => ({
        id: event.id,
        type: event.type,
        delta: effectiveRatingEventDelta(event, now),
        originalDelta: event.delta,
        reason: event.reason,
        createdAt: event.createdAt,
        recoveryEndsAt: event.recoveryEndsAt,
      })),
    };
  });
  return jsonOk(data);
}
