import type {
  AchievementCode,
  AchievementLevel,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";

import { ACHIEVEMENTS, levelForValue, levelRank } from "@/server/achievements/config";
import { calcOrderTotalAmount } from "@/server/orders/order-total";

type DbClient = PrismaClient | Prisma.TransactionClient;

const LEVEL_FLOW: AchievementLevel[] = ["BRONZE", "SILVER", "GOLD"];

function metricTitleByCode(code: AchievementCode): string {
  const row = ACHIEVEMENTS.find((a) => a.code === code);
  return row?.title ?? code;
}

function metricDescriptionByCode(code: AchievementCode): string {
  const row = ACHIEVEMENTS.find((a) => a.code === code);
  return row?.description ?? "";
}

function valueForLevelThresholds(level: AchievementLevel, thresholds: { bronze: number; silver: number; gold: number }): number {
  if (level === "BRONZE") return thresholds.bronze;
  if (level === "SILVER") return thresholds.silver;
  return thresholds.gold;
}

function nextLevel(level: AchievementLevel): AchievementLevel | null {
  if (level === "NONE") return "BRONZE";
  if (level === "BRONZE") return "SILVER";
  if (level === "SILVER") return "GOLD";
  return null;
}

async function computeNoCancelStreak(db: DbClient, userId: string): Promise<number> {
  const rows = await db.order.findMany({
    where: {
      greenwichUserId: userId,
      status: { in: ["CLOSED", "CANCELLED"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { status: true },
  });

  let streak = 0;
  let best = 0;
  for (const row of rows) {
    if (row.status === "CLOSED") {
      streak += 1;
      best = Math.max(best, streak);
    } else if (row.status === "CANCELLED") {
      streak = 0;
    }
  }
  return best;
}

async function computeOrderVolumeMax(db: DbClient, userId: string): Promise<number> {
  const orders = await db.order.findMany({
    where: { greenwichUserId: userId, status: "CLOSED" },
    select: {
      lines: { select: { itemId: true } },
    },
  });

  let maxPositions = 0;
  for (const order of orders) {
    const distinct = new Set(order.lines.map((l) => l.itemId)).size;
    maxPositions = Math.max(maxPositions, distinct);
  }
  return maxPositions;
}

async function computeBiggestCheck(db: DbClient, userId: string): Promise<number> {
  const orders = await db.order.findMany({
    where: { greenwichUserId: userId, status: "CLOSED" },
    select: {
      startDate: true,
      endDate: true,
      payMultiplier: true,
      deliveryPrice: true,
      montagePrice: true,
      demontagePrice: true,
      rentalDiscountType: true,
      rentalDiscountPercent: true,
      rentalDiscountAmount: true,
      lines: { select: { requestedQty: true, pricePerDaySnapshot: true } },
    },
  });

  let maxTotal = 0;
  for (const order of orders) {
    const total = calcOrderTotalAmount({
      startDate: order.startDate,
      endDate: order.endDate,
      payMultiplier: order.payMultiplier != null ? Number(order.payMultiplier) : null,
      deliveryPrice: order.deliveryPrice != null ? Number(order.deliveryPrice) : null,
      montagePrice: order.montagePrice != null ? Number(order.montagePrice) : null,
      demontagePrice: order.demontagePrice != null ? Number(order.demontagePrice) : null,
      lines: order.lines,
      discount: order,
    });
    maxTotal = Math.max(maxTotal, total);
  }
  return maxTotal;
}

async function computeMetrics(db: DbClient, userId: string): Promise<Record<AchievementCode, number>> {
  const [closedOrdersCount, perfectOrdersCount, towerStats, orderVolumeMax, biggestCheck, noCancelStreak] =
    await Promise.all([
      db.order.count({
        where: { greenwichUserId: userId, status: "CLOSED" },
      }),
      db.order.count({
        where: {
          greenwichUserId: userId,
          status: "CLOSED",
          greenwichRatingOverdueDelta: 0,
          greenwichRatingIncidentsDelta: { gte: 10 },
        },
      }),
      db.userTowerStats.findUnique({
        where: { userId },
        select: { bestScore: true },
      }),
      computeOrderVolumeMax(db, userId),
      computeBiggestCheck(db, userId),
      computeNoCancelStreak(db, userId),
    ]);

  return {
    PERFECT_ORDERS: perfectOrdersCount,
    TOWER_SCORE: towerStats?.bestScore ?? 0,
    ORDER_VOLUME: orderVolumeMax,
    BIGGEST_CHECK: biggestCheck,
    CLOSED_ORDERS: closedOrdersCount,
    NO_CANCEL_STREAK: noCancelStreak,
  };
}

export async function recomputeGreenwichAchievements(
  db: DbClient,
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user || user.role !== "GREENWICH") return;

  const metrics = await computeMetrics(db, userId);
  const existing = await db.achievementProgress.findMany({
    where: { userId },
    select: { code: true, level: true },
  });
  const existingMap = new Map(existing.map((e) => [e.code, e.level]));

  for (const definition of ACHIEVEMENTS) {
    const value = metrics[definition.code] ?? 0;
    const prevLevel = existingMap.get(definition.code) ?? "NONE";
    const next = levelForValue(value, definition.thresholds);

    await db.achievementProgress.upsert({
      where: { userId_code: { userId, code: definition.code } },
      update: { value, level: next },
      create: { userId, code: definition.code, value, level: next },
    });

    if (levelRank(next) <= levelRank(prevLevel)) continue;

    for (const level of LEVEL_FLOW) {
      if (levelRank(level) <= levelRank(prevLevel)) continue;
      if (levelRank(level) > levelRank(next)) continue;
      try {
        await db.achievementUnlock.create({
          data: {
            userId,
            code: definition.code,
            level,
          },
        });
      } catch (error) {
        if (
          error instanceof PrismaNs.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }

      await db.inAppNotification.create({
        data: {
          userId,
          type: "ACHIEVEMENT_UNLOCK",
          title: `Новая ачивка: ${metricTitleByCode(definition.code)} (${level})`,
          body: metricDescriptionByCode(definition.code),
          payloadJson: {
            kind: "ACHIEVEMENT_UNLOCK",
            code: definition.code,
            level,
            value,
            threshold: valueForLevelThresholds(level, definition.thresholds),
          },
        },
      });
    }
  }
}

export type AchievementCard = {
  code: AchievementCode;
  title: string;
  description: string;
  value: number;
  level: AchievementLevel;
  nextLevel: AchievementLevel | null;
  nextThreshold: number | null;
  progressPercentToNext: number | null;
  thresholds: { bronze: number; silver: number; gold: number };
};

export async function getGreenwichAchievementsSnapshot(
  db: DbClient,
  userId: string,
): Promise<{
  cards: AchievementCard[];
  unreadNotifications: number;
}> {
  const rows = await db.achievementProgress.findMany({
    where: { userId },
    select: { code: true, value: true, level: true },
  });
  const map = new Map(rows.map((r) => [r.code, r]));

  const cards: AchievementCard[] = ACHIEVEMENTS.map((a) => {
    const row = map.get(a.code);
    const level = row?.level ?? "NONE";
    const value = row?.value ?? 0;
    const next = nextLevel(level);
    const nextThreshold =
      next === "BRONZE"
        ? a.thresholds.bronze
        : next === "SILVER"
          ? a.thresholds.silver
          : next === "GOLD"
            ? a.thresholds.gold
            : null;
    const progressPercentToNext =
      nextThreshold == null
        ? null
        : Math.max(0, Math.min(100, Math.round((value / Math.max(1, nextThreshold)) * 100)));

    return {
      code: a.code,
      title: a.title,
      description: a.description,
      value,
      level,
      nextLevel: next,
      nextThreshold,
      progressPercentToNext,
      thresholds: a.thresholds,
    };
  });

  const unreadNotifications = await db.inAppNotification.count({
    where: { userId, isRead: false },
  });

  return { cards, unreadNotifications };
}
