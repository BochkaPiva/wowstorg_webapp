/** Количество суток аренды по датам заказа (включительно, UTC-календарные дни). */
export function inclusiveRentalDays(start: Date, end: Date): number {
  const a = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}
