import type {
  Condition,
  GreenwichRatingEventType,
  ItemType,
  Prisma,
} from "@prisma/client";

/** Рабочий день и сравнение «календарных дней» — по Омску. */
const OMSK_TZ = "Asia/Omsk";

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
 * Штраф: −7 за каждый полный день после дедлайна.
 */
export function computeGreenwichOverdueDelta(endDate: Date, declaredAt: Date): number {
  const endYmd = utcDateOnlyToYmd(endDate);
  const deadlineInclusiveYmd = addCalendarDaysUtcYmd(endYmd, 1);
  const declaredYmd = dateTimeToYmdInTimeZone(declaredAt, OMSK_TZ);
  const overdueDays = Math.max(0, ymdDiffDays(declaredYmd, deadlineInclusiveYmd));
  return -7 * overdueDays;
}

export function computeGreenwichIncidentsDelta(
  rows: Array<{ condition: Condition; qty: number; itemType: ItemType }>,
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
  return 10 - broken - 3 * lost;
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
    recoverable?: boolean;
    now?: Date;
  },
): Promise<boolean> {
  const now = args.now ?? new Date();
  const policy = await tx.greenwichRatingPolicy.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
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
): Promise<void> {
  const [orders, events] = await Promise.all([tx.order.findMany({
    where: { greenwichUserId: userId },
    select: {
      greenwichRatingOverdueDelta: true,
      greenwichRatingIncidentsDelta: true,
    },
  }), tx.greenwichRatingEvent.findMany({
    where: { userId },
    select: { delta: true, recoveryStartsAt: true, recoveryEndsAt: true },
  })]);
  const sum = orders.reduce(
    (s, o) => s + o.greenwichRatingOverdueDelta + o.greenwichRatingIncidentsDelta,
    0,
  );

  const eventSum = events.reduce((total, event) => total + effectiveRatingEventDelta(event, now), 0);
  const score = Math.max(0, Math.min(100, 100 + sum + eventSum));

  await tx.$executeRaw`
    INSERT INTO "GreenwichRating" ("userId", "score", "manualLocked", "updatedAt")
    VALUES (${userId}, ${score}, false, NOW())
    ON CONFLICT ("userId") DO UPDATE
    SET "score" = EXCLUDED."score",
        "manualLocked" = false,
        "updatedAt" = NOW()
  `;
}
