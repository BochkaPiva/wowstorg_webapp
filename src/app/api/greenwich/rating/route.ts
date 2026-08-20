import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { getOrSetRuntimeCache } from "@/server/runtime-cache";
import {
  effectiveRatingEventDelta,
  getGreenwichRatingBenefit,
  getGreenwichMonthlyLeaderboard,
} from "@/server/ratings/greenwich-rating";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH") {
    return jsonError(403, "Доступно только для сотрудников Greenwich");
  }

  const data = await getOrSetRuntimeCache(`greenwich:rating:${auth.user.id}`, 15_000, async () => {
    const now = new Date();
    const { benefit, leaderboard, policy } = await prisma.$transaction(
      async (tx) => ({
        benefit: await getGreenwichRatingBenefit(tx, auth.user.id, now),
        leaderboard: await getGreenwichMonthlyLeaderboard(tx, now),
        policy: await tx.greenwichRatingPolicy.findUnique({ where: { id: "default" } }),
      }),
      { timeout: 15_000 },
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
    const activeOffers = await prisma.greenwichPersonalOffer.findMany({
      where: {
        userId: auth.user.id,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: [{ endsAt: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        discountPercent: true,
        endsAt: true,
        items: {
          take: 6,
          select: { item: { select: { id: true, name: true, photo1Key: true } } },
        },
        _count: { select: { items: true } },
      },
    });
    const myMonthly = leaderboard.find((entry) => entry.userId === auth.user.id) ?? null;

    return {
      score: benefit.score,
      level: {
        name: benefit.tier.name,
        minScore: benefit.tier.minScore,
        discountPercent: benefit.tier.discountPercent,
        next: benefit.nextTier,
      },
      breakdown: { activeEventDelta, recovering },
      month: {
        position: myMonthly?.position ?? null,
        delta: myMonthly?.monthlyDelta ?? 0,
        activeParticipants: leaderboard.length,
        leader: leaderboard[0] ?? null,
        top: leaderboard.slice(0, 5),
      },
      rules: {
        startingScore: policy?.startingScore ?? 70,
        approvalLeadDays: policy?.approvalLeadDays ?? 3,
        approvalWarningDays: policy?.approvalWarningDays ?? 2,
        reminderHourOmsk: policy?.reminderHourOmsk ?? 11,
      },
      activeOffers: activeOffers.map((offer) => ({
        ...offer,
        discountPercent: Number(offer.discountPercent),
        itemCount: offer._count.items,
        items: offer.items.map(({ item }) => item),
        _count: undefined,
      })),
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
