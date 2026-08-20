import type { Prisma } from "@prisma/client";

import { getGreenwichRatingBenefit } from "@/server/ratings/greenwich-rating";

export type GreenwichItemBenefit = {
  itemId: string;
  payMultiplier: number;
  discountPercent: number;
  source: "RATING_TIER" | "PERSONAL_OFFER";
  sourceLabel: string;
  offerId: string | null;
  offerTitle: string | null;
  offerEndsAt: Date | null;
};

/**
 * Возвращает ровно одну финальную скидку на позицию.
 * Персональные предложения не складываются и не могут ухудшить скидку уровня.
 */
export async function getGreenwichItemBenefits(
  tx: Prisma.TransactionClient,
  args: { userId: string; itemIds: string[]; now?: Date },
): Promise<Map<string, GreenwichItemBenefit>> {
  const now = args.now ?? new Date();
  const itemIds = [...new Set(args.itemIds.filter(Boolean))];
  const rating = await getGreenwichRatingBenefit(tx, args.userId, now);
  const tierDiscount = rating.tier.discountPercent;
  const offers = itemIds.length
    ? await tx.greenwichPersonalOffer.findMany({
        where: {
          userId: args.userId,
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gt: now },
          items: { some: { itemId: { in: itemIds } } },
        },
        select: {
          id: true,
          title: true,
          discountPercent: true,
          endsAt: true,
          items: { where: { itemId: { in: itemIds } }, select: { itemId: true } },
        },
      })
    : [];

  const bestOfferByItem = new Map<string, (typeof offers)[number]>();
  for (const offer of offers) {
    for (const { itemId } of offer.items) {
      const current = bestOfferByItem.get(itemId);
      if (!current || Number(offer.discountPercent) > Number(current.discountPercent)) {
        bestOfferByItem.set(itemId, offer);
      }
    }
  }

  return new Map(
    itemIds.map((itemId) => {
      const offer = bestOfferByItem.get(itemId);
      const offerDiscount = offer ? Number(offer.discountPercent) : -1;
      const useOffer = offer != null && offerDiscount > tierDiscount;
      const discountPercent = useOffer ? offerDiscount : tierDiscount;
      return [
        itemId,
        {
          itemId,
          payMultiplier: Math.round((1 - discountPercent / 100) * 10_000) / 10_000,
          discountPercent,
          source: useOffer ? "PERSONAL_OFFER" : "RATING_TIER",
          sourceLabel: useOffer ? offer.title : `Уровень «${rating.tier.name}»`,
          offerId: useOffer ? offer.id : null,
          offerTitle: useOffer ? offer.title : null,
          offerEndsAt: useOffer ? offer.endsAt : null,
        } satisfies GreenwichItemBenefit,
      ];
    }),
  );
}
