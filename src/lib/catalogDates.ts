/**
 * Даты каталога/корзины (локальный календарь пользователя, YYYY-MM-DD).
 * Правила: нет дат в прошлом; readyByDate ≤ startDate ≤ endDate (один день аренды — ок).
 */

export function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Значения по умолчанию: готовность сегодня, аренда — завтра … послезавтра. */
export function getDefaultCatalogDates(): {
  readyByDate: string;
  startDate: string;
  endDate: string;
} {
  const t = todayDateOnly();
  return {
    readyByDate: t,
    startDate: addDays(t, 1),
    endDate: addDays(t, 2),
  };
}

/**
 * Приводит три даты к правилам (минимум — сегодня; готовность не позже начала; конец не раньше начала).
 */
export function normalizeCatalogDates(input: {
  readyByDate: string;
  startDate: string;
  endDate: string;
}): { readyByDate: string; startDate: string; endDate: string } {
  const min = todayDateOnly();
  let ready = input.readyByDate >= min ? input.readyByDate : min;
  let start = input.startDate >= min ? input.startDate : min;
  let end = input.endDate >= min ? input.endDate : min;

  if (ready > start) start = ready;
  if (end < start) end = start;
  if (ready > start) ready = start;

  return { readyByDate: ready, startDate: start, endDate: end };
}

/** Собрать даты из localStorage или дефолты, затем нормализовать (устаревшие значения поднимаются к сегодня). */
export function catalogDatesFromStorage(): {
  readyByDate: string;
  startDate: string;
  endDate: string;
} {
  if (typeof window === "undefined") return getDefaultCatalogDates();
  const defs = getDefaultCatalogDates();
  const ready = localStorage.getItem("catalog_readyByDate") ?? defs.readyByDate;
  const start = localStorage.getItem("catalog_startDate") ?? defs.startDate;
  const end = localStorage.getItem("catalog_endDate") ?? defs.endDate;
  return normalizeCatalogDates({
    readyByDate: ready,
    startDate: start,
    endDate: end,
  });
}
