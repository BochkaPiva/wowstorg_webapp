import type { Prisma, PrismaClient } from "@prisma/client";

import { buildEstimateXlsx } from "@/server/estimate-xlsx";
import { assertEnabledServicePricesPresent } from "@/server/orders/service-pricing";
import { putEstimateFile } from "@/server/file-storage";

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

  assertEnabledServicePricesPresent(order);

  const estimateSentSnapshot = order.lines.map((l) => ({
    orderLineId: l.id,
    itemId: l.itemId,
    requestedQty: l.requestedQty,
    pricePerDaySnapshot: l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : null,
  }));

  const estimateFileKey = `${orderId}.xlsx`;
  const xlsxBuffer = await buildEstimateXlsx(order as Parameters<typeof buildEstimateXlsx>[0]);
  await putEstimateFile(estimateFileKey, xlsxBuffer);

  return { estimateFileKey, estimateSentSnapshot, xlsxBuffer };
}

