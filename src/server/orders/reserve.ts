import type { OrderStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { RentalPartOfDay } from "@/lib/rental-days";
import { rentalHalfIntervalsOverlap, rentalOccupiedHalfInterval } from "@/lib/rental-days";

const ACTIVE_STATUSES: OrderStatus[] = [
  "SUBMITTED",
  "ESTIMATE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_BY_GREENWICH",
  "PICKING",
  "ISSUED",
  "RETURN_DECLARED",
];

export async function getReservedQtyByItemId(args: {
  db: Prisma.TransactionClient | PrismaClient;
  startDate: Date;
  endDate: Date;
  /** Запрашиваемый период (утро/вечер на краях), по договорённости как у заказа. */
  rentalStartPartOfDay: RentalPartOfDay;
  rentalEndPartOfDay: RentalPartOfDay;
  excludeOrderId?: string;
}) {
  const { db, startDate, endDate, rentalStartPartOfDay, rentalEndPartOfDay, excludeOrderId } = args;

  const requested = rentalOccupiedHalfInterval({
    startDate,
    endDate,
    rentalStartPartOfDay,
    rentalEndPartOfDay,
  });
  if (requested.halfExclusive <= requested.halfStart) {
    return new Map<string, number>();
  }

  // Грубый фильтр по календарю (необходимое условие пересечения половин).
  const lines = await db.orderLine.findMany({
    where: {
      order: {
        status: { in: ACTIVE_STATUSES },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    },
    select: {
      itemId: true,
      requestedQty: true,
      approvedQty: true,
      issuedQty: true,
      order: {
        select: {
          startDate: true,
          endDate: true,
          rentalStartPartOfDay: true,
          rentalEndPartOfDay: true,
        },
      },
    },
  });

  const reserved = new Map<string, number>();
  for (const l of lines) {
    const o = l.order;
    const other = rentalOccupiedHalfInterval({
      startDate: o.startDate,
      endDate: o.endDate,
      rentalStartPartOfDay: o.rentalStartPartOfDay,
      rentalEndPartOfDay: o.rentalEndPartOfDay,
    });
    if (other.halfExclusive <= other.halfStart) continue;
    if (!rentalHalfIntervalsOverlap(requested, other)) continue;

    const qty = l.issuedQty ?? l.approvedQty ?? l.requestedQty;
    reserved.set(l.itemId, (reserved.get(l.itemId) ?? 0) + qty);
  }

  return reserved;
}
