import type { Condition, ItemType, Prisma } from "@prisma/client";

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

export async function recomputeGreenwichRatingScore(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const orders = await tx.order.findMany({
    where: { greenwichUserId: userId },
    select: {
      greenwichRatingOverdueDelta: true,
      greenwichRatingIncidentsDelta: true,
    },
  });
  const sum = orders.reduce(
    (s, o) => s + o.greenwichRatingOverdueDelta + o.greenwichRatingIncidentsDelta,
    0,
  );
  const score = Math.max(0, Math.min(100, 100 + sum));
  await tx.greenwichRating.upsert({
    where: { userId },
    create: { userId, score },
    update: { score },
  });
}
