import { z } from "zod";

import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function parseDateOnlyStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateOnlyEndExclusive(value: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const d = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return d === 0 ? 1 : d;
}

/**
 * Рентабельность по позициям:
 * - считаем только CLOSED заявки;
 * - в периоде фильтруем по endDate заказа (date-only);
 * - учитываем только позиции с заданной purchasePricePerUnit.
 */
export async function GET(req: Request) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, "Invalid query", parsed.error.flatten());
  }
  const { from, to } = parsed.data;
  if (from && to && from > to) {
    return jsonError(400, "`from` must be <= `to`");
  }

  const closedOrders = await prisma.order.findMany({
    where: {
      status: "CLOSED",
      ...(from || to
        ? {
            endDate: {
              ...(from ? { gte: parseDateOnlyStart(from) } : {}),
              ...(to ? { lt: parseDateOnlyEndExclusive(to) } : {}),
            },
          }
        : {}),
    },
    select: {
      startDate: true,
      endDate: true,
      payMultiplier: true,
      lines: {
        select: {
          itemId: true,
          requestedQty: true,
          issuedQty: true,
          pricePerDaySnapshot: true,
        },
      },
    },
  });

  const trackedItems = await prisma.item.findMany({
    where: {
      purchasePricePerUnit: { not: null },
    },
    select: {
      id: true,
      name: true,
      type: true,
      total: true,
      purchasePricePerUnit: true,
      internalOnly: true,
      isActive: true,
    },
    orderBy: [{ name: "asc" }],
  });

  const revenueByItemId = new Map<string, number>();
  for (const o of closedOrders) {
    const days = daysBetween(o.startDate, o.endDate);
    const mult = o.payMultiplier != null ? Number(o.payMultiplier) : 1;
    for (const l of o.lines) {
      const price = l.pricePerDaySnapshot != null ? Number(l.pricePerDaySnapshot) : 0;
      const qty = l.issuedQty ?? l.requestedQty;
      const lineRevenue = price * qty * days * mult;
      revenueByItemId.set(l.itemId, (revenueByItemId.get(l.itemId) ?? 0) + lineRevenue);
    }
  }

  const rows = trackedItems.map((it) => {
    const unitCost = Number(it.purchasePricePerUnit ?? 0);
    const purchaseCost = unitCost * it.total;
    const revenue = revenueByItemId.get(it.id) ?? 0;
    const grossProfit = revenue - purchaseCost;
    const paybackRatio = purchaseCost > 0 ? revenue / purchaseCost : null;
    const roiPercent = purchaseCost > 0 ? ((revenue - purchaseCost) / purchaseCost) * 100 : null;
    return {
      itemId: it.id,
      itemName: it.name,
      itemType: it.type,
      totalQty: it.total,
      unitPurchasePrice: Math.round(unitCost * 100) / 100,
      purchaseCost: Math.round(purchaseCost),
      revenue: Math.round(revenue),
      grossProfit: Math.round(grossProfit),
      paybackRatio: paybackRatio == null ? null : Math.round(paybackRatio * 10000) / 10000,
      roiPercent: roiPercent == null ? null : Math.round(roiPercent * 100) / 100,
      internalOnly: it.internalOnly,
      isActive: it.isActive,
    };
  });

  rows.sort((a, b) => b.revenue - a.revenue || (b.roiPercent ?? -Infinity) - (a.roiPercent ?? -Infinity));

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalPurchaseCost = rows.reduce((s, r) => s + r.purchaseCost, 0);
  const totalGrossProfit = totalRevenue - totalPurchaseCost;
  const totalPaybackRatio = totalPurchaseCost > 0 ? totalRevenue / totalPurchaseCost : null;
  const totalRoiPercent = totalPurchaseCost > 0 ? ((totalRevenue - totalPurchaseCost) / totalPurchaseCost) * 100 : null;

  return jsonOk({
    period: { from: from ?? null, to: to ?? null, dateBasis: "order.endDate" as const },
    summary: {
      trackedItems: rows.length,
      itemsWithRevenue: rows.filter((r) => r.revenue > 0).length,
      totalRevenue: Math.round(totalRevenue),
      totalPurchaseCost: Math.round(totalPurchaseCost),
      totalGrossProfit: Math.round(totalGrossProfit),
      totalPaybackRatio: totalPaybackRatio == null ? null : Math.round(totalPaybackRatio * 10000) / 10000,
      totalRoiPercent: totalRoiPercent == null ? null : Math.round(totalRoiPercent * 100) / 100,
    },
    rows,
  });
}

