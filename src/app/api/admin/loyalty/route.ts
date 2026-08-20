import { z } from "zod";

import { requireUser } from "@/server/auth/require";
import { prisma } from "@/server/db";
import { jsonError, jsonOk } from "@/server/http";
import {
  ensureGreenwichRatingPolicy,
  getGreenwichMonthlyLeaderboard,
  recomputeGreenwichRatingScores,
} from "@/server/ratings/greenwich-rating";

export const dynamic = "force-dynamic";

const TierSchema = z.object({
  name: z.string().trim().min(1).max(60),
  minScore: z.number().int().min(0).max(100),
  discountPercent: z.number().min(0).max(100),
  sortOrder: z.number().int().min(0).max(100),
});

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_POLICY"),
    policy: z.object({
      startingScore: z.number().int().min(0).max(100),
      confirmationResponseReward: z.number().int().min(0).max(20),
      repeatMissedPenalty: z.number().int().min(-50).max(0),
      finalMissedPenalty: z.number().int().min(-50).max(0),
      overduePenaltyPerDay: z.number().int().min(-50).max(0),
      overduePenaltyCap: z.number().int().min(-100).max(0),
      perfectReturnReward: z.number().int().min(0).max(50),
      repairPenaltyPerUnit: z.number().int().min(-50).max(0),
      lostPenaltyPerUnit: z.number().int().min(-100).max(0),
      incidentPenaltyCap: z.number().int().min(-100).max(0),
      approvalLeadDays: z.number().int().min(1).max(30),
      approvalWarningDays: z.number().int().min(1).max(14),
      approvalMissedPenalty: z.number().int().min(-50).max(0),
      reminderHourOmsk: z.number().int().min(0).max(23),
      recoveryGraceDays: z.number().int().min(0).max(365),
      recoveryDurationDays: z.number().int().min(1).max(730),
    }),
    tiers: z.array(TierSchema).min(1).max(12),
  }),
  z.object({
    action: z.literal("CREATE_OFFER"),
    userId: z.string().min(1),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    discountPercent: z.number().gt(0).max(100),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    itemIds: z.array(z.string().min(1)).min(1).max(500),
  }),
  z.object({
    action: z.literal("SET_OFFER_ACTIVE"),
    offerId: z.string().min(1),
    isActive: z.boolean(),
  }),
]);

async function requireWarehouse() {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.role !== "WOWSTORG") {
    return { ok: false as const, response: jsonError(403, "Доступно только сотрудникам Wowstorg") };
  }
  return auth;
}

