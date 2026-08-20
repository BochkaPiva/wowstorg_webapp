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
    const benefit = await prisma.$transaction((tx) => getGreenwichRatingBenefit(tx, user.id));
    return {
      ...user,
      ratingScore: benefit.score,
      tierName: benefit.tier.name,
      discountPercent: benefit.tier.discountPercent,
      payMultiplier: benefit.payMultiplier,
    };
  }));

  return jsonOk({ users: enriched });
}
