import type { OrderStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

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
  excludeOrderId?: string;
}) {
  const { db, startDate, endDate, excludeOrderId } = args;

  // Пересечение диапазонов (инклюзивно по дням).
  // Любое пересечение дат считается занятостью, включая граничные дни:
  // overlap если other.start <= end && other.end >= start
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
    },
  });

  const reserved = new Map<string, number>();
  for (const l of lines) {
    const qty = l.issuedQty ?? l.approvedQty ?? l.requestedQty;
    reserved.set(l.itemId, (reserved.get(l.itemId) ?? 0) + qty);
  }

  return reserved;
}

