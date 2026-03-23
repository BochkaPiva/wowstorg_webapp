import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Prisma, PrismaClient } from "@prisma/client";

import { buildEstimateXlsx } from "@/server/estimate-xlsx";

const ESTIMATES_DIR = join(process.cwd(), "data", "estimates");

type Db = Prisma.TransactionClient | PrismaClient;

export type EstimateArtifacts = {
  estimateFileKey: string;
  estimateSentSnapshot: Array<{
    orderLineId: string;
    itemId: string;
    requestedQty: number;
    pricePerDaySnapshot: number | null;
  }>;
  xlsxBuffer: Buffer;
};

export async function makeEstimateArtifactsForOrder(db: Db, orderId: string): Promise<EstimateArtifacts> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { displayName: true } },
      greenwichUser: { select: { displayName: true } },
      lines: {
        orderBy: [{ position: "asc" }],
        include: { item: { select: { name: true } } },
      },
    },
  });
  if (!order) throw new Error("NOT_FOUND");

  const missing: string[] = [];
  if (order.deliveryEnabled && (order.deliveryPrice == null || Number(order.deliveryPrice) <= 0)) {
    missing.push("Доставка");
  }
  if (order.montageEnabled && (order.montagePrice == null || Number(order.montagePrice) <= 0)) {
    missing.push("Монтаж");
  }
  if (order.demontageEnabled && (order.demontagePrice == null || Number(order.demontagePrice) <= 0)) {
    missing.push("Демонтаж");
  }
  if (missing.length > 0) {
    throw new Error(`MISSING_SERVICE_PRICES:${missing.join(",")}`);
  }

  const estimateSentSnapshot = order.lines.map((l) => ({
    orderLineId: l.id,
    itemId: l.itemId,
    requestedQty: l.requestedQty,
    pricePerDaySnapshot: l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : null,
  }));

  const estimateFileKey = `${orderId}.xlsx`;
  mkdirSync(ESTIMATES_DIR, { recursive: true });
  const xlsxBuffer = await buildEstimateXlsx(order as Parameters<typeof buildEstimateXlsx>[0]);
  writeFileSync(join(ESTIMATES_DIR, estimateFileKey), xlsxBuffer);

  return { estimateFileKey, estimateSentSnapshot, xlsxBuffer };
}

