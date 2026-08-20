import type { Prisma } from "@prisma/client";

import { getGreenwichRatingBenefit } from "@/server/ratings/greenwich-rating";

export type GreenwichItemBenefit = {
  itemId: string;
  payMultiplier: number;
  discountPercent: number;
  source: "RATING_TIER" | "PERSONAL_OFFER" | "MONTHLY_BONUS";
  sourceLabel: string;
  offerId: string | null;
  offerTitle: string | null;
  offerEndsAt: Date | null;
};

export function resolveGreenwichDiscount(args: {
  tierDiscountPercent: number;
  personalOfferDiscountPercent?: number | null;
  monthlyBonusPercent?: number | null;
}): {
  discountPercent: number;
  source: "RATING_TIER" | "PERSONAL_OFFER" | "MONTHLY_BONUS";
} {
  const tierDiscount = Math.max(0, Math.min(100, args.tierDiscountPercent));
  const monthlyBonus = Math.max(0, Math.min(100, args.monthlyBonusPercent ?? 0));
  const ratingWithBonus = Math.min(100, tierDiscount + monthlyBonus);
  const offerDiscount = Math.max(0, Math.min(100, args.personalOfferDiscountPercent ?? 0));

  if (offerDiscount > ratingWithBonus) {
    return { discountPercent: offerDiscount, source: "PERSONAL_OFFER" };
  }
  if (monthlyBonus > 0) {
    return { discountPercent: ratingWithBonus, source: "MONTHLY_BONUS" };
  }
  return { discountPercent: tierDiscount, source: "RATING_TIER" };
}

/**
 * Возвращает ровно одну финальную скидку на позицию.
 * Персональные предложения не складываются и не могут ухудшить скидку уровня.
 */
export async function getGreenwichItemBenefits(
  tx: Prisma.TransactionClient,
  args: { userId: string; itemIds: string[]; now?: Date; monthlyBonusPercent?: number | null },
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
      const resolved = resolveGreenwichDiscount({
        tierDiscountPercent: tierDiscount,
        personalOfferDiscountPercent: offer ? Number(offer.discountPercent) : null,
        monthlyBonusPercent: args.monthlyBonusPercent,
      });
      const useOffer = resolved.source === "PERSONAL_OFFER";
      return [
        itemId,
        {
          itemId,
          payMultiplier: Math.round((1 - resolved.discountPercent / 100) * 10_000) / 10_000,
          discountPercent: resolved.discountPercent,
          source: resolved.source,
          sourceLabel: useOffer
            ? offer?.title ?? "Персональное предложение"
            : resolved.source === "MONTHLY_BONUS"
              ? `Бонус лидера +${args.monthlyBonusPercent ?? 0}%`
              : `Уровень «${rating.tier.name}»`,
          offerId: useOffer ? offer?.id ?? null : null,
          offerTitle: useOffer ? offer?.title ?? null : null,
          offerEndsAt: useOffer ? offer?.endsAt ?? null : null,
        } satisfies GreenwichItemBenefit,
      ];
    }),
  );
}
