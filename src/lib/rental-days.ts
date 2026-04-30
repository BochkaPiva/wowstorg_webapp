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
