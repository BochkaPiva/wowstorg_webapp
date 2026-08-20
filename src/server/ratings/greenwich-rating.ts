import type {
  Condition,
  GreenwichRatingEventType,
  ItemType,
  Prisma,
} from "@prisma/client";

/** Рабочий день и сравнение «календарных дней» — по Омску. */
const OMSK_TZ = "Asia/Omsk";

export const DEFAULT_GREENWICH_RATING_TIERS = [
  { name: "Старт", minScore: 0, discountPercent: 10, sortOrder: 0 },
  { name: "Стабильный", minScore: 60, discountPercent: 20, sortOrder: 1 },
  { name: "Надёжный", minScore: 75, discountPercent: 25, sortOrder: 2 },
  { name: "Премиум", minScore: 90, discountPercent: 30, sortOrder: 3 },
] as const;

export type GreenwichRatingBenefit = {
  score: number;
  tier: { id: string; name: string; minScore: number; discountPercent: number };
  nextTier: { id: string; name: string; minScore: number; discountPercent: number; pointsNeeded: number } | null;
  payMultiplier: number;
};

export type GreenwichMonthlyLeader = {
  userId: string;
  displayName: string;
  monthlyDelta: number;
  perfectReturns: number;
  penalties: number;
  currentScore: number;
  position: number;
};

function utcDateOnlyToYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function addCalendarDaysUtcYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return utcDateOnlyToYmd(dt);
}

function dateTimeToYmdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Разница в днях между календарными датами YYYY-MM-DD (a − b). */
function ymdDiffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  return Math.round((ta - tb) / 86_400_000);
}

/**
 * Просрочка: дедлайн включительно = endDate + 1 календарный день (как в заявке, UTC date-only).
 * Дата отправки на приёмку — календарный день в Омске на момент `declaredAt`.
 * Штраф за день и общий потолок задаются политикой рейтинга.
 */
export function computeGreenwichOverdueDelta(
  endDate: Date,
  declaredAt: Date,
  policy: { overduePenaltyPerDay?: number; overduePenaltyCap?: number } = {},
): number {
  const endYmd = utcDateOnlyToYmd(endDate);
  const deadlineInclusiveYmd = addCalendarDaysUtcYmd(endYmd, 1);
  const declaredYmd = dateTimeToYmdInTimeZone(declaredAt, OMSK_TZ);
  const overdueDays = Math.max(0, ymdDiffDays(declaredYmd, deadlineInclusiveYmd));
  const perDay = Math.min(0, policy.overduePenaltyPerDay ?? -5);
  const cap = Math.min(0, policy.overduePenaltyCap ?? -25);
  return Math.max(cap, perDay * overdueDays);
}

export function computeGreenwichIncidentsDelta(
  rows: Array<{ condition: Condition; qty: number; itemType: ItemType }>,
  policy: {
    perfectReturnReward?: number;
    repairPenaltyPerUnit?: number;
    lostPenaltyPerUnit?: number;
    incidentPenaltyCap?: number;
  } = {},
): number {
  let broken = 0;
  let lost = 0;
  for (const row of rows) {
    if (row.itemType === "CONSUMABLE") continue;
    if (row.condition === "NEEDS_REPAIR" || row.condition === "BROKEN") {
      broken += row.qty;
    } else if (row.condition === "MISSING") {
      lost += row.qty;
    }
  }
  const reward = Math.max(0, policy.perfectReturnReward ?? 5);
  const repairPenalty = Math.min(0, policy.repairPenaltyPerUnit ?? -1);
  const lostPenalty = Math.min(0, policy.lostPenaltyPerUnit ?? -3);
  const cap = Math.min(0, policy.incidentPenaltyCap ?? -20);
  if (broken === 0 && lost === 0) return reward;
  return Math.max(cap, repairPenalty * broken + lostPenalty * lost);
}

