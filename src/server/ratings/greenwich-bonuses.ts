import { randomBytes, randomInt } from "crypto";
import { Prisma, type OrderStatus } from "@prisma/client";

import { prisma } from "@/server/db";
import { createInAppNotification } from "@/server/notifications/in-app";
import {
  getGreenwichMonthlyLeaderboard,
  getOmskMonthUtcRange,
} from "@/server/ratings/greenwich-rating";

const OMSK_TZ = "Asia/Omsk";
export const MONTHLY_BONUS_MIN_PERCENT = 5;
export const MONTHLY_BONUS_MAX_PERCENT = 12;
export const RESTORED_BONUS_GRACE_DAYS = 7;

const PRE_ISSUE_STATUSES: readonly OrderStatus[] = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
];

function getOmskHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: OMSK_TZ,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

function monthKey(reference: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
  }).format(reference);
}

export function drawMonthlyBonusPercent(): number {
  return randomInt(MONTHLY_BONUS_MIN_PERCENT, MONTHLY_BONUS_MAX_PERCENT + 1);
}

export function restoredBonusValidUntil(originalValidUntil: Date, now: Date): Date {
  const graceUntil = new Date(now.getTime() + RESTORED_BONUS_GRACE_DAYS * 86_400_000);
  return originalValidUntil > graceUntil ? originalValidUntil : graceUntil;
}

