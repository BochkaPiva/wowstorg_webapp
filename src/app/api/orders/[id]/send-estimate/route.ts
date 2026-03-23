import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { prisma } from "@/server/db";
import { buildEstimateXlsx } from "@/server/estimate-xlsx";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { scheduleAfterResponse } from "@/server/notifications/schedule-after-response";

const ESTIMATES_DIR = join(process.cwd(), "data", "estimates");

/** Снимок заявки без цен доп. услуг — для сравнения «склад ничего не менял после запроса изменений». */
function buildOrderSnapshotForCompare(order: {
  eventName: string | null;
  comment: string | null;
  deliveryEnabled: boolean;
  deliveryComment: string | null;
  montageEnabled: boolean;
  montageComment: string | null;
  demontageEnabled: boolean;
  demontageComment: string | null;
  lines: Array<{ itemId: string; requestedQty: number; greenwichComment: string | null }>;
}): string {
  const lines = [...order.lines]
    .map((l) => ({
      itemId: l.itemId,
      requestedQty: l.requestedQty,
      greenwichComment: (l.greenwichComment ?? "").trim() || null,
    }))
    .sort((a, b) =>
      a.itemId.localeCompare(b.itemId) ||
      a.requestedQty - b.requestedQty ||
      (a.greenwichComment ?? "").localeCompare(b.greenwichComment ?? ""),
    );
  return JSON.stringify({
    eventName: order.eventName ?? null,
    comment: (order.comment ?? "").trim() || null,
    deliveryEnabled: order.deliveryEnabled,
    deliveryComment: (order.deliveryComment ?? "").trim() || null,
    montageEnabled: order.montageEnabled,
    montageComment: (order.montageComment ?? "").trim() || null,
    demontageEnabled: order.demontageEnabled,
    demontageComment: (order.demontageComment ?? "").trim() || null,
    lines,
  });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const fullOrder = await prisma.order.findUnique({
    where: { id },
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

  if (!fullOrder) return jsonError(404, "Not found");
  const allowedStatuses = ["SUBMITTED", "CHANGES_REQUESTED"] as const;
  if (!allowedStatuses.includes(fullOrder.status as (typeof allowedStatuses)[number])) {
    return jsonError(400, "Смету можно отправить только для заявки в статусе «Новая» или «Запрошены изменения»");
  }

  const missing: string[] = [];
  if (fullOrder.deliveryEnabled && (fullOrder.deliveryPrice == null || Number(fullOrder.deliveryPrice) <= 0))
    missing.push("Доставка");
  if (fullOrder.montageEnabled && (fullOrder.montagePrice == null || Number(fullOrder.montagePrice) <= 0))
    missing.push("Монтаж");
  if (fullOrder.demontageEnabled && (fullOrder.demontagePrice == null || Number(fullOrder.demontagePrice) <= 0))
    missing.push("Демонтаж");
  if (missing.length > 0) {
    return jsonError(
      400,
      `Укажите цену для включённых доп. услуг: ${missing.join(", ")}`,
    );
  }

  const estimateSentSnapshot = fullOrder.lines.map((l) => ({
    orderLineId: l.id,
    itemId: l.itemId,
    requestedQty: l.requestedQty,
    pricePerDaySnapshot: l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : null,
  }));

  const estimateFileKey = `${id}.xlsx`;
  let xlsxBuffer: Buffer;
  try {
    mkdirSync(ESTIMATES_DIR, { recursive: true });
    xlsxBuffer = await buildEstimateXlsx(fullOrder as Parameters<typeof buildEstimateXlsx>[0]);
    writeFileSync(join(ESTIMATES_DIR, estimateFileKey), xlsxBuffer);
  } catch (e) {
    console.error("[send-estimate] failed to write xlsx:", e);
    return jsonError(500, "Не удалось сформировать файл сметы");
  }

  let newStatus: "ESTIMATE_SENT" | "APPROVED_BY_GREENWICH" = "ESTIMATE_SENT";
  if (fullOrder.status === "CHANGES_REQUESTED" && fullOrder.changesRequestedSnapshot != null) {
    const currentStr = buildOrderSnapshotForCompare({
      eventName: fullOrder.eventName,
      comment: fullOrder.comment,
      deliveryEnabled: fullOrder.deliveryEnabled,
      deliveryComment: fullOrder.deliveryComment,
      montageEnabled: fullOrder.montageEnabled,
      montageComment: fullOrder.montageComment,
      demontageEnabled: fullOrder.demontageEnabled,
      demontageComment: fullOrder.demontageComment,
      lines: fullOrder.lines.map((l) => ({
        itemId: l.itemId,
        requestedQty: l.requestedQty,
        greenwichComment: l.greenwichComment,
      })),
    });
    const r = fullOrder.changesRequestedSnapshot as Record<string, unknown> | null;
    if (r && typeof r === "object" && Array.isArray(r.lines)) {
      const requestedStr = buildOrderSnapshotForCompare({
        eventName: (r.eventName as string) ?? null,
        comment: (r.comment as string) ?? null,
        deliveryEnabled: Boolean(r.deliveryEnabled),
        deliveryComment: (r.deliveryComment as string) ?? null,
        montageEnabled: Boolean(r.montageEnabled),
        montageComment: (r.montageComment as string) ?? null,
        demontageEnabled: Boolean(r.demontageEnabled),
        demontageComment: (r.demontageComment as string) ?? null,
        lines: (r.lines as Array<{ itemId: string; requestedQty: number; greenwichComment?: string | null }>).map(
          (l) => ({
            itemId: l.itemId,
            requestedQty: l.requestedQty,
            greenwichComment: l.greenwichComment ?? null,
          }),
        ),
      });
      if (currentStr === requestedStr) {
        newStatus = "APPROVED_BY_GREENWICH";
      }
    }
  }

  await prisma.order.update({
    where: { id },
    data: {
      status: newStatus,
      estimateSentAt: new Date(),
      estimateSentSnapshot: estimateSentSnapshot as unknown as object,
      estimateFileKey,
      ...(newStatus === "APPROVED_BY_GREENWICH"
        ? {
            greenwichConfirmedAt: new Date(),
            greenwichConfirmedSnapshot: estimateSentSnapshot as unknown as object,
          }
        : {}),
    },
  });

  const orderForNotify = fullOrder as Parameters<
    typeof import("@/server/notifications/order-notifications").notifyEstimateSent
  >[0];
  const estimateFile = { buffer: xlsxBuffer, fileName: `smeta-${id}.xlsx` };
  scheduleAfterResponse("notifyEstimateSent", async () => {
    const { notifyEstimateSent } = await import("@/server/notifications/order-notifications");
    await notifyEstimateSent(orderForNotify, estimateFile);
  });

  return jsonOk({ ok: true });
}
