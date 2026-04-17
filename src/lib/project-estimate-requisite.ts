function toFiniteNumber(value: unknown): number | null {
  const num =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : value == null || value === ""
        ? NaN
        : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function normalizeProjectEstimateDays(value: unknown): number | null {
  const num = toFiniteNumber(value);
  if (num == null) return null;
  return Math.max(1, Math.round(num));
}

export function calcProjectEstimateRequisiteTotal(args: {
  pricePerDay: unknown;
  qty: unknown;
  plannedDays: unknown;
  payMultiplier?: unknown;
}): number | null {
  const pricePerDay = toFiniteNumber(args.pricePerDay);
  const qty = toFiniteNumber(args.qty);
  const plannedDays = normalizeProjectEstimateDays(args.plannedDays);
  const payMultiplier = toFiniteNumber(args.payMultiplier) ?? 1;
  if (pricePerDay == null || qty == null || plannedDays == null || qty <= 0 || pricePerDay < 0) {
    return null;
  }
  return Math.round(pricePerDay * qty * plannedDays * payMultiplier);
}

export function calcProjectEstimateRequisiteUnitPricePerDay(args: {
  totalClient: unknown;
  qty: unknown;
  plannedDays: unknown;
}): number | null {
  const totalClient = toFiniteNumber(args.totalClient);
  const qty = toFiniteNumber(args.qty);
  const plannedDays = normalizeProjectEstimateDays(args.plannedDays);
  if (totalClient == null || qty == null || plannedDays == null || qty <= 0) return null;
  return Math.round(totalClient / qty / plannedDays);
}
