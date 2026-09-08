export const CONTRACTOR_PRICE_TYPE_LABEL = {
  FIXED: "Фиксированная",
  FROM: "От",
  RANGE: "Диапазон",
  PER_PERSON: "За человека",
  PER_HOUR: "За час",
  PER_DAY: "За день",
  PER_UNIT: "За единицу",
  ON_REQUEST: "По запросу",
} as const;

export type ContractorPriceType = keyof typeof CONTRACTOR_PRICE_TYPE_LABEL;

export function proposalLineTotal(unitPrice: number | null, qty: number) {
  if (unitPrice == null || !Number.isFinite(unitPrice) || !Number.isFinite(qty)) return null;
  return Math.round(unitPrice * qty * 100) / 100;
}

export function priceFreshness(confirmedAt: string | Date | null, now = new Date()) {
  if (!confirmedAt) return "UNKNOWN" as const;
  const date = new Date(confirmedAt);
  const ageDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (ageDays <= 90) return "FRESH" as const;
  if (ageDays <= 180) return "AGING" as const;
  return "STALE" as const;
}