export async function ensureGreenwichRatingPolicy(tx: Prisma.TransactionClient) {
  const policy = await tx.greenwichRatingPolicy.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
    include: { tiers: { orderBy: [{ minScore: "asc" }] } },
  });
  if (policy.tiers.length > 0) return policy;
  await tx.greenwichRatingTier.createMany({
    data: DEFAULT_GREENWICH_RATING_TIERS.map((tier) => ({
      policyId: policy.id,
      ...tier,
    })),
    skipDuplicates: true,
  });
  return tx.greenwichRatingPolicy.findUniqueOrThrow({
    where: { id: policy.id },
    include: { tiers: { orderBy: [{ minScore: "asc" }] } },
  });
}

export async function getGreenwichRatingBenefit(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<GreenwichRatingBenefit> {
  // Interactive Prisma transactions execute sequentially. Keeping these calls
  // explicit also guarantees that default tiers exist before we choose one.
  const score = await recomputeGreenwichRatingScore(tx, userId, now);
  const policy = await ensureGreenwichRatingPolicy(tx);
  const tiers = policy.tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    minScore: tier.minScore,
    discountPercent: Number(tier.discountPercent),
  }));
  const tier = [...tiers].reverse().find((entry) => score >= entry.minScore) ?? tiers[0];
  if (!tier) throw new Error("GREENWICH_RATING_TIERS_NOT_CONFIGURED");
  const next = tiers.find((entry) => entry.minScore > score) ?? null;
  const discountPercent = Math.max(0, Math.min(100, tier.discountPercent));
  return {
    score,
    tier,
    nextTier: next ? { ...next, pointsNeeded: next.minScore - score } : null,
    payMultiplier: Math.round((1 - discountPercent / 100) * 10_000) / 10_000,
  };
}

export function effectiveRatingEventDelta(
  event: { delta: number; recoveryStartsAt: Date | null; recoveryEndsAt: Date | null },
  now = new Date(),
): number {
  if (event.delta >= 0 || !event.recoveryStartsAt || !event.recoveryEndsAt) return event.delta;
  if (now <= event.recoveryStartsAt) return event.delta;
  if (now >= event.recoveryEndsAt) return 0;
  const duration = event.recoveryEndsAt.getTime() - event.recoveryStartsAt.getTime();
  if (duration <= 0) return 0;
  const remaining = (event.recoveryEndsAt.getTime() - now.getTime()) / duration;
  return Math.round(event.delta * Math.max(0, Math.min(1, remaining)));
}

export async function addGreenwichRatingEvent(
  tx: Prisma.TransactionClient,
  args: {
    userId: string;
    type: GreenwichRatingEventType;
    delta: number;
    reason: string;
    sourceKey: string;
    orderId?: string;
    reminderId?: string;
    stageReminderId?: string;
    recoverable?: boolean;
    now?: Date;
  },
): Promise<boolean> {
  const now = args.now ?? new Date();
  const policy = await ensureGreenwichRatingPolicy(tx);
  const recoveryStartsAt = args.recoverable
    ? new Date(now.getTime() + policy.recoveryGraceDays * 86_400_000)
    : null;
  const recoveryEndsAt = recoveryStartsAt
    ? new Date(recoveryStartsAt.getTime() + policy.recoveryDurationDays * 86_400_000)
    : null;
  const result = await tx.greenwichRatingEvent.createMany({
    data: [{
      userId: args.userId,
      type: args.type,
      delta: args.delta,
      reason: args.reason,
      sourceKey: args.sourceKey,
      orderId: args.orderId,
      reminderId: args.reminderId,
      stageReminderId: args.stageReminderId,
      recoveryStartsAt,
      recoveryEndsAt,
      createdAt: now,
    }],
    skipDuplicates: true,
  });
  if (result.count > 0) await recomputeGreenwichRatingScore(tx, args.userId, now);
  return result.count > 0;
}

