import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsCustomerRows } from "@/lib/analytics-presentation";
import { sumAnalyticsMoney } from "@/lib/analytics-finance";

const db = vi.hoisted(() => ({ order: { findMany: vi.fn(), count: vi.fn() }, project: { findMany: vi.fn() }, item: { findMany: vi.fn() } }));
vi.mock("@/server/db", () => ({ prisma: db }));
import { getAdminAnalyticsData } from "@/server/admin-analytics";
import { buildAdminAnalyticsXlsx } from "@/server/admin-analytics-xlsx";

const at = (date: string) => new Date(date + "T00:00:00Z");
const item = (index: number) => ({ id: "i" + index, name: "Item " + index, type: "ASSET", total: 10, purchasePricePerUnit: index === 0 ? 0 : null, internalOnly: false, isActive: true });
const order = (id: string, customerId: string, price: number, itemIndex = 0) => ({
  id, customerId, customer: { name: customerId }, source: "WOWSTORG", status: "CLOSED", projectId: null,
  startDate: at("2026-08-01"), endDate: at("2026-08-01"),
  rentalStartPartOfDay: "MORNING", rentalEndPartOfDay: "EVENING", payMultiplier: 1,
  clientPaymentMethod: "CASH", deliveryEnabled: false, montageEnabled: false, demontageEnabled: false,
  hiddenExpenses: [], rentalDiscountType: "NONE", rentalDiscountPercent: null, rentalDiscountAmount: null,
  lines: [{ itemId: "i" + itemIndex, item: item(itemIndex), requestedQty: 2, issuedQty: 1, pricePerDaySnapshot: price, payMultiplierSnapshot: 1 }],
});
const version = (id: string, revenue: number, included = true) => ({
  id, isPrimary: id === "v1", versionNumber: 1, includeInProjectTotals: included,
  commissionEnabled: false, clientTaxEnabled: false, clientChargeTaxEnabled: false,
  sections: [{ kind: "LOCAL", lines: [{ costClient: revenue, costInternal: 0, qty: 1, unitPriceClient: revenue, paymentMethod: "CASH", internalExpenses: [] }] }],
});
const project = (id: string, start: string | null, end: string | null, status = "COMPLETED") => ({
  id, title: id, status, customerId: "project-client", customer: { name: "project-client" },
  archivedAt: null, eventStartDate: start ? at(start) : null, eventEndDate: end ? at(end) : null,
  eventDateConfirmed: true, createdAt: at("2026-01-01"), updatedAt: at("2026-10-01"),
  activityLogs: [], orders: [], draftOrders: [], estimateVersions: [version("v1", 100.13), version("v2", 20.27), version("excluded", 99999, false)],
});

// Apply the actual Prisma date predicate to fixtures instead of returning every row.
type Predicate = Record<string, unknown>;
function matches(row: Record<string, unknown>, where: Predicate): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Predicate[]).every(part => matches(row, part));
    if (key === "OR") return (value as Predicate[]).some(part => matches(row, part));
    if (key === "mode") return true;
    const actual = row[key];
    if (value === null || typeof value !== "object") return actual === value;
    const rule = value as Predicate;
    if ("not" in rule && actual === rule.not) return false;
    if ("notIn" in rule && (rule.notIn as unknown[]).includes(actual)) return false;
    if ("gte" in rule && (actual == null || Number(actual) < Number(rule.gte))) return false;
    if ("lt" in rule && (actual == null || Number(actual) >= Number(rule.lt))) return false;
    return true;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const closed = Array.from({ length: 81 }, (_, i) => order("o" + i, "order-client", 10.13, i));
  const forecast = { ...order("forecast", "forecast-only-client", 50.27), status: "NEW" };
  db.order.findMany.mockImplementation(({ where, select }) => {
    if (!select.lines) return [...closed, forecast].filter(row => matches(row, where));
    if (where.projectId?.not === null) return [{ lines: [{ itemId: "i0", requestedQty: 9, issuedQty: 3 }] }];
    if (where.status === "CLOSED") return closed.filter(row => matches(row, where));
    return [forecast].filter(row => matches(row, where));
  });
  db.order.count.mockResolvedValue(1);
  db.item.findMany.mockResolvedValue(Array.from({ length: 81 }, (_, i) => item(i)));
  const projects = [project("boundary", "2026-07-31", "2026-08-01"), project("fallback", "2026-07-15", null), project("undated", null, null),
    ...Array.from({ length: 40 }, (_, i) => project("risk" + i, "2026-08-01", "2026-08-31", "IN_PROGRESS"))];
  db.project.findMany.mockImplementation(({ where }) => projects.filter(row => matches(row, where)));
});

