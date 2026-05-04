/**
 * Количество календарных дней аренды по двум датам YYYY-MM-DD включительно.
 * Один и тот же день → 1; 1 мая–2 мая → 2.
 */
export function rentalCalendarDaysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0;
  const ms = b.getTime() - a.getTime();
  const diffDays = Math.round(ms / 86_400_000);
  if (diffDays < 0) return 0;
  return diffDays + 1;
}

/** То же правило для `Date`: календарные UTC-дни включительно. */
export function rentalCalendarDaysInclusiveUtcDates(start: Date, end: Date): number {
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const diffDays = Math.floor((e - s) / 86_400_000);
  if (diffDays < 0) return 1;
  return diffDays + 1;
}

export type RentalPartOfDay = "MORNING" | "EVENING";

export function isRentalPartOfDay(v: string | null | undefined): v is RentalPartOfDay {
  return v === "MORNING" || v === "EVENING";
}

function utcCalendarDayIndexISO(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/**
 * Оплачиваемые единицы «дня аренды» по половинам суток (полуинтервалы [half, half+1)).
 * По умолчанию MORNING→EVENING на одном календарном дне эквивалентно классической «будням вкл.» между теми же датами.
 */
export function billableRentalDays(args: {
  startDate: Date;
  endDate: Date;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
}): number {
  const dayStart = utcCalendarDayIndexISO(args.startDate);
  const dayEnd = utcCalendarDayIndexISO(args.endDate);
  const halfStart = dayStart * 2 + (args.rentalStartPartOfDay === "MORNING" ? 0 : 1);
  /** exclusive конец последней занятой половины дня «утро» = граница после утра; для «вечер» — после вечера. */
  const halfExclusive = dayEnd * 2 + (args.rentalEndPartOfDay === "MORNING" ? 1 : 2);
  return Math.max(1, Math.floor((halfExclusive - halfStart) / 2));
}

export function billableRentalDaysFromDateOnly(args: {
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
}): number {
  const [ys, ms, ds] = args.startDate.split("-").map((v) => Number(v));
  const [ye, me, de] = args.endDate.split("-").map((v) => Number(v));
  const startDate = new Date(Date.UTC(ys, ms - 1, ds, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(ye, me - 1, de, 0, 0, 0, 0));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1;
  return billableRentalDays({
    startDate,
    endDate,
    rentalStartPartOfDay: args.rentalStartPartOfDay,
    rentalEndPartOfDay: args.rentalEndPartOfDay,
  });
}

/** За один календарный день возможна только оплата «утро → вечер». */
export function validateRentalPartCombo(args: {
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
}): { ok: true } | { ok: false; message: string } {
  if (args.startDate > args.endDate) {
    return { ok: false, message: "Дата окончания не может быть раньше даты начала" };
  }
  if (args.startDate === args.endDate) {
    if (args.rentalStartPartOfDay !== "MORNING" || args.rentalEndPartOfDay !== "EVENING") {
      return { ok: false, message: "За один календарный день возможна только аренда с утра до вечера" };
    }
  }
  return { ok: true };
}

export function coerceRentalPartsForDates(
  startDate: string,
  endDate: string,
  rentalStartPartOfDay: RentalPartOfDay,
  rentalEndPartOfDay: RentalPartOfDay,
): { rentalStartPartOfDay: RentalPartOfDay; rentalEndPartOfDay: RentalPartOfDay } {
  if (startDate === endDate) {
    return { rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING" };
  }
  return { rentalStartPartOfDay, rentalEndPartOfDay };
}

/** Короткая подпись половины суток для UI и уведомлений (Telegram и т.д.). */
export function rentalPartLabelRu(p: RentalPartOfDay): string {
  return p === "MORNING" ? "утро" : "вечер";
}

/** Одна строка «период аренды» с уже отформатированными датами (локаль клиента/API). ISO — YYYY-MM-DD для проверки «один календарный день». */
export function formatRentalPeriodRangeRu(args: {
  startDateIso: string;
  endDateIso: string;
  startDateFormatted: string;
  endDateFormatted: string;
  rentalStartPartOfDay?: RentalPartOfDay | null;
  rentalEndPartOfDay?: RentalPartOfDay | null;
}): string {
  const sp = args.rentalStartPartOfDay ?? "MORNING";
  const ep = args.rentalEndPartOfDay ?? "MORNING";
  if (args.startDateIso === args.endDateIso) {
    return `${args.startDateFormatted} (${rentalPartLabelRu(sp)} → ${rentalPartLabelRu(ep)})`;
  }
  return `${args.startDateFormatted} · ${rentalPartLabelRu(sp)} — ${args.endDateFormatted} · ${rentalPartLabelRu(ep)}`;
}

/** То же для `Date` заказа (UTC календарные даты + `toLocaleDateString("ru-RU")`). */
export function formatRentalPeriodRangeFromUtcDatesRu(args: {
  startDate: Date;
  endDate: Date;
  rentalStartPartOfDay?: RentalPartOfDay | null;
  rentalEndPartOfDay?: RentalPartOfDay | null;
}): string {
  const startIso = args.startDate.toISOString().slice(0, 10);
  const endIso = args.endDate.toISOString().slice(0, 10);
  return formatRentalPeriodRangeRu({
    startDateIso: startIso,
    endDateIso: endIso,
    startDateFormatted: args.startDate.toLocaleDateString("ru-RU"),
    endDateFormatted: args.endDate.toLocaleDateString("ru-RU"),
    rentalStartPartOfDay: args.rentalStartPartOfDay,
    rentalEndPartOfDay: args.rentalEndPartOfDay,
  });
}
