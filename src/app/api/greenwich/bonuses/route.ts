import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import {
  effectiveRatingEventDelta,
  getGreenwichMonthlyLeaderboard,
  getGreenwichRatingBenefit,
} from "@/server/ratings/greenwich-rating";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (auth.user.role !== "GREENWICH") {
    return jsonError(403, "Доступно только сотрудникам Grinvich");
  }

  const now = new Date();
  const [benefit, leaderboard, bonuses, bonusEvents, ratingEvents] = await prisma.$transaction(
    async (tx) => Promise.all([
      getGreenwichRatingBenefit(tx, auth.user.id, now),
      getGreenwichMonthlyLeaderboard(tx, now),
      tx.greenwichMonthlyBonus.findMany({
        where: { userId: auth.user.id },
        orderBy: [{ awardedAt: "desc" }],
        take: 24,
        select: {
          id: true,
          code: true,
          discountPercent: true,
          status: true,
          earnedMonth: true,
          validFrom: true,
          validUntil: true,
          awardedAt: true,
          redeemedAt: true,
          restoredAt: true,
          redeemedOrder: {
            select: {
              id: true,
              eventName: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      tx.greenwichMonthlyBonusEvent.findMany({
        where: { userId: auth.user.id },
        orderBy: [{ createdAt: "desc" }],
        take: 40,
        select: {
          id: true,
          type: true,
          reason: true,
          createdAt: true,
          bonus: { select: { code: true, discountPercent: true } },
          order: {
            select: {
              id: true,
              eventName: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      tx.greenwichRatingEvent.findMany({
        where: { userId: auth.user.id },
        orderBy: [{ createdAt: "desc" }],
        take: 40,
        select: {
          id: true,
          type: true,
          delta: true,
          reason: true,
          createdAt: true,
          recoveryStartsAt: true,
          recoveryEndsAt: true,
        },
      }),
    ]),
    { timeout: 20_000 },
  );

  const myMonth = leaderboard.find((entry) => entry.userId === auth.user.id) ?? null;
  const activeBonuses = bonuses.filter(
    (bonus) => bonus.status === "ACTIVE" && bonus.validFrom <= now && bonus.validUntil > now,
  );

  return jsonOk({
    rating: {
      score: benefit.score,
      tierName: benefit.tier.name,
      tierDiscountPercent: benefit.tier.discountPercent,
      monthPosition: myMonth?.position ?? null,
      monthDelta: myMonth?.monthlyDelta ?? 0,
      activeParticipants: leaderboard.length,
    },
    activeBonuses,
    bonuses,
    history: [
      ...bonusEvents.map((event) => ({
        kind: "BONUS" as const,
        id: event.id,
        type: event.type,
        title: event.reason,
        createdAt: event.createdAt,
        discountPercent: event.bonus.discountPercent,
        code: event.bonus.code,
        order: event.order,
      })),
      ...ratingEvents.map((event) => ({
        kind: "RATING" as const,
        id: event.id,
        type: event.type,
        title: event.reason,
        createdAt: event.createdAt,
        delta: effectiveRatingEventDelta(event, now),
        originalDelta: event.delta,
        recoveryEndsAt: event.recoveryEndsAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50),
  });
}