export async function GET() {
  const auth = await requireWarehouse();
  if (!auth.ok) return auth.response;
  try {
    const now = new Date();

    const base = await prisma.$transaction(async (tx) => {
      const policy = await ensureGreenwichRatingPolicy(tx);
      const users = await tx.user.findMany({
        where: { role: "GREENWICH" },
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        select: {
          id: true,
          displayName: true,
          login: true,
          isActive: true,
          telegramChatId: true,
          greenwichRating: { select: { baseScore: true, score: true, updatedAt: true } },
        },
      });
      await recomputeGreenwichRatingScores(tx, users.filter((user) => user.isActive).map((user) => user.id), now);
      const refreshed = await tx.user.findMany({
        where: { role: "GREENWICH" },
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
        select: {
          id: true,
          displayName: true,
          login: true,
          isActive: true,
          telegramChatId: true,
          greenwichRating: { select: { baseScore: true, score: true, updatedAt: true } },
        },
      });
      const leaderboard = await getGreenwichMonthlyLeaderboard(tx, now);
      return { policy, users: refreshed, leaderboard };
    }, { timeout: 20_000 });

    const [offers, events, recentReminders, reminderCounts, items] = await Promise.all([
    prisma.greenwichPersonalOffer.findMany({
      orderBy: [{ isActive: "desc" }, { endsAt: "desc" }],
      take: 100,
      include: {
        user: { select: { displayName: true } },
        createdBy: { select: { displayName: true } },
        items: { include: { item: { select: { id: true, name: true, photo1Key: true } } } },
      },
    }),
    prisma.greenwichRatingEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { displayName: true } },
        order: { select: { eventName: true, customer: { select: { name: true } } } },
      },
    }),
    prisma.orderStageReminder.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        recipient: { select: { displayName: true } },
        order: { select: { eventName: true, customer: { select: { name: true } } } },
      },
    }),
    prisma.orderStageReminder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.item.findMany({
      where: { isActive: true, internalOnly: false },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, photo1Key: true, pricePerDay: true },
    }),
  ]);

    return jsonOk({
      now,
      policy: {
        ...base.policy,
        tiers: base.policy.tiers.map((tier) => ({
          ...tier,
          discountPercent: Number(tier.discountPercent),
        })),
      },
      users: base.users.map((user) => ({
        ...user,
        month: base.leaderboard.find((entry) => entry.userId === user.id) ?? null,
      })),
      leaderboard: base.leaderboard,
      offers: offers.map((offer) => ({
        ...offer,
        discountPercent: Number(offer.discountPercent),
        items: offer.items.map(({ item }) => item),
      })),
      events,
      reminders: {
        counts: Object.fromEntries(reminderCounts.map((row) => [row.status, row._count._all])),
        recent: recentReminders,
      },
      items: items.map((item) => ({ ...item, pricePerDay: Number(item.pricePerDay) })),
    });
  } catch (error) {
    console.error("admin loyalty load failed", error);
    return jsonError(500, "Не удалось загрузить центр лояльности. Попробуйте ещё раз");
  }
}

export async function POST(req: Request) {
  const auth = await requireWarehouse();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input", parsed.error.flatten());

  if (parsed.data.action === "UPDATE_POLICY") {
    const input = parsed.data;
    const mins = input.tiers.map((tier) => tier.minScore);
    if (!mins.includes(0) || new Set(mins).size !== mins.length) {
      return jsonError(400, "Уровни должны иметь разные пороги, включая 0");
    }
    const policy = await prisma.$transaction(async (tx) => {
      const current = await ensureGreenwichRatingPolicy(tx);
      await tx.greenwichRatingPolicy.update({
        where: { id: current.id },
        data: input.policy,
      });
      await tx.greenwichRatingTier.deleteMany({ where: { policyId: current.id } });
      await tx.greenwichRatingTier.createMany({
        data: input.tiers.map((tier) => ({ ...tier, policyId: current.id })),
      });
      return ensureGreenwichRatingPolicy(tx);
    });
    return jsonOk({ policy });
  }

  if (parsed.data.action === "SET_OFFER_ACTIVE") {
    const offer = await prisma.greenwichPersonalOffer.update({
      where: { id: parsed.data.offerId },
      data: { isActive: parsed.data.isActive },
    });
    return jsonOk({ offer });
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (endsAt <= startsAt) return jsonError(400, "Дата окончания должна быть позже начала");
  const uniqueItemIds = [...new Set(parsed.data.itemIds)];
  const [user, itemCount] = await Promise.all([
    prisma.user.findFirst({ where: { id: parsed.data.userId, role: "GREENWICH", isActive: true }, select: { id: true } }),
    prisma.item.count({ where: { id: { in: uniqueItemIds }, isActive: true, internalOnly: false } }),
  ]);
  if (!user) return jsonError(404, "Сотрудник Grinvich не найден");
  if (itemCount !== uniqueItemIds.length) return jsonError(400, "Одна или несколько позиций не найдены");

  const offer = await prisma.greenwichPersonalOffer.create({
    data: {
      userId: parsed.data.userId,
      title: parsed.data.title,
      description: parsed.data.description?.trim() || null,
      discountPercent: parsed.data.discountPercent,
      startsAt,
      endsAt,
      createdById: auth.user.id,
      items: { createMany: { data: uniqueItemIds.map((itemId) => ({ itemId })) } },
    },
    include: { items: { include: { item: { select: { id: true, name: true } } } } },
  });
  return jsonOk({ offer });
}
