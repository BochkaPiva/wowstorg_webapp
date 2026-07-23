import { OrderStatus, ProjectStatus, type Prisma } from "@prisma/client";

import { normalizedLocalLineCostClientNumber } from "@/lib/project-estimate-local-line";
import {
  calcProjectEstimateRequisiteTotal,
  normalizeProjectEstimateDays,
} from "@/lib/project-estimate-requisite";
import {
  calcProjectEstimateTotals,
  getNumericAmount,
  PROJECT_ESTIMATE_COMMISSION_RATE,
  PROJECT_ESTIMATE_TAX_RATE,
} from "@/lib/project-estimate-totals";
import {
  calcCashInternalCostTaxAmount,
  calcOrderServicesInternalCosts,
  calcWarehouseProfitEstimate,
  isCashPaymentMethod,
} from "@/lib/order-service-internal-costs";
import { prisma } from "@/server/db";
import { calcOrderPricing } from "@/server/orders/order-pricing";

export type AnalyticsScope = { from?: string; to?: string };

export type AnalyticsPeriod = {
  from: string | null;
  to: string | null;
  dateBasis: {
    requisites: "order.endDate";
    projects: "project.eventStartDate/eventEndDate";
    customers: "project.eventStartDate/eventEndDate + order.endDate";
  };
};

