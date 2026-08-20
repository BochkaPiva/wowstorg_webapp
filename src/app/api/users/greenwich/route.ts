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
    const [benefit, activeOffers] = await Promise.all([
      prisma.$transaction((tx) => getGreenwichRatingBenefit(tx, user.id)),
      prisma.greenwichPersonalOffer.findMany({
        where: {
          userId: user.id,
          isActive: true,
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
        },
        select: {
          id: true,
          title: true,
          discountPercent: true,
          items: { select: { itemId: true } },
        },
      }),
    ]);
    return {
      ...user,
      ratingScore: benefit.score,
      tierName: benefit.tier.name,
      discountPercent: benefit.tier.discountPercent,
      payMultiplier: benefit.payMultiplier,
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
