import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonOk } from "@/server/http";
import { getGreenwichRatingBenefit } from "@/server/ratings/greenwich-rating";

/**
 * Список сотрудников Greenwich для выбора «заявка на кого» при создании заказа складом.
 * Доступно только WOWSTORG.
 */
export async function GET() {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    where: { role: "GREENWICH", isActive: true },
    orderBy: [{ displayName: "asc" }],
    select: { id: true, displayName: true },
  });

  const enriched = await Promise.all(users.map(async (user) => {
    const now = new Date();
    const [benefit, activeOffers, activeBonuses] = await Promise.all([
      prisma.$transaction((tx) => getGreenwichRatingBenefit(tx, user.id)),
      prisma.greenwichPersonalOffer.findMany({
        where: {
          userId: user.id,
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: {
          id: true,
          title: true,
          discountPercent: true,
          items: { select: { itemId: true } },
        },
      }),
      prisma.greenwichMonthlyBonus.findMany({
        where: {
          userId: user.id,
          status: "ACTIVE",
          validFrom: { lte: now },
          validUntil: { gt: now },
        },
        orderBy: [{ validUntil: "asc" }, { awardedAt: "asc" }],
        select: { id: true, code: true, discountPercent: true, validUntil: true },
      }),
    ]);
    return {
      ...user,
      ratingScore: benefit.score,
      tierName: benefit.tier.name,
      discountPercent: benefit.tier.discountPercent,
      payMultiplier: benefit.payMultiplier,
      activeBonuses,
      activeOffers: activeOffers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        discountPercent: Number(offer.discountPercent),
        itemIds: offer.items.map((item) => item.itemId),
      })),
    };
  }));

  return jsonOk({ users: enriched });
}
