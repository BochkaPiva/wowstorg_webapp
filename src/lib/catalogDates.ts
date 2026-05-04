/**
 * Даты каталога/корзины (локальный календарь пользователя, YYYY-MM-DD).
 * Правила: нет дат в прошлом; readyByDate ≤ startDate ≤ endDate (один день аренды — ок).
 */

import {
  coerceRentalPartsForDates,
  type RentalPartOfDay,
} from "@/lib/rental-days";

export function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const DEFAULT_RENTAL_START_PART: RentalPartOfDay = "MORNING";
export const DEFAULT_RENTAL_END_PART: RentalPartOfDay = "EVENING";

export function parseStoredRentalPart(raw: string | null, fallback: RentalPartOfDay): RentalPartOfDay {
  if (raw === "MORNING" || raw === "EVENING") return raw;
  return fallback;
}

/** Значения по умолчанию: готовность сегодня, аренда — завтра … послезавтра; половины «утро→вечер» на одном дне. */
export function getDefaultCatalogDates(): {
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
} {
  const t = todayDateOnly();
  const startDate = addDays(t, 1);
  const endDate = addDays(t, 2);
  const coerced = coerceRentalPartsForDates(startDate, endDate, DEFAULT_RENTAL_START_PART, DEFAULT_RENTAL_END_PART);
  return {
    readyByDate: t,
    startDate,
    endDate,
    rentalStartPartOfDay: coerced.rentalStartPartOfDay,
    rentalEndPartOfDay: coerced.rentalEndPartOfDay,
  };
}

/**
 * Приводит три даты к правилам (минимум — сегодня; готовность не позже начала; конец не раньше начала).
 */
export function normalizeCatalogDates(input: {
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay;
  rentalEndPartOfDay?: RentalPartOfDay;
}): {
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
} {
  const min = todayDateOnly();
  let ready = input.readyByDate >= min ? input.readyByDate : min;
  let start = input.startDate >= min ? input.startDate : min;
  let end = input.endDate >= min ? input.endDate : min;

  if (ready > start) start = ready;
  if (end < start) end = start;
  if (ready > start) ready = start;

  const startPart = input.rentalStartPartOfDay ?? DEFAULT_RENTAL_START_PART;
  const endPart = input.rentalEndPartOfDay ?? DEFAULT_RENTAL_END_PART;
  const coerced = coerceRentalPartsForDates(start, end, startPart, endPart);

  return {
    readyByDate: ready,
    startDate: start,
    endDate: end,
    rentalStartPartOfDay: coerced.rentalStartPartOfDay,
    rentalEndPartOfDay: coerced.rentalEndPartOfDay,
  };
}

export function catalogDatesFromStorage(): {
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
} {
  if (typeof window === "undefined") return getDefaultCatalogDates();
  const defs = getDefaultCatalogDates();
  const ready = localStorage.getItem("catalog_readyByDate") ?? defs.readyByDate;
  const start = localStorage.getItem("catalog_startDate") ?? defs.startDate;
  const end = localStorage.getItem("catalog_endDate") ?? defs.endDate;
  const startPart = parseStoredRentalPart(
    localStorage.getItem("catalog_rentalStartPart"),
    DEFAULT_RENTAL_START_PART,
  );
  const endPart = parseStoredRentalPart(localStorage.getItem("catalog_rentalEndPart"), DEFAULT_RENTAL_END_PART);
  return normalizeCatalogDates({
    readyByDate: ready,
    startDate: start,
    endDate: end,
    rentalStartPartOfDay: startPart,
    rentalEndPartOfDay: endPart,
  });
}

/** `dateOnly` = YYYY-MM-DD → ДД.ММ.ГГГГ */
export function formatDateRu(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

/** Парсинг ДД.ММ.ГГГГ → YYYY-MM-DD или null */
export function parseRuToDateOnly(value: string) {
  const trimmed = value.trim();
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(trimmed);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  if (!yy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0, 0));
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