export async function recomputeGreenwichRatingScore(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<number> {
  const scores = await recomputeGreenwichRatingScores(tx, [userId], now);
  const score = scores.get(userId);
  if (score === undefined) throw new Error("GREENWICH_RATING_RECOMPUTE_FAILED");
  return score;
}

/** Пересчитывает несколько сотрудников общими запросами, не создавая N+1 внутри транзакции. */
export async function recomputeGreenwichRatingScores(
  tx: Prisma.TransactionClient,
  userIds: string[],
  now = new Date(),
): Promise<Map<string, number>> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return new Map();

  const policy = await ensureGreenwichRatingPolicy(tx);
  await tx.greenwichRating.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      baseScore: policy.startingScore,
      score: policy.startingScore,
    })),
    skipDuplicates: true,
  });
  const ratings = await tx.greenwichRating.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: { userId: true, baseScore: true },
  });
  const events = await tx.greenwichRatingEvent.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: { userId: true, delta: true, recoveryStartsAt: true, recoveryEndsAt: true },
  });

  const baseScores = new Map(ratings.map((rating) => [rating.userId, rating.baseScore]));
  const eventSums = new Map<string, number>();
  for (const event of events) {
    eventSums.set(event.userId, (eventSums.get(event.userId) ?? 0) + effectiveRatingEventDelta(event, now));
  }

  const scores = new Map<string, number>();
  const usersByScore = new Map<number, string[]>();
  for (const userId of uniqueUserIds) {
    const baseScore = baseScores.get(userId) ?? policy.startingScore;
    const score = Math.max(0, Math.min(100, baseScore + (eventSums.get(userId) ?? 0)));
    scores.set(userId, score);
    usersByScore.set(score, [...(usersByScore.get(score) ?? []), userId]);
  }

  for (const [score, ids] of usersByScore) {
    await tx.greenwichRating.updateMany({
      where: { userId: { in: ids } },
      data: { score, manualLocked: false },
    });
  }
  return scores;
}

/** Границы календарного месяца Омска. В регионе нет перехода на летнее время (UTC+6). */
export function getOmskMonthUtcRange(now = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OMSK_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const monthIndex = Number(parts.find((part) => part.type === "month")?.value) - 1;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1, -6)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1, -6)),
  };
}

export async function getGreenwichMonthlyLeaderboard(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<GreenwichMonthlyLeader[]> {
  const range = getOmskMonthUtcRange(now);
  const users = await tx.user.findMany({
    where: { role: "GREENWICH", isActive: true },
    select: {
      id: true,
      displayName: true,
      greenwichRating: { select: { score: true } },
      greenwichRatingEvents: {
        where: {
          createdAt: { gte: range.start, lt: range.end },
          type: { not: "ADMIN_ADJUSTMENT" },
        },
        select: { type: true, delta: true, recoveryStartsAt: true, recoveryEndsAt: true },
      },
      ordersGreenwich: {
        where: { status: "CLOSED", updatedAt: { gte: range.start, lt: range.end } },
        select: { id: true },
      },
    },
  });

  const ranked = users
    .filter((user) => user.greenwichRatingEvents.length > 0 || user.ordersGreenwich.length > 0)
    .map((user) => ({
      userId: user.id,
      displayName: user.displayName,
      monthlyDelta: user.greenwichRatingEvents.reduce(
        (sum, event) => sum + effectiveRatingEventDelta(event, now),
        0,
      ),
      perfectReturns: user.greenwichRatingEvents.filter((event) => event.type === "PERFECT_RETURN").length,
      penalties: user.greenwichRatingEvents.filter((event) => event.delta < 0).length,
      currentScore: user.greenwichRating?.score ?? 70,
    }))
    .sort((a, b) =>
      b.monthlyDelta - a.monthlyDelta ||
      b.perfectReturns - a.perfectReturns ||
      a.penalties - b.penalties ||
      b.currentScore - a.currentScore ||
      a.displayName.localeCompare(b.displayName, "ru"),
    );

  return ranked.map((entry, index) => ({ ...entry, position: index + 1 }));
}