describe("complete analytics read model and export", () => {
  it("recognises undated completed projects by closing day, consistently in customers, chart, bonuses and XLSX", async () => {
    const projects = [
      { ...project("archived-close", null, null), archivedAt: new Date("2026-08-31T18:00:00Z") },
      { ...project("status-close", null, null), activityLogs: [
        { kind: "PROJECT_UPDATED", payload: { changes: { status: { from: "LEAD", to: "COMPLETED" } } }, createdAt: at("2026-07-01") },
        { kind: "PROJECT_UPDATED", payload: { changes: { status: { from: "IN_PROGRESS", to: "COMPLETED" } } }, createdAt: at("2026-09-15") },
      ] },
      { ...project("dated-priority", "2026-08-01", "2026-08-31"), archivedAt: at("2026-09-10") },
      project("missing-close", null, null),
      { ...project("active-undated", null, null, "IN_PROGRESS"), archivedAt: at("2026-09-01") },
      { ...project("cancelled-undated", null, null, "CANCELLED"), archivedAt: at("2026-09-01") },
    ];
    db.project.findMany.mockImplementation(({ where }) => projects.filter(row => matches(row, where)));
    const august = await getAdminAnalyticsData({ from: "2026-08-01", to: "2026-08-31" });
    const september = await getAdminAnalyticsData({ from: "2026-09-01", to: "2026-09-30" });
    const july = await getAdminAnalyticsData({ from: "2026-07-01", to: "2026-07-31" });
    expect(august.facts.filter(row => row.source === "PROJECT").map(row => row.id)).toEqual(["dated-priority"]);
    expect(july.projects.kpi.actualRevenueTotal).toBe(0);
    expect(september.projects.rows.map(row => row.projectId)).toEqual(["archived-close", "status-close"]);
    expect(september.facts.map(row => row.date)).toEqual(["2026-09-01", "2026-09-15"]);
    expect(september.projects.unassigned.map(row => row.projectId)).toEqual(["missing-close", "active-undated"]);
    expect(september.projects.kpi.actualRevenueTotal).toBe(240.8);
    expect(september.overview.finance.fact.revenueTotal).toBe(240.8);
    expect(sumAnalyticsMoney(analyticsCustomerRows(september).map(row => row.actualRevenue))).toBe(240.8);
    expect(sumAnalyticsMoney(september.overview.timeline.map(row => row.revenue))).toBe(240.8);
    expect(september.overview.finance.forecast.revenueTotal).toBe(0);
    expect(sumAnalyticsMoney(september.overview.finance.bonuses.factShares)).toBe(september.overview.finance.bonuses.factPool);
    const firstDay = await getAdminAnalyticsData({ from: "2026-09-01", to: "2026-09-01" });
    expect(firstDay.projects.rows.map(row => row.projectId)).toEqual(["archived-close"]);
    const remainder = await getAdminAnalyticsData({ from: "2026-09-02", to: "2026-09-30" });
    expect(remainder.projects.rows.map(row => row.projectId)).toEqual(["status-close"]);
    expect(sumAnalyticsMoney([firstDay.projects.kpi.actualRevenueTotal, remainder.projects.kpi.actualRevenueTotal])).toBe(september.projects.kpi.actualRevenueTotal);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildAdminAnalyticsXlsx(september, "global") as unknown as ExcelJS.Buffer);
    expect(workbook.getWorksheet("Динамика")!.getCell("B7").value).toBe(240.8);
    expect(workbook.getWorksheet("Проекты")!.getCell("J7").value).toBe("2026-09-01");
    expect(workbook.getWorksheet("Проекты")!.getCell("K7").value).toBe("Закрытие проекта");
    expect(workbook.getWorksheet("Заказчики")!.getCell("D7").value).toBe(240.8);
    expect(workbook.getWorksheet("Без дат — вне итогов")!.getCell("A7").value).toBe("missing-close");
  });
  it("recognises a cross-month completed project once, includes all counted versions and exposes undated work separately", async () => {
    const july = await getAdminAnalyticsData({ from: "2026-07-01", to: "2026-07-31" });
    const august = await getAdminAnalyticsData({ from: "2026-08-01", to: "2026-08-31" });
    expect(july.projects.rows.map(row => row.title)).toEqual(["fallback"]);
    expect(august.facts.filter(fact => fact.source === "PROJECT").map(fact => fact.id)).toEqual(["boundary"]);
    expect(august.projects.kpi.actualRevenueTotal).toBe(120.4);
    expect(august.projects.unassigned.map(row => row.title)).toEqual(["undated"]);
    expect(august.facts.some(fact => fact.id === "undated")).toBe(false);
    expect(august.projects.risks.length).toBe(40);
  });
  it("reconciles customers, forecast, chart and exported facts to the cent; does not double-count project orders", async () => {
    const data = await getAdminAnalyticsData({ from: "2026-08-01", to: "2026-08-31" });
    const customers = analyticsCustomerRows(data);
    expect(data.requisites.kpi.totalRevenue).toBe(820.53);
    expect(data.overview.finance.fact.revenueTotal).toBe(940.93);
    expect(sumAnalyticsMoney(customers.map(row => row.actualRevenue))).toBe(940.93);
    expect(sumAnalyticsMoney(data.overview.timeline.map(row => row.revenue))).toBe(940.93);
    expect(customers.find(row => row.customerId === "forecast-only-client")?.activeRevenue).toBe(100.54);
    expect(sumAnalyticsMoney(customers.map(row => row.activeRevenue))).toBe(data.overview.finance.forecast.revenueTotal);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildAdminAnalyticsXlsx(data, "global") as unknown as ExcelJS.Buffer);
    const dynamics = workbook.getWorksheet("Динамика")!;
    expect(dynamics.getCell("A7").value).toBe("2026-08");
    expect(dynamics.getCell("B7").value).toBe(940.93);
    expect(dynamics.getCell("C7").value).toBe(data.overview.finance.fact.profitTotal);
    expect(workbook.getWorksheet("Без дат — вне итогов")!.getCell("A7").value).toBe("undated");
  });
  it("returns every used item, not only top 20; distinguishes missing and zero costs, and splits physical demand by ownership", async () => {
    const data = await getAdminAnalyticsData({ from: "2026-08-01", to: "2026-08-31" });
    expect(data.requisites.tops.topByRevenue).toHaveLength(20);
    expect(data.requisites.items).toHaveLength(81);
    expect(data.requisites.items.find(row => row.itemId === "i80")?.revenue).toBe(10.13);
    const zero = data.requisites.items.find(row => row.itemId === "i0")!;
    expect(zero.purchaseCost).toBe(0); expect(zero.issuedQty).toBe(1); expect(zero.linkedIssuedQty).toBe(3);
    expect(data.requisites.items.find(row => row.itemId === "i1")?.purchaseCost).toBeNull();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildAdminAnalyticsXlsx(data, "requisites") as unknown as ExcelJS.Buffer);
    expect(wb.getWorksheet("Реквизит")!.rowCount).toBe(87);
  });
});
