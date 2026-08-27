import type { Prisma } from "@prisma/client";

export type DatePeriodScope = { from?: string; to?: string };

function parseDateOnlyStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateOnlyEndExclusive(value: string): Date {
  const date = parseDateOnlyStart(value);
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Forecast orders belong to a period when their rental interval intersects it.
 * Requiring endDate to be inside the period drops still-active rentals that end
 * tomorrow or later, which understates the current pipeline.
 */
export function orderRentalPeriodWhere(scope: DatePeriodScope): Prisma.OrderWhereInput {
  if (!scope.from && !scope.to) return {};

  const from = scope.from ? parseDateOnlyStart(scope.from) : null;
  const toExclusive = scope.to ? parseDateOnlyEndExclusive(scope.to) : null;

  return {
    ...(toExclusive ? { startDate: { lt: toExclusive } } : {}),
    ...(from ? { endDate: { gte: from } } : {}),
  };
}
