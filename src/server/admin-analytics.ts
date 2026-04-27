import { prisma } from "@/server/db";
import { calcOrderPricing, daysBetween } from "@/server/orders/order-pricing";

export type AnalyticsScope = { from?: string; to?: string };

export type AdminAnalyticsData = {
  period: { from: string | null; to: string | null; dateBasis: "order.endDate" };
  kpi: {
    ordersTotal: number;
    ordersClosed: number;
    totalRevenue: number;
    itemsRevenue: number;
    servicesRevenue: number;
    averageOrderRevenue: number;
    averageRentalDays: number;
  };
  breakdowns: {
    byStatus: Array<{ status: string; count: number }>;
    bySource: Array<{ source: string; count: number; revenue: number }>;
    revenueByMonth: Array<{ month: string; revenue: number; orders: number }>;
  };
  tops: {
    topByIssued: Array<{ itemId: string; itemName: string; issuedQty: number }>;
    topByRevenue: Array<{ itemId: string; itemName: string; revenue: number }>;
    topCustomers: Array<{ customerId: string; customerName: string; total: number }>;
  };
  services: {
    deliveryRevenue: number;
    montageRevenue: number;
    demontageRevenue: number;
    deliveryOrders: number;
    montageOrders: number;
    demontageOrders: number;
  };
  profitability: {
    summary: {
      trackedItems: number;
      itemsWithRevenue: number;
      totalRevenue: number;
      totalPurchaseCost: number;
      totalGrossProfit: number;
      totalPaybackRatio: number | null;
      totalRoiPercent: number | null;
    };
    rows: Array<{
      itemId: string;
      itemName: string;
      itemType: string;
      totalQty: number;
      unitPurchasePrice: number;
      purchaseCost: number;
      revenue: number;
      grossProfit: number;
      paybackRatio: number | null;
      roiPercent: number | null;
      internalOnly: boolean;
      isActive: boolean;
    }>;
  };
};

function parseDateOnlyStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateOnlyEndExclusive(value: string): Date {
  const d = new Date(`${value}T00:00:00.000Z`);
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export async function getAdminAnalyticsData(scope: AnalyticsScope): Promise<AdminAnalyticsData> {
  const { from, to } = scope;
  const periodWhere =
    from || to
      ? {
          endDate: {
            ...(from ? { gte: parseDateOnlyStart(from) } : {}),
            ...(to ? { lt: parseDateOnlyEndExclusive(to) } : {}),
          },
        }
      : {};

  const [orders, closedOrders, trackedItems] = await Promise.all([
    prisma.order.findMany({
      where: periodWhere,
      select: { id: true, status: true, source: true },
    }),
    prisma.order.findMany({
      where: { status: "CLOSED", ...periodWhere },
      select: {
        source: true,
        startDate: true,
        endDate: true,
        payMultiplier: true,
        deliveryPrice: true,
        montagePrice: true,
        demontagePrice: true,
        rentalDiscountType: true,
        rentalDiscountPercent: true,
        rentalDiscountAmount: true,
        customerId: true,
        customer: { select: { name: true } },
        lines: {
          select: {
            itemId: true,
            item: { select: { name: true } },
            requestedQty: true,
            issuedQty: true,
            pricePerDaySnapshot: true,
          },
        },
      },
    }),
    prisma.item.findMany({
      where: { purchasePricePerUnit: { not: null } },
      select: {
        id: true,
        name: true,
        type: true,
        total: true,
        purchasePricePerUnit: true,
        internalOnly: true,
        isActive: true,
      },
    }),
  ]);

  const statusMap = new Map<string, number>();
  const sourceMap = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);
    sourceMap.set(o.source, {
      count: (sourceMap.get(o.source)?.count ?? 0) + 1,
      revenue: sourceMap.get(o.source)?.revenue ?? 0,
    });
  }

  const itemIssued = new Map<string, number>();
  const itemRevenue = new Map<string, { name: string; revenue: number }>();
  const customerTotal = new Map<string, { name: string; total: number }>();
  const revenueByMonth = new Map<string, { revenue: number; orders: number }>();
  const revenueByItemForProfitability = new Map<string, number>();

  let totalItemsRevenue = 0;
  let totalServiceRevenue = 0;
  let totalRentalDays = 0;

  for (const order of closedOrders) {
    const days = daysBetween(order.startDate, order.endDate);
    totalRentalDays += days;
    const pricing = calcOrderPricing({
      startDate: order.startDate,
      endDate: order.endDate,
      payMultiplier: order.payMultiplier,
      deliveryPrice: order.deliveryPrice,
      montagePrice: order.montagePrice,
      demontagePrice: order.demontagePrice,
      lines: order.lines,
      discount: order,
      quantityMode: "issued",
    });
    let orderItemsRevenue = pricing.rentalSubtotalAfterDiscount;

    for (const [idx, line] of order.lines.entries()) {
      const qty = line.issuedQty ?? line.requestedQty;
      const lineRevenue = pricing.lineAllocations[idx]?.rentalAfterDiscount ?? 0;

      itemIssued.set(line.itemId, (itemIssued.get(line.itemId) ?? 0) + qty);
      itemRevenue.set(line.itemId, {
        name: line.item.name,
        revenue: (itemRevenue.get(line.itemId)?.revenue ?? 0) + lineRevenue,
      });
      revenueByItemForProfitability.set(
        line.itemId,
        (revenueByItemForProfitability.get(line.itemId) ?? 0) + lineRevenue,
      );
    }

    const services = pricing.servicesTotal;
    totalServiceRevenue += services;
    totalItemsRevenue += orderItemsRevenue;

    const orderRevenue = Math.round(orderItemsRevenue + services);
    customerTotal.set(order.customerId, {
      name: order.customer.name,
      total: (customerTotal.get(order.customerId)?.total ?? 0) + orderRevenue,
    });

    sourceMap.set(order.source, {
      count: sourceMap.get(order.source)?.count ?? 0,
      revenue: (sourceMap.get(order.source)?.revenue ?? 0) + orderRevenue,
    });

    const mk = monthKey(order.endDate);
    revenueByMonth.set(mk, {
      revenue: (revenueByMonth.get(mk)?.revenue ?? 0) + orderRevenue,
      orders: (revenueByMonth.get(mk)?.orders ?? 0) + 1,
    });
  }

  const topByIssued = [...itemIssued.entries()]
    .map(([itemId, qty]) => ({ itemId, itemName: itemRevenue.get(itemId)?.name ?? "—", issuedQty: qty }))
    .sort((a, b) => b.issuedQty - a.issuedQty)
    .slice(0, 20);
  const topByRevenue = [...itemRevenue.entries()]
    .map(([itemId, v]) => ({ itemId, itemName: v.name, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);
  const topCustomers = [...customerTotal.entries()]
    .map(([customerId, v]) => ({ customerId, customerName: v.name, total: Math.round(v.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const profitabilityRows = trackedItems
    .map((it) => {
      const unitCost = Number(it.purchasePricePerUnit ?? 0);
      const purchaseCost = unitCost * it.total;
      const revenue = revenueByItemForProfitability.get(it.id) ?? 0;
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
    })
    .sort((a, b) => b.revenue - a.revenue || (b.roiPercent ?? -Infinity) - (a.roiPercent ?? -Infinity));

  const totalRevenue = Math.round(totalItemsRevenue + totalServiceRevenue);
  const totalProfitabilityRevenue = profitabilityRows.reduce((s, r) => s + r.revenue, 0);
  const totalPurchaseCost = profitabilityRows.reduce((s, r) => s + r.purchaseCost, 0);
  const totalGrossProfit = totalProfitabilityRevenue - totalPurchaseCost;
  const totalPaybackRatio = totalPurchaseCost > 0 ? totalProfitabilityRevenue / totalPurchaseCost : null;
  const totalRoiPercent =
    totalPurchaseCost > 0 ? ((totalProfitabilityRevenue - totalPurchaseCost) / totalPurchaseCost) * 100 : null;

  return {
    period: { from: from ?? null, to: to ?? null, dateBasis: "order.endDate" },
    kpi: {
      ordersTotal: orders.length,
      ordersClosed: closedOrders.length,
      totalRevenue,
      itemsRevenue: Math.round(totalItemsRevenue),
      servicesRevenue: Math.round(totalServiceRevenue),
      averageOrderRevenue: closedOrders.length > 0 ? Math.round(totalRevenue / closedOrders.length) : 0,
      averageRentalDays: closedOrders.length > 0 ? Math.round((totalRentalDays / closedOrders.length) * 100) / 100 : 0,
    },
    breakdowns: {
      byStatus: [...statusMap.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      bySource: [...sourceMap.entries()]
        .map(([source, v]) => ({ source, count: v.count, revenue: Math.round(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue),
      revenueByMonth: [...revenueByMonth.entries()]
        .map(([month, v]) => ({ month, revenue: Math.round(v.revenue), orders: v.orders }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    },
    tops: { topByIssued, topByRevenue, topCustomers },
    services: {
      deliveryRevenue: Math.round(closedOrders.reduce((s, o) => s + (o.deliveryPrice != null ? Number(o.deliveryPrice) : 0), 0)),
      montageRevenue: Math.round(closedOrders.reduce((s, o) => s + (o.montagePrice != null ? Number(o.montagePrice) : 0), 0)),
      demontageRevenue: Math.round(closedOrders.reduce((s, o) => s + (o.demontagePrice != null ? Number(o.demontagePrice) : 0), 0)),
      deliveryOrders: closedOrders.filter((o) => (o.deliveryPrice != null ? Number(o.deliveryPrice) : 0) > 0).length,
      montageOrders: closedOrders.filter((o) => (o.montagePrice != null ? Number(o.montagePrice) : 0) > 0).length,
      demontageOrders: closedOrders.filter((o) => (o.demontagePrice != null ? Number(o.demontagePrice) : 0) > 0).length,
    },
    profitability: {
      summary: {
        trackedItems: profitabilityRows.length,
        itemsWithRevenue: profitabilityRows.filter((r) => r.revenue > 0).length,
        totalRevenue: Math.round(totalProfitabilityRevenue),
        totalPurchaseCost: Math.round(totalPurchaseCost),
        totalGrossProfit: Math.round(totalGrossProfit),
        totalPaybackRatio: totalPaybackRatio == null ? null : Math.round(totalPaybackRatio * 10000) / 10000,
        totalRoiPercent: totalRoiPercent == null ? null : Math.round(totalRoiPercent * 100) / 100,
      },
      rows: profitabilityRows,
    },
  };
}