export type RequisiteAnalyticsData = {
  kpi: {
    ordersTotal: number;
    ordersClosed: number;
    totalRevenue: number;
    itemsRevenue: number;
    servicesRevenue: number;
    profitEstimate: number;
    averageOrderRevenue: number;
    averageRentalDays: number;
    linkedOrdersExcluded: number;
    linkedClosedOrdersExcluded: number;
  };
  forecast: {
    ordersTotal: number;
    totalRevenue: number;
    profitEstimate: number;
  };
  breakdowns: {
    byStatus: Array<{ status: string; count: number }>;
    bySource: Array<{ source: string; count: number; revenue: number }>;
    revenueByMonth: Array<{ month: string; revenue: number; profit: number; orders: number }>;
  };
  tops: {
    topByIssued: Array<{ itemId: string; itemName: string; issuedQty: number }>;
    topByRevenue: Array<{ itemId: string; itemName: string; revenue: number }>;
    topCustomers: Array<{ customerId: string; customerName: string; total: number }>;
    customerTotals: Array<{ customerId: string; customerName: string; total: number }>;
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

export type ProjectFinancials = {
  clientSubtotal: number;
  internalSubtotal: number;
  cashInternalCostTax: number;
  internalExpensesTotal: number;
  commission: number;
  clientChargeTax: number;
  revenueTotal: number;
  tax: number;
  grossMargin: number;
  marginAfterTax: number;
  marginAfterTaxPct: number;
};

export type ProjectAnalyticsRow = {
  projectId: string;
  title: string;
  customerId: string;
  customerName: string;
  status: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  eventDateConfirmed: boolean;
  ordersCount: number;
  estimateVersionsCount: number;
  hasPrimaryEstimate: boolean;
  hasLinkedOrder: boolean;
  daysSinceActivity: number;
  currentStatusAgeDays: number;
  healthScore: number;
  risks: string[];
  financials: ProjectFinancials;
};

export type ProjectAnalyticsData = {
  kpi: {
    projectsTotal: number;
    activeProjects: number;
    completedProjects: number;
    cancelledProjects: number;
    archivedProjects: number;
    withPrimaryEstimate: number;
    withoutPrimaryEstimate: number;
    withLinkedOrder: number;
    withoutLinkedOrder: number;
    confirmedDates: number;
    completionRatePercent: number;
    cancelRatePercent: number;
    forecastRevenueTotal: number;
    forecastMarginAfterTax: number;
    actualRevenueTotal: number;
    actualMarginAfterTax: number;
    averageForecastRevenue: number;
    averageMarginAfterTaxPercent: number;
    averageOrdersPerProject: number;
    averageEstimateVersions: number;
    stale7Days: number;
    stale14Days: number;
    lowMarginProjects: number;
  };
  funnel: {
    created: number;
    withPrimaryEstimate: number;
    withConfirmedDates: number;
    withLinkedOrder: number;
    completed: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  statusAging: Array<{ status: string; projects: number; averageCurrentAgeDays: number; maxCurrentAgeDays: number }>;
  topByRevenue: ProjectAnalyticsRow[];
  topByMargin: ProjectAnalyticsRow[];
  lowMargin: ProjectAnalyticsRow[];
  risks: ProjectAnalyticsRow[];
  rows: ProjectAnalyticsRow[];
};

export type CustomerAnalyticsData = {
  kpi: {
    customersTotal: number;
    repeatCustomers: number;
    newCustomers: number;
    forecastRevenueTotal: number;
    forecastMarginAfterTax: number;
    closedOrdersFactRevenue: number;
    averageProjectRevenue: number;
    averageProjectMarginPercent: number;
  };
  rows: Array<{
    customerId: string;
    customerName: string;
    projectsCount: number;
    activeProjects: number;
    completedProjects: number;
    cancelledProjects: number;
    forecastRevenue: number;
    forecastMarginAfterTax: number;
    averageProjectRevenue: number;
    averageMarginAfterTaxPercent: number;
    closedOrdersFactRevenue: number;
    ltvMixed: number;
    repeat: boolean;
    completionRatePercent: number;
    cancelRatePercent: number;
  }>;
};

export type OverviewAnalyticsData = {
  kpi: {
    factRevenue: number;
    factItemsRevenue: number;
    factServicesRevenue: number;
    factGrossProfit: number;
    ordersClosed: number;
    averageOrderRevenue: number;
    projectForecastRevenue: number;
    projectForecastMarginAfterTax: number;
    activeProjects: number;
    completedProjects: number;
    cancelledProjects: number;
    staleProjects: number;
    lowMarginProjects: number;
    repeatCustomers: number;
  };
  finance: {
    fact: {
      standaloneOrdersRevenue: number;
      standaloneOrdersProfit: number;
      completedProjectsRevenue: number;
      completedProjectsProfit: number;
      revenueTotal: number;
      profitTotal: number;
    };
    forecast: {
      standaloneOrdersRevenue: number;
      standaloneOrdersProfit: number;
      standaloneOrdersTotal: number;
      activeProjectsRevenue: number;
      activeProjectsProfit: number;
      revenueTotal: number;
      profitTotal: number;
    };
    bonuses: {
      ratePercent: number;
      recipients: number;
      factPool: number;
      factPerPerson: number;
      forecastPool: number;
      forecastPerPerson: number;
    };
    ownership: {
      linkedOrdersExcluded: number;
      linkedClosedOrdersExcluded: number;
    };
  };
  attention: Array<{
    type: "stale" | "margin" | "estimate" | "order" | "date";
    severity: "warning" | "critical";
    projectId: string;
    projectTitle: string;
    message: string;
  }>;
  topProjects: ProjectAnalyticsRow[];
  topCustomers: CustomerAnalyticsData["rows"];
  topItems: RequisiteAnalyticsData["tops"]["topByRevenue"];
  timeline: Array<{
    month: string;
    revenue: number;
    profit: number;
    orders: number;
    projects: number;
  }>;
};

export type AdminAnalyticsData = {
  period: AnalyticsPeriod;
  overview: OverviewAnalyticsData;
  requisites: RequisiteAnalyticsData;
  projects: ProjectAnalyticsData;
  customers: CustomerAnalyticsData;
  methodology: Array<{ section: string; rule: string }>;
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

function ymd(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

function periodWhere(field: "endDate" | "createdAt", scope: AnalyticsScope) {
  const where =
    scope.from || scope.to
      ? {
          [field]: {
            ...(scope.from ? { gte: parseDateOnlyStart(scope.from) } : {}),
            ...(scope.to ? { lt: parseDateOnlyEndExclusive(scope.to) } : {}),
          },
        }
      : {};
  return where;
}

function dateRangeFilter(scope: AnalyticsScope) {
  return {
    ...(scope.from ? { gte: parseDateOnlyStart(scope.from) } : {}),
    ...(scope.to ? { lt: parseDateOnlyEndExclusive(scope.to) } : {}),
  };
}

function projectEventPeriodWhere(scope: AnalyticsScope): Prisma.ProjectWhereInput {
  if (!scope.from && !scope.to) return {};

  const from = scope.from ? parseDateOnlyStart(scope.from) : null;
  const toExclusive = scope.to ? parseDateOnlyEndExclusive(scope.to) : null;
  const singleDateFilter = dateRangeFilter(scope);

  return {
    OR: [
      {
        eventStartDate: {
          not: null,
          ...(toExclusive ? { lt: toExclusive } : {}),
        },
        eventEndDate: {
          not: null,
          ...(from ? { gte: from } : {}),
        },
      },
      {
        eventStartDate: singleDateFilter,
        eventEndDate: null,
      },
      {
        eventStartDate: null,
        eventEndDate: singleDateFilter,
      },
    ],
  };
}

const FORECAST_ORDER_EXCLUDED_STATUSES = [OrderStatus.CLOSED, OrderStatus.CANCELLED];

function hasStatusChange(payload: Prisma.JsonValue): boolean {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const changes = (payload as Record<string, unknown>).changes;
  if (changes == null || typeof changes !== "object" || Array.isArray(changes)) return false;
  return Object.prototype.hasOwnProperty.call(changes, "status");
}

async function getRequisiteAnalytics(scope: AnalyticsScope): Promise<RequisiteAnalyticsData> {
  const orderPeriodWhere = periodWhere("endDate", scope);
  const standaloneOrderWhere = { ...orderPeriodWhere, projectId: null };
  const linkedOrderWhere = { ...orderPeriodWhere, projectId: { not: null } };
  const standaloneForecastOrderWhere = {
    ...standaloneOrderWhere,
    status: { notIn: FORECAST_ORDER_EXCLUDED_STATUSES },
  };

  const orderMoneySelect = {
    source: true,
    startDate: true,
    endDate: true,
    rentalStartPartOfDay: true,
    rentalEndPartOfDay: true,
    payMultiplier: true,
    deliveryEnabled: true,
    deliveryPrice: true,
    deliveryInternalCost: true,
    deliveryInternalPaymentMethod: true,
    montageEnabled: true,
    montagePrice: true,
    montageInternalCost: true,
    montageInternalPaymentMethod: true,
    demontageEnabled: true,
    demontagePrice: true,
    demontageInternalCost: true,
    demontageInternalPaymentMethod: true,
    hiddenExpenses: {
      select: {
        cost: true,
        internalPaymentMethod: true,
      },
    },
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
  } satisfies Prisma.OrderSelect;

  const [orders, closedOrders, forecastOrders, linkedOrdersExcluded, linkedClosedOrdersExcluded, trackedItems] = await Promise.all([
    prisma.order.findMany({
      where: standaloneOrderWhere,
      select: { id: true, status: true, source: true },
    }),
    prisma.order.findMany({
      where: { status: OrderStatus.CLOSED, ...standaloneOrderWhere },
      select: orderMoneySelect,
    }),
    prisma.order.findMany({
      where: standaloneForecastOrderWhere,
      select: orderMoneySelect,
    }),
    prisma.order.count({
      where: linkedOrderWhere,
    }),
    prisma.order.count({
      where: { status: "CLOSED", ...linkedOrderWhere },
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
  const revenueByMonth = new Map<string, { revenue: number; profit: number; orders: number }>();
  const revenueByItemForProfitability = new Map<string, number>();

  let totalItemsRevenue = 0;
  let totalServiceRevenue = 0;
  let totalTaxAmount = 0;
  let totalRentalDays = 0;
  let totalProfitEstimate = 0;
  let forecastRevenue = 0;
  let forecastProfitEstimate = 0;

  for (const order of closedOrders) {
    const pricing = calcOrderPricing({
      startDate: order.startDate,
      endDate: order.endDate,
      rentalStartPartOfDay: order.rentalStartPartOfDay,
      rentalEndPartOfDay: order.rentalEndPartOfDay,
      payMultiplier: order.payMultiplier,
      deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
      montagePrice: order.montageEnabled ? order.montagePrice : 0,
      demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
      lines: order.lines,
      discount: order,
      quantityMode: "issued",
    });
    const profitEstimate = calcWarehouseProfitEstimate({
      clientGrandTotal: pricing.grandTotal,
      clientTaxAmount: pricing.taxAmount,
      delivery: {
        enabled: order.deliveryEnabled,
        internalCost: order.deliveryInternalCost,
        internalPaymentMethod: order.deliveryInternalPaymentMethod,
      },
      montage: {
        enabled: order.montageEnabled,
        internalCost: order.montageInternalCost,
        internalPaymentMethod: order.montageInternalPaymentMethod,
      },
      demontage: {
        enabled: order.demontageEnabled,
        internalCost: order.demontageInternalCost,
        internalPaymentMethod: order.demontageInternalPaymentMethod,
      },
      hiddenExpenses: order.hiddenExpenses.map((expense) => ({
        cost: expense.cost,
        internalPaymentMethod: expense.internalPaymentMethod,
      })),
    });
    totalRentalDays += pricing.days;
    totalProfitEstimate += profitEstimate.profitEstimate;
    const orderItemsRevenue = pricing.rentalSubtotalAfterDiscount;

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
    totalTaxAmount += pricing.taxAmount;

    const orderRevenue = pricing.grandTotal;
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
      profit: (revenueByMonth.get(mk)?.profit ?? 0) + profitEstimate.profitEstimate,
      orders: (revenueByMonth.get(mk)?.orders ?? 0) + 1,
    });
  }

  for (const order of forecastOrders) {
    const pricing = calcOrderPricing({
      startDate: order.startDate,
      endDate: order.endDate,
      rentalStartPartOfDay: order.rentalStartPartOfDay,
      rentalEndPartOfDay: order.rentalEndPartOfDay,
      payMultiplier: order.payMultiplier,
      deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
      montagePrice: order.montageEnabled ? order.montagePrice : 0,
      demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
      lines: order.lines,
      discount: order,
    });
    const profitEstimate = calcWarehouseProfitEstimate({
      clientGrandTotal: pricing.grandTotal,
      clientTaxAmount: pricing.taxAmount,
      delivery: {
        enabled: order.deliveryEnabled,
        internalCost: order.deliveryInternalCost,
        internalPaymentMethod: order.deliveryInternalPaymentMethod,
      },
      montage: {
        enabled: order.montageEnabled,
        internalCost: order.montageInternalCost,
        internalPaymentMethod: order.montageInternalPaymentMethod,
      },
      demontage: {
        enabled: order.demontageEnabled,
        internalCost: order.demontageInternalCost,
        internalPaymentMethod: order.demontageInternalPaymentMethod,
      },
      hiddenExpenses: order.hiddenExpenses.map((expense) => ({
        cost: expense.cost,
        internalPaymentMethod: expense.internalPaymentMethod,
      })),
    });
    forecastRevenue += pricing.grandTotal;
    forecastProfitEstimate += profitEstimate.profitEstimate;
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
        unitPurchasePrice: round2(unitCost),
        purchaseCost: Math.round(purchaseCost),
        revenue: Math.round(revenue),
        grossProfit: Math.round(grossProfit),
        paybackRatio: paybackRatio == null ? null : Math.round(paybackRatio * 10000) / 10000,
        roiPercent: roiPercent == null ? null : round2(roiPercent),
        internalOnly: it.internalOnly,
        isActive: it.isActive,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || (b.roiPercent ?? -Infinity) - (a.roiPercent ?? -Infinity));

  const totalRevenueWithTax = Math.round(totalItemsRevenue + totalServiceRevenue + totalTaxAmount);
  const totalProfitabilityRevenue = profitabilityRows.reduce((s, r) => s + r.revenue, 0);
  const totalPurchaseCost = profitabilityRows.reduce((s, r) => s + r.purchaseCost, 0);
  const totalGrossProfit = totalProfitabilityRevenue - totalPurchaseCost;
  const totalPaybackRatio = totalPurchaseCost > 0 ? totalProfitabilityRevenue / totalPurchaseCost : null;
  const totalRoiPercent =
    totalPurchaseCost > 0 ? ((totalProfitabilityRevenue - totalPurchaseCost) / totalPurchaseCost) * 100 : null;

  return {
    kpi: {
      ordersTotal: orders.length,
      ordersClosed: closedOrders.length,
      totalRevenue: totalRevenueWithTax,
      itemsRevenue: Math.round(totalItemsRevenue),
      servicesRevenue: Math.round(totalServiceRevenue),
      profitEstimate: Math.round(totalProfitEstimate),
      averageOrderRevenue: closedOrders.length > 0 ? Math.round(totalRevenueWithTax / closedOrders.length) : 0,
      averageRentalDays: closedOrders.length > 0 ? round2(totalRentalDays / closedOrders.length) : 0,
      linkedOrdersExcluded,
      linkedClosedOrdersExcluded,
    },
    forecast: {
      ordersTotal: forecastOrders.length,
      totalRevenue: Math.round(forecastRevenue),
      profitEstimate: Math.round(forecastProfitEstimate),
    },
    breakdowns: {
      byStatus: [...statusMap.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      bySource: [...sourceMap.entries()]
        .map(([source, v]) => ({ source, count: v.count, revenue: Math.round(v.revenue) }))
        .sort((a, b) => b.revenue - a.revenue),
      revenueByMonth: [...revenueByMonth.entries()]
        .map(([month, v]) => ({
          month,
          revenue: Math.round(v.revenue),
          profit: Math.round(v.profit),
          orders: v.orders,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    },
    tops: {
      topByIssued,
      topByRevenue,
      topCustomers,
      customerTotals: [...customerTotal.entries()]
        .map(([customerId, v]) => ({ customerId, customerName: v.name, total: Math.round(v.total) }))
        .sort((a, b) => b.total - a.total),
    },
    services: {
      deliveryRevenue: Math.round(closedOrders.reduce((s, o) => s + (o.deliveryEnabled && o.deliveryPrice != null ? Number(o.deliveryPrice) : 0), 0)),
      montageRevenue: Math.round(closedOrders.reduce((s, o) => s + (o.montageEnabled && o.montagePrice != null ? Number(o.montagePrice) : 0), 0)),
      demontageRevenue: Math.round(closedOrders.reduce((s, o) => s + (o.demontageEnabled && o.demontagePrice != null ? Number(o.demontagePrice) : 0), 0)),
      deliveryOrders: closedOrders.filter((o) => o.deliveryEnabled && (o.deliveryPrice != null ? Number(o.deliveryPrice) : 0) > 0).length,
      montageOrders: closedOrders.filter((o) => o.montageEnabled && (o.montagePrice != null ? Number(o.montagePrice) : 0) > 0).length,
      demontageOrders: closedOrders.filter((o) => o.demontageEnabled && (o.demontagePrice != null ? Number(o.demontagePrice) : 0) > 0).length,
    },
    profitability: {
      summary: {
        trackedItems: profitabilityRows.length,
        itemsWithRevenue: profitabilityRows.filter((r) => r.revenue > 0).length,
        totalRevenue: Math.round(totalProfitabilityRevenue),
        totalPurchaseCost: Math.round(totalPurchaseCost),
        totalGrossProfit: Math.round(totalGrossProfit),
        totalPaybackRatio: totalPaybackRatio == null ? null : Math.round(totalPaybackRatio * 10000) / 10000,
        totalRoiPercent: totalRoiPercent == null ? null : round2(totalRoiPercent),
      },
      rows: profitabilityRows,
    },
  };
}

async function getProjectAnalytics(scope: AnalyticsScope): Promise<ProjectAnalyticsData> {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: {
      AND: [
        projectEventPeriodWhere(scope),
        { mode: "FULL", customerId: { not: null } },
      ],
    },
    orderBy: [{ eventStartDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      archivedAt: true,
      eventStartDate: true,
      eventEndDate: true,
      eventDateConfirmed: true,
      createdAt: true,
      updatedAt: true,
      customerId: true,
      customer: { select: { name: true } },
      orders: { select: { id: true } },
      activityLogs: {
        orderBy: { createdAt: "asc" },
        select: { kind: true, payload: true, createdAt: true },
      },
      draftOrders: {
        select: {
          estimateVersionId: true,
          lines: {
            select: {
              qty: true,
              plannedDays: true,
              pricePerDaySnapshot: true,
            },
          },
        },
      },
      estimateVersions: {
        orderBy: [{ sortOrder: "asc" }, { versionNumber: "asc" }],
        select: {
          id: true,
          isPrimary: true,
          versionNumber: true,
          includeInProjectTotals: true,
          commissionEnabled: true,
          clientTaxEnabled: true,
          clientChargeTaxEnabled: true,
          sections: {
            select: {
              kind: true,
              linkedOrderId: true,
              linkedOrder: {
                select: {
                  startDate: true,
                  endDate: true,
                  rentalStartPartOfDay: true,
                  rentalEndPartOfDay: true,
                  payMultiplier: true,
                  deliveryEnabled: true,
                  deliveryPrice: true,
                  deliveryInternalCost: true,
                  deliveryInternalPaymentMethod: true,
                  montageEnabled: true,
                  montagePrice: true,
                  montageInternalCost: true,
                  montageInternalPaymentMethod: true,
                  demontageEnabled: true,
                  demontagePrice: true,
                  demontageInternalCost: true,
                  demontageInternalPaymentMethod: true,
                  hiddenExpenses: {
                    select: {
                      cost: true,
                      internalPaymentMethod: true,
                    },
                  },
                  rentalDiscountType: true,
                  rentalDiscountPercent: true,
                  rentalDiscountAmount: true,
                  lines: {
                    select: {
                      requestedQty: true,
                      issuedQty: true,
                      pricePerDaySnapshot: true,
                    },
                  },
                },
              },
              lines: {
                select: {
                  costClient: true,
                  costInternal: true,
                  qty: true,
                  unitPriceClient: true,
                  paymentMethod: true,
                  internalExpenses: {
                    select: {
                      cost: true,
                      paymentMethod: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  type ProjectRow = (typeof projects)[number];
  type ProjectVersion = ProjectRow["estimateVersions"][number];

  function addDraftOrdersClientSubtotal(draftOrders: ProjectRow["draftOrders"], targetVersionId: string | null): number {
    let clientSubtotal = 0;
    for (const draft of draftOrders) {
      if (targetVersionId != null && draft.estimateVersionId !== targetVersionId) continue;
      for (const line of draft.lines) {
        const days = normalizeProjectEstimateDays(line.plannedDays ?? 1) ?? 1;
        clientSubtotal +=
          line.pricePerDaySnapshot != null
            ? calcProjectEstimateRequisiteTotal({
                pricePerDay: line.pricePerDaySnapshot,
                qty: line.qty,
                plannedDays: days,
              }) ?? 0
            : 0;
      }
    }
    return clientSubtotal;
  }

  function versionFinancials(version: ProjectVersion | null, draftOrders: ProjectRow["draftOrders"]): ProjectFinancials {
    let clientSubtotal = 0;
    let internalSubtotal = 0;
    let cashInternalCostTax = 0;

    if (version) {
      for (const section of version.sections) {
        if (section.kind === "REQUISITE" && section.linkedOrder) {
          const order = section.linkedOrder;
          const pricing = calcOrderPricing({
            startDate: order.startDate,
            endDate: order.endDate,
            rentalStartPartOfDay: order.rentalStartPartOfDay,
            rentalEndPartOfDay: order.rentalEndPartOfDay,
            payMultiplier: order.payMultiplier,
            lines: order.lines,
            deliveryPrice: order.deliveryEnabled ? order.deliveryPrice : 0,
            montagePrice: order.montageEnabled ? order.montagePrice : 0,
            demontagePrice: order.demontageEnabled ? order.demontagePrice : 0,
            discount: order,
          });
          clientSubtotal += pricing.grandTotalBeforeTax;
          const serviceCosts = calcOrderServicesInternalCosts({
            delivery: {
              enabled: order.deliveryEnabled,
              internalCost: order.deliveryInternalCost,
              internalPaymentMethod: order.deliveryInternalPaymentMethod,
            },
            montage: {
              enabled: order.montageEnabled,
              internalCost: order.montageInternalCost,
              internalPaymentMethod: order.montageInternalPaymentMethod,
            },
            demontage: {
              enabled: order.demontageEnabled,
              internalCost: order.demontageInternalCost,
              internalPaymentMethod: order.demontageInternalPaymentMethod,
            },
            hiddenExpenses: order.hiddenExpenses.map((expense) => ({
              cost: expense.cost,
              internalPaymentMethod: expense.internalPaymentMethod,
            })),
          });
          internalSubtotal += serviceCosts.internalCostTotal;
          cashInternalCostTax += serviceCosts.cashInternalCostTax;
          continue;
        }

        for (const line of section.lines) {
          clientSubtotal +=
            normalizedLocalLineCostClientNumber({
              costClient: line.costClient != null ? Number(line.costClient) : null,
              qty: line.qty != null ? Number(line.qty) : null,
              unitPriceClient: line.unitPriceClient != null ? Number(line.unitPriceClient) : null,
            }) ?? 0;
          const extraInternal = line.internalExpenses.reduce(
            (sum, expense) => sum + getNumericAmount(expense.cost),
            0,
          );
          const lineInternal = getNumericAmount(line.costInternal) + extraInternal;
          internalSubtotal += lineInternal;
          if (isCashPaymentMethod(line.paymentMethod)) {
            cashInternalCostTax += calcCashInternalCostTaxAmount(getNumericAmount(line.costInternal));
          }
          for (const expense of line.internalExpenses) {
            if (isCashPaymentMethod(expense.paymentMethod)) {
              cashInternalCostTax += calcCashInternalCostTaxAmount(getNumericAmount(expense.cost));
            }
          }
        }
      }
    }

    clientSubtotal += addDraftOrdersClientSubtotal(draftOrders, version?.id ?? null);

    return calcProjectEstimateTotals({
      clientSubtotal,
      internalSubtotal,
      cashInternalCostTax,
      commissionEnabled: version?.commissionEnabled,
      clientTaxEnabled: version?.clientTaxEnabled,
      clientChargeTaxEnabled: version?.clientChargeTaxEnabled,
    });
  }

  function draftOrdersFinancials(draftOrders: ProjectRow["draftOrders"]): ProjectFinancials {
    const clientSubtotal = addDraftOrdersClientSubtotal(draftOrders, null);
    return calcProjectEstimateTotals({ clientSubtotal, internalSubtotal: 0, cashInternalCostTax: 0 });
  }

  function sumFinancials(financials: ProjectFinancials[]): ProjectFinancials {
    const clientSubtotal = financials.reduce((sum, item) => sum + item.clientSubtotal, 0);
    const internalSubtotal = financials.reduce((sum, item) => sum + item.internalSubtotal, 0);
    const cashInternalCostTax = financials.reduce((sum, item) => sum + item.cashInternalCostTax, 0);
    const internalExpensesTotal = financials.reduce((sum, item) => sum + item.internalExpensesTotal, 0);
    const commission = financials.reduce((sum, item) => sum + item.commission, 0);
    const clientChargeTax = financials.reduce((sum, item) => sum + item.clientChargeTax, 0);
    const revenueTotal = financials.reduce((sum, item) => sum + item.revenueTotal, 0);
    const tax = financials.reduce((sum, item) => sum + item.tax, 0);
    const grossMargin = financials.reduce((sum, item) => sum + item.grossMargin, 0);
    const marginAfterTax = financials.reduce((sum, item) => sum + item.marginAfterTax, 0);
    const marginAfterTaxPct = revenueTotal > 0 ? round2((marginAfterTax / revenueTotal) * 100) : 0;
    return {
      clientSubtotal,
      internalSubtotal,
      cashInternalCostTax,
      internalExpensesTotal,
      commission,
      clientChargeTax,
      revenueTotal,
      tax,
      grossMargin,
      marginAfterTax,
      marginAfterTaxPct,
    };
  }

  function statusAge(project: ProjectRow): number {
    const lastStatusLog = [...project.activityLogs]
      .reverse()
      .find((log) => log.kind === "PROJECT_UPDATED" && hasStatusChange(log.payload));
    return daysSince(lastStatusLog?.createdAt ?? project.createdAt, now);
  }

  const rows: ProjectAnalyticsRow[] = projects.flatMap((project) => {
    if (!project.customerId || !project.customer) return [];
    const includedVersions = project.estimateVersions.filter((version) => version.includeInProjectTotals);
    const financials =
      includedVersions.length > 0
        ? sumFinancials(includedVersions.map((version) => versionFinancials(version, project.draftOrders)))
        : draftOrdersFinancials(project.draftOrders);
    const archived = project.archivedAt != null;
    const terminal = project.status === ProjectStatus.COMPLETED || project.status === ProjectStatus.CANCELLED;
    const active = !terminal && !archived;
    const daysSinceActivity = daysSince(project.updatedAt, now);
    const currentStatusAgeDays = statusAge(project);
    const hasPrimaryEstimate = includedVersions.length > 0;
    const hasLinkedOrder = project.orders.length > 0;
    const risks: string[] = [];

    if (active && daysSinceActivity >= 14) risks.push("Нет активности 14+ дней");
    else if (active && daysSinceActivity >= 7) risks.push("Нет активности 7+ дней");
    if (active && !hasPrimaryEstimate) risks.push("Нет основной сметы");
    if (active && !hasLinkedOrder) risks.push("Нет связанной заявки");
    if (active && !project.eventDateConfirmed) risks.push("Дата не подтверждена");
    if (hasPrimaryEstimate && financials.revenueTotal > 0 && financials.marginAfterTaxPct < 15) {
      risks.push("Маржа ниже 15%");
    }
    if (hasPrimaryEstimate && financials.marginAfterTax < 0) risks.push("Отрицательная маржа");
    if (active && currentStatusAgeDays >= 14) risks.push("Долго в одном статусе");

    let healthScore = 100;
    if (active && daysSinceActivity >= 14) healthScore -= 25;
    else if (active && daysSinceActivity >= 7) healthScore -= 15;
    if (active && !hasPrimaryEstimate) healthScore -= 20;
    if (active && !hasLinkedOrder) healthScore -= 15;
    if (active && !project.eventDateConfirmed) healthScore -= 10;
    if (hasPrimaryEstimate && financials.revenueTotal > 0 && financials.marginAfterTaxPct < 15) healthScore -= 20;
    if (hasPrimaryEstimate && financials.marginAfterTax < 0) healthScore -= 30;
    if (active && currentStatusAgeDays >= 14) healthScore -= 10;
    if (hasPrimaryEstimate && hasLinkedOrder && project.eventDateConfirmed) healthScore += 10;
    healthScore = Math.min(100, Math.max(0, healthScore));

    return [{
      projectId: project.id,
      title: project.title,
      customerId: project.customerId,
      customerName: project.customer.name,
      status: project.status,
      archived,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      eventStartDate: ymd(project.eventStartDate),
      eventEndDate: ymd(project.eventEndDate),
      eventDateConfirmed: project.eventDateConfirmed,
      ordersCount: project.orders.length,
      estimateVersionsCount: project.estimateVersions.length,
      hasPrimaryEstimate,
      hasLinkedOrder,
      daysSinceActivity,
      currentStatusAgeDays,
      healthScore,
      risks,
      financials,
    }];
  });

  const total = rows.length;
  const activeProjects = rows.filter((p) => !p.archived && p.status !== "COMPLETED" && p.status !== "CANCELLED").length;
  const completedProjects = rows.filter((p) => p.status === "COMPLETED").length;
  const cancelledProjects = rows.filter((p) => p.status === "CANCELLED").length;
  const financialRows = rows.filter((p) => p.status !== "CANCELLED");
  const forecastRows = rows.filter((p) => !p.archived && p.status !== "COMPLETED" && p.status !== "CANCELLED");
  const actualRows = rows.filter((p) => p.status === "COMPLETED");
  const archivedProjects = rows.filter((p) => p.archived).length;
  const withPrimaryEstimate = rows.filter((p) => p.hasPrimaryEstimate).length;
  const withLinkedOrder = rows.filter((p) => p.hasLinkedOrder).length;
  const confirmedDates = rows.filter((p) => p.eventDateConfirmed).length;
  const forecastRevenueTotal = Math.round(forecastRows.reduce((sum, p) => sum + p.financials.revenueTotal, 0));
  const forecastMarginAfterTax = Math.round(forecastRows.reduce((sum, p) => sum + p.financials.marginAfterTax, 0));
  const actualRevenueTotal = Math.round(actualRows.reduce((sum, p) => sum + p.financials.revenueTotal, 0));
  const actualMarginAfterTax = Math.round(actualRows.reduce((sum, p) => sum + p.financials.marginAfterTax, 0));
  const marginRows = financialRows.filter((p) => p.financials.revenueTotal > 0);
  const averageMarginAfterTaxPercent =
    marginRows.length > 0 ? round2(marginRows.reduce((sum, p) => sum + p.financials.marginAfterTaxPct, 0) / marginRows.length) : 0;

  const statusMap = new Map<string, ProjectAnalyticsData["statusAging"][number]>();
  for (const row of rows) {
    const prev = statusMap.get(row.status) ?? {
      status: row.status,
      projects: 0,
      averageCurrentAgeDays: 0,
      maxCurrentAgeDays: 0,
    };
    prev.projects += 1;
    prev.averageCurrentAgeDays += row.currentStatusAgeDays;
    prev.maxCurrentAgeDays = Math.max(prev.maxCurrentAgeDays, row.currentStatusAgeDays);
    statusMap.set(row.status, prev);
  }

  const statusAging = [...statusMap.values()]
    .map((row) => ({
      ...row,
      averageCurrentAgeDays: row.projects > 0 ? round2(row.averageCurrentAgeDays / row.projects) : 0,
    }))
    .sort((a, b) => b.averageCurrentAgeDays - a.averageCurrentAgeDays);

  const lowMargin = financialRows
    .filter((p) => p.financials.revenueTotal > 0 && p.financials.marginAfterTaxPct < 15)
    .sort((a, b) => a.financials.marginAfterTaxPct - b.financials.marginAfterTaxPct);

  return {
    kpi: {
      projectsTotal: total,
      activeProjects,
      completedProjects,
      cancelledProjects,
      archivedProjects,
      withPrimaryEstimate,
      withoutPrimaryEstimate: total - withPrimaryEstimate,
      withLinkedOrder,
      withoutLinkedOrder: total - withLinkedOrder,
      confirmedDates,
      completionRatePercent: total > 0 ? round2((completedProjects / total) * 100) : 0,
      cancelRatePercent: total > 0 ? round2((cancelledProjects / total) * 100) : 0,
      forecastRevenueTotal,
      forecastMarginAfterTax,
      actualRevenueTotal,
      actualMarginAfterTax,
      averageForecastRevenue: forecastRows.length > 0 ? Math.round(forecastRevenueTotal / forecastRows.length) : 0,
      averageMarginAfterTaxPercent,
      averageOrdersPerProject: total > 0 ? round2(rows.reduce((sum, p) => sum + p.ordersCount, 0) / total) : 0,
      averageEstimateVersions: total > 0 ? round2(rows.reduce((sum, p) => sum + p.estimateVersionsCount, 0) / total) : 0,
      stale7Days: rows.filter((p) => p.daysSinceActivity >= 7).length,
      stale14Days: rows.filter((p) => p.daysSinceActivity >= 14).length,
      lowMarginProjects: lowMargin.length,
    },
    funnel: {
      created: total,
      withPrimaryEstimate,
      withConfirmedDates: confirmedDates,
      withLinkedOrder,
      completed: completedProjects,
    },
    byStatus: [...statusMap.values()]
      .map((row) => ({ status: row.status, count: row.projects }))
      .sort((a, b) => b.count - a.count),
    statusAging,
    topByRevenue: [...financialRows].sort((a, b) => b.financials.revenueTotal - a.financials.revenueTotal).slice(0, 20),
    topByMargin: [...financialRows].sort((a, b) => b.financials.marginAfterTax - a.financials.marginAfterTax).slice(0, 20),
    lowMargin: lowMargin.slice(0, 20),
    risks: [...rows].filter((p) => p.risks.length > 0).sort((a, b) => a.healthScore - b.healthScore).slice(0, 30),
    rows,
  };
}

function getCustomerAnalytics(
  projects: ProjectAnalyticsData,
  requisites: RequisiteAnalyticsData,
): CustomerAnalyticsData {
  const byCustomer = new Map<CustomerAnalyticsData["rows"][number]["customerId"], CustomerAnalyticsData["rows"][number]>();
  const closedOrderRevenueByCustomer = new Map<string, number>();
  for (const row of requisites.tops.customerTotals) {
    closedOrderRevenueByCustomer.set(row.customerId, row.total);
  }

  for (const project of projects.rows) {
    const prev =
      byCustomer.get(project.customerId) ??
      {
        customerId: project.customerId,
        customerName: project.customerName,
        projectsCount: 0,
        activeProjects: 0,
        completedProjects: 0,
        cancelledProjects: 0,
        forecastRevenue: 0,
        forecastMarginAfterTax: 0,
        averageProjectRevenue: 0,
        averageMarginAfterTaxPercent: 0,
        closedOrdersFactRevenue: closedOrderRevenueByCustomer.get(project.customerId) ?? 0,
        ltvMixed: 0,
        repeat: false,
        completionRatePercent: 0,
        cancelRatePercent: 0,
      };

    prev.projectsCount += 1;
    if (!project.archived && project.status !== "COMPLETED" && project.status !== "CANCELLED") prev.activeProjects += 1;
    if (project.status === "COMPLETED") prev.completedProjects += 1;
    if (project.status === "CANCELLED") prev.cancelledProjects += 1;
    if (project.status !== "CANCELLED") {
      prev.forecastRevenue += project.financials.revenueTotal;
      prev.forecastMarginAfterTax += project.financials.marginAfterTax;
    }
    byCustomer.set(project.customerId, prev);
  }

  for (const [customerId, revenue] of closedOrderRevenueByCustomer.entries()) {
    if (byCustomer.has(customerId)) continue;
    const topRow = requisites.tops.customerTotals.find((row) => row.customerId === customerId);
    byCustomer.set(customerId, {
      customerId,
      customerName: topRow?.customerName ?? "—",
      projectsCount: 0,
      activeProjects: 0,
      completedProjects: 0,
      cancelledProjects: 0,
      forecastRevenue: 0,
      forecastMarginAfterTax: 0,
      averageProjectRevenue: 0,
      averageMarginAfterTaxPercent: 0,
      closedOrdersFactRevenue: revenue,
      ltvMixed: 0,
      repeat: false,
      completionRatePercent: 0,
      cancelRatePercent: 0,
    });
  }

  const rows = [...byCustomer.values()]
    .map((row) => {
      const financialProjectCount = row.projectsCount - row.cancelledProjects;
      const marginPercent = row.forecastRevenue > 0 ? (row.forecastMarginAfterTax / row.forecastRevenue) * 100 : 0;
      return {
        ...row,
        forecastRevenue: Math.round(row.forecastRevenue),
        forecastMarginAfterTax: Math.round(row.forecastMarginAfterTax),
        averageProjectRevenue: financialProjectCount > 0 ? Math.round(row.forecastRevenue / financialProjectCount) : 0,
        averageMarginAfterTaxPercent: round2(marginPercent),
        closedOrdersFactRevenue: Math.round(row.closedOrdersFactRevenue),
        ltvMixed: Math.round(row.forecastRevenue + row.closedOrdersFactRevenue),
        repeat: row.projectsCount >= 2,
        completionRatePercent: row.projectsCount > 0 ? round2((row.completedProjects / row.projectsCount) * 100) : 0,
        cancelRatePercent: row.projectsCount > 0 ? round2((row.cancelledProjects / row.projectsCount) * 100) : 0,
      };
    })
    .sort((a, b) => b.ltvMixed - a.ltvMixed);

  const projectRows = rows.filter((row) => row.projectsCount > 0);
  const forecastRevenueTotal = rows.reduce((sum, row) => sum + row.forecastRevenue, 0);
  const forecastMarginAfterTax = rows.reduce((sum, row) => sum + row.forecastMarginAfterTax, 0);
  const marginRows = rows.filter((row) => row.forecastRevenue > 0);

  return {
    kpi: {
      customersTotal: rows.length,
      repeatCustomers: rows.filter((row) => row.repeat).length,
      newCustomers: projectRows.filter((row) => row.projectsCount === 1).length,
      forecastRevenueTotal,
      forecastMarginAfterTax,
      closedOrdersFactRevenue: rows.reduce((sum, row) => sum + row.closedOrdersFactRevenue, 0),
      averageProjectRevenue: projectRows.length > 0 ? Math.round(forecastRevenueTotal / projectRows.length) : 0,
      averageProjectMarginPercent:
        marginRows.length > 0 ? round2(marginRows.reduce((sum, row) => sum + row.averageMarginAfterTaxPercent, 0) / marginRows.length) : 0,
    },
    rows,
  };
}

function getOverviewAnalytics(
  requisites: RequisiteAnalyticsData,
  projects: ProjectAnalyticsData,
  customers: CustomerAnalyticsData,
): OverviewAnalyticsData {
  const attention: OverviewAnalyticsData["attention"] = projects.risks.slice(0, 12).map((project) => ({
    type: project.daysSinceActivity >= 7 ? "stale" : project.financials.marginAfterTaxPct < 15 ? "margin" : !project.hasPrimaryEstimate ? "estimate" : !project.hasLinkedOrder ? "order" : "date",
    severity: project.healthScore < 45 ? "critical" : "warning",
    projectId: project.projectId,
    projectTitle: project.title,
    message: project.risks.slice(0, 3).join(", "),
  }));
  const bonusRate = 0.15;
  const bonusRecipients = 2;
  const standaloneOrdersRevenue = requisites.kpi.totalRevenue;
  const standaloneOrdersProfit = requisites.kpi.profitEstimate;
  const completedProjectsRevenue = projects.kpi.actualRevenueTotal;
  const completedProjectsProfit = projects.kpi.actualMarginAfterTax;
  const factRevenueTotal = standaloneOrdersRevenue + completedProjectsRevenue;
  const factProfitTotal = standaloneOrdersProfit + completedProjectsProfit;
  const standaloneForecastOrdersRevenue = requisites.forecast.totalRevenue;
  const standaloneForecastOrdersProfit = requisites.forecast.profitEstimate;
  const forecastRevenueTotal = standaloneForecastOrdersRevenue + projects.kpi.forecastRevenueTotal;
  const forecastProfitTotal = standaloneForecastOrdersProfit + projects.kpi.forecastMarginAfterTax;
  const factPool = Math.round(factProfitTotal * bonusRate);
  const forecastPool = Math.round(forecastProfitTotal * bonusRate);
  const timeline = new Map<
    string,
    { revenue: number; profit: number; orders: number; projects: number }
  >();

  for (const point of requisites.breakdowns.revenueByMonth) {
    timeline.set(point.month, {
      revenue: point.revenue,
      profit: point.profit,
      orders: point.orders,
      projects: 0,
    });
  }

  for (const project of projects.rows) {
    if (project.status !== ProjectStatus.COMPLETED) continue;
    const anchor = project.eventEndDate ?? project.eventStartDate;
    if (!anchor) continue;
    const month = anchor.slice(0, 7);
    const current = timeline.get(month) ?? { revenue: 0, profit: 0, orders: 0, projects: 0 };
    timeline.set(month, {
      revenue: current.revenue + project.financials.revenueTotal,
      profit: current.profit + project.financials.marginAfterTax,
      orders: current.orders,
      projects: current.projects + 1,
    });
  }

  return {
    kpi: {
      factRevenue: requisites.kpi.totalRevenue,
      factItemsRevenue: requisites.kpi.itemsRevenue,
      factServicesRevenue: requisites.kpi.servicesRevenue,
      factGrossProfit: requisites.profitability.summary.totalGrossProfit,
      ordersClosed: requisites.kpi.ordersClosed,
      averageOrderRevenue: requisites.kpi.averageOrderRevenue,
      projectForecastRevenue: forecastRevenueTotal,
      projectForecastMarginAfterTax: forecastProfitTotal,
      activeProjects: projects.kpi.activeProjects,
      completedProjects: projects.kpi.completedProjects,
      cancelledProjects: projects.kpi.cancelledProjects,
      staleProjects: projects.kpi.stale7Days,
      lowMarginProjects: projects.kpi.lowMarginProjects,
      repeatCustomers: customers.kpi.repeatCustomers,
    },
    finance: {
      fact: {
        standaloneOrdersRevenue,
        standaloneOrdersProfit,
        completedProjectsRevenue,
        completedProjectsProfit,
        revenueTotal: factRevenueTotal,
        profitTotal: factProfitTotal,
      },
      forecast: {
        standaloneOrdersRevenue: standaloneForecastOrdersRevenue,
        standaloneOrdersProfit: standaloneForecastOrdersProfit,
        standaloneOrdersTotal: requisites.forecast.ordersTotal,
        activeProjectsRevenue: projects.kpi.forecastRevenueTotal,
        activeProjectsProfit: projects.kpi.forecastMarginAfterTax,
        revenueTotal: forecastRevenueTotal,
        profitTotal: forecastProfitTotal,
      },
      bonuses: {
        ratePercent: Math.round(bonusRate * 100),
        recipients: bonusRecipients,
        factPool,
        factPerPerson: Math.round(factPool / bonusRecipients),
        forecastPool,
        forecastPerPerson: Math.round(forecastPool / bonusRecipients),
      },
      ownership: {
        linkedOrdersExcluded: requisites.kpi.linkedOrdersExcluded,
        linkedClosedOrdersExcluded: requisites.kpi.linkedClosedOrdersExcluded,
      },
    },
    attention,
    topProjects: projects.topByRevenue.slice(0, 5),
    topCustomers: customers.rows.slice(0, 5),
    topItems: requisites.tops.topByRevenue.slice(0, 5),
    timeline: [...timeline.entries()]
      .map(([month, point]) => ({
        month,
        revenue: Math.round(point.revenue),
        profit: Math.round(point.profit),
        orders: point.orders,
        projects: point.projects,
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export async function getAdminAnalyticsData(scope: AnalyticsScope): Promise<AdminAnalyticsData> {
  const requisites = await getRequisiteAnalytics(scope);
  const projects = await getProjectAnalytics(scope);
  const customers = getCustomerAnalytics(projects, requisites);
  const overview = getOverviewAnalytics(requisites, projects, customers);

  return {
    period: {
      from: scope.from ?? null,
      to: scope.to ?? null,
      dateBasis: {
        requisites: "order.endDate",
        projects: "project.eventStartDate/eventEndDate",
        customers: "project.eventStartDate/eventEndDate + order.endDate",
      },
    },
    overview,
    requisites,
    projects,
    customers,
    methodology: [
      { section: "Реквизит", rule: "Фактическая выручка считается по закрытым заявкам, которые завершились в выбранном периоде. Скидки и налог берутся из той же формулы, что используется в заявках и сметах." },
      { section: "Проекты", rule: `Финансовый прогноз считается по основной версии сметы проекта. Отмененные проекты не входят в прогноз выручки и маржи, но остаются в показателях отмен. Комиссия — ${Math.round(PROJECT_ESTIMATE_COMMISSION_RATE * 100)}%, клиентский налог при включении — ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%, расходный условный налог — ${Math.round(PROJECT_ESTIMATE_TAX_RATE * 100)}%.` },
      { section: "Заказчики", rule: "Метрики по заказчикам собираются из проектов, созданных в выбранном периоде. Фактическая выручка по заявкам показывается отдельно и учитывает только закрытые заявки." },
      { section: "Статусы", rule: "Возраст статусов и зависшие проекты — это управленческие сигналы для контроля работы, а не бухгалтерские показатели." },
    ],
  };
}