export async function expireGreenwichMonthlyBonuses(now = new Date()): Promise<number> {
  const due = await prisma.greenwichMonthlyBonus.findMany({
    where: { status: "ACTIVE", validUntil: { lte: now } },
    select: { id: true, userId: true },
  });
  let expired = 0;
  for (const bonus of due) {
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.greenwichMonthlyBonus.updateMany({
        where: { id: bonus.id, status: "ACTIVE", validUntil: { lte: now } },
        data: { status: "EXPIRED", expiredAt: now },
      });
      if (update.count === 0) return false;
      await tx.greenwichMonthlyBonusEvent.createMany({
        data: [{
          bonusId: bonus.id,
          userId: bonus.userId,
          type: "EXPIRED",
          sourceKey: `monthly-bonus:${bonus.id}:expired`,
          reason: "Срок действия бонуса завершён",
          createdAt: now,
        }],
        skipDuplicates: true,
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

export async function maybeAwardPreviousMonthBonus(now = new Date()): Promise<{
  created: boolean;
  noWinner: boolean;
  bonusId: string | null;
  userId: string | null;
  discountPercent: number | null;
}> {
  await expireGreenwichMonthlyBonuses(now);
  if (getOmskHour(now) < 11) {
    return { created: false, noWinner: false, bonusId: null, userId: null, discountPercent: null };
  }

  const currentMonth = getOmskMonthUtcRange(now);
  const previousMonthReference = new Date(currentMonth.start.getTime() - 1);
  const earnedMonth = getOmskMonthUtcRange(previousMonthReference).start;
  const key = monthKey(previousMonthReference);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.greenwichMonthlyBonus.findUnique({
        where: { earnedMonth },
        select: { id: true, userId: true, discountPercent: true },
      });
      if (existing) return { created: false, noWinner: false, ...existing };

      const leaderboard = await getGreenwichMonthlyLeaderboard(tx, previousMonthReference);
      const winner = leaderboard[0];
      if (!winner) {
        return {
          created: false,
          noWinner: true,
          id: null,
          userId: null,
          discountPercent: null,
        };
      }

      const discountPercent = drawMonthlyBonusPercent();
      const code = `GRV-${key.replace("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
      const bonus = await tx.greenwichMonthlyBonus.create({
        data: {
          userId: winner.userId,
          earnedMonth,
          validFrom: currentMonth.start,
          validUntil: currentMonth.end,
          discountPercent,
          code,
        },
        select: { id: true, userId: true, discountPercent: true },
      });
      await tx.greenwichMonthlyBonusEvent.create({
        data: {
          bonusId: bonus.id,
          userId: bonus.userId,
          type: "AWARDED",
          sourceKey: `monthly-bonus:${key}:awarded`,
          reason: `Победа в рейтинге Grinvich за ${key}`,
          createdAt: now,
        },
      });
      return { created: true, noWinner: false, ...bonus };
    }, { timeout: 30_000 });

    if (result.created && result.id && result.userId && result.discountPercent != null) {
      await createInAppNotification({
        userId: result.userId,
        type: "ORDER_DISCOUNT",
        title: `Ваш бонус лидера: +${result.discountPercent}%`,
        body: "Бонус действует на одну заявку. Выберите его при оформлении в корзине.",
        payloadJson: { kind: "MONTHLY_BONUS_AWARDED", bonusId: result.id, href: "/bonuses" },
      });
    }
    return {
      created: result.created,
      noWinner: result.noWinner,
      bonusId: result.id,
      userId: result.userId,
      discountPercent: result.discountPercent,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.greenwichMonthlyBonus.findUnique({
        where: { earnedMonth },
        select: { id: true, userId: true, discountPercent: true },
      });
      if (!existing) throw error;
      return {
        created: false,
        noWinner: false,
        bonusId: existing.id,
        userId: existing.userId,
        discountPercent: existing.discountPercent,
      };
    }
    throw error;
  }
}

export async function getActiveGreenwichMonthlyBonus(
  tx: Prisma.TransactionClient,
  args: { userId: string; bonusId?: string | null; now?: Date },
) {
  const now = args.now ?? new Date();
  return tx.greenwichMonthlyBonus.findFirst({
    where: {
      ...(args.bonusId ? { id: args.bonusId } : {}),
      userId: args.userId,
      status: "ACTIVE",
      validFrom: { lte: now },
      validUntil: { gt: now },
    },
    orderBy: [{ validUntil: "asc" }, { awardedAt: "asc" }],
  });
}

export async function redeemGreenwichMonthlyBonus(
  tx: Prisma.TransactionClient,
  args: { bonusId: string; userId: string; orderId: string; now?: Date },
): Promise<boolean> {
  const now = args.now ?? new Date();
  const changed = await tx.greenwichMonthlyBonus.updateMany({
    where: {
      id: args.bonusId,
      userId: args.userId,
      status: "ACTIVE",
      validFrom: { lte: now },
      validUntil: { gt: now },
    },
    data: { status: "REDEEMED", redeemedAt: now, expiredAt: null },
  });
  if (changed.count === 0) return false;
  await tx.greenwichMonthlyBonusEvent.create({
    data: {
      bonusId: args.bonusId,
      userId: args.userId,
      type: "REDEEMED",
      sourceKey: `monthly-bonus:${args.bonusId}:redeemed:${args.orderId}`,
      orderId: args.orderId,
      reason: "Бонус применён к заявке",
      createdAt: now,
    },
  });
  return true;
}

export async function restoreGreenwichMonthlyBonusForCancelledOrder(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    orderStatus: OrderStatus;
    userId: string | null;
    bonusId: string | null;
    now?: Date;
  },
): Promise<boolean> {
  if (!args.userId || !args.bonusId || !PRE_ISSUE_STATUSES.includes(args.orderStatus)) return false;
  const now = args.now ?? new Date();
  const bonus = await tx.greenwichMonthlyBonus.findFirst({
    where: { id: args.bonusId, userId: args.userId, status: "REDEEMED" },
    select: { validUntil: true },
  });
  if (!bonus) return false;

  const validUntil = restoredBonusValidUntil(bonus.validUntil, now);
  const changed = await tx.greenwichMonthlyBonus.updateMany({
    where: { id: args.bonusId, userId: args.userId, status: "REDEEMED" },
    data: {
      status: "ACTIVE",
      validUntil,
      redeemedAt: null,
      restoredAt: now,
      expiredAt: null,
    },
  });
  if (changed.count === 0) return false;
  await tx.order.updateMany({
    where: { id: args.orderId, greenwichMonthlyBonusId: args.bonusId },
    data: { greenwichMonthlyBonusId: null },
  });
  await tx.greenwichMonthlyBonusEvent.createMany({
    data: [{
      bonusId: args.bonusId,
      userId: args.userId,
      type: "RESTORED",
      sourceKey: `monthly-bonus:${args.bonusId}:restored:${args.orderId}`,
      orderId: args.orderId,
      reason: `Заявка отменена до выдачи — бонус восстановлен до ${validUntil.toISOString()}`,
      createdAt: now,
    }],
    skipDuplicates: true,
  });
  return true;
}
