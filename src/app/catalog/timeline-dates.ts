import { coerceRentalPartsForDates, type RentalPartOfDay } from "@/lib/rental-days";

export type ScheduleDates = {
  readyByDate: string; startDate: string; endDate: string;
  rentalStartPartOfDay: RentalPartOfDay; rentalEndPartOfDay: RentalPartOfDay;
};
export type DateMarker = "readyByDate" | "startDate" | "endDate";
const DAY = 86_400_000;
export const LAST_TIMELINE_DAY = Math.floor(Date.parse("9999-12-31T00:00:00Z") / DAY);
export const TIMELINE_DAYS = 121;

/** Keep boundary controls attached to the axis without collisions at its edges. */
export function timelineControlLayout(points: number[], available: number) {
  const gap = Math.min(12, available / Math.max(1, points.length - 1));
  const width = Math.max(0, Math.min(164, (available - gap * (points.length - 1)) / points.length));
  const positions = points.map(point => Math.max(0, Math.min(available - width, point - width / 2)));
  for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i], positions[i - 1] + width + gap);
  if (positions.length) positions[positions.length - 1] = Math.min(positions[positions.length - 1], available - width);
  for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i], positions[i + 1] - width - gap);
  return { positions, width };
}

/** Integer calendar days: no local DST/23-hour-day arithmetic. */
export function timelineDay(value: string) { return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY); }
export function timelineDate(day: number) { return new Date(Math.min(LAST_TIMELINE_DAY, day) * DAY).toISOString().slice(0, 10); }
export function timelineAnchor(dates: ScheduleDates, minDate: string) {
  return Math.min(LAST_TIMELINE_DAY - TIMELINE_DAYS + 1, Math.max(timelineDay(minDate), timelineDay(dates.readyByDate) - 2));
}
export function moveDateMarker(dates: ScheduleDates, marker: DateMarker, day: number, minDate: string): ScheduleDates {
  const min = timelineDay(minDate);
  const next = timelineDate(Math.max(min, Math.min(LAST_TIMELINE_DAY, Math.round(day))));
  const result = { ...dates };
  if (marker === "readyByDate") result.readyByDate = next > dates.startDate ? dates.startDate : next;
  if (marker === "startDate") {
    result.startDate = next < dates.readyByDate ? dates.readyByDate : next;
    if (result.endDate < result.startDate) result.endDate = result.startDate;
  }
  if (marker === "endDate") result.endDate = next < dates.startDate ? dates.startDate : next;
  return { ...result, ...coerceRentalPartsForDates(result.startDate, result.endDate, result.rentalStartPartOfDay, result.rentalEndPartOfDay) };
}
export function rentalDayWord(days: number) {
  const last = days % 10, teen = days % 100;
  return teen >= 11 && teen <= 14 ? "дней" : last === 1 ? "день" : last >= 2 && last <= 4 ? "дня" : "дней";
}
