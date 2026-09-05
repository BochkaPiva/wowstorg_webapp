import type { Prisma } from "@prisma/client";

/** Order incidents are part of Item buckets, never an additional stock pool. */
export async function getLinkedBalances(db: Prisma.TransactionClient, itemId: string) {
  const [incidents, losses] = await Promise.all([
    db.incident.findMany({ where: { status: "OPEN", orderLine: { itemId } }, select: { condition: true, qty: true, repairedQty: true, utilizedQty: true } }),
    db.lossRecord.findMany({ where: { itemId, status: "OPEN", orderId: { not: null } }, select: { qty: true, foundQty: true, writtenOffQty: true } }),
  ]);
  const balance = { inRepair: 0, broken: 0, missing: 0 };
  for (const row of incidents) {
    const remaining = Math.max(0, row.qty - row.repairedQty - row.utilizedQty);
    if (row.condition === "NEEDS_REPAIR") balance.inRepair += remaining;
    if (row.condition === "BROKEN") balance.broken += remaining;
  }
  for (const row of losses) balance.missing += Math.max(0, row.qty - row.foundQty - row.writtenOffQty);
  return balance;
}

export function unlinkedQuantity(total: number, linked: number) {
  return Math.max(0, total - linked);
}
