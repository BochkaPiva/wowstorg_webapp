import { describe, expect, it } from "vitest";
import type { AdminAnalyticsData, ProjectAnalyticsRow } from "@/server/admin-analytics";
import { analyticsCustomerRows, analyticsMargin, completeAnalyticsTimeline, isActiveAnalyticsProject, isAnalyticsDate, uniqueAnalyticsSignals } from "@/lib/analytics-presentation";

const project = (id: string, revenue: number, profit: number, extra: Partial<ProjectAnalyticsRow> = {}) => ({ projectId: id, customerId: "c", status: "COMPLETED", archived: false, hasPrimaryEstimate: true, financials: { revenueTotal: revenue, marginAfterTax: profit }, ...extra }) as ProjectAnalyticsRow;
const fixture = (projects: ProjectAnalyticsRow[]) => ({ projects: { rows: projects }, customers: { rows: [{ customerId: "c", customerName: "Клиент", closedOrdersFactRevenue: 50 }] } }) as AdminAnalyticsData;
describe("analytics presentation, without changing entity financial formulas", () => {
  it("separates completed actual from active forecast; excludes cancelled estimates and archived forecast", () => {
    const row = analyticsCustomerRows(fixture([
      project("complete", 100, 20), project("active", 300, 150, { status: "IN_PROGRESS" }),
      project("cancel", 9000, 9000, { status: "CANCELLED" }), project("archive", 100, 10, { status: "LEAD", archived: true }),
      project("missing", 0, 0, { hasPrimaryEstimate: false }),
    ]))[0];
    expect(row.actualRevenue).toBe(150);
    expect(row.actualProjects).toBe(100);
    expect(row.activeRevenue).toBe(300);
    expect(row.averageEstimatedProject).toBeCloseTo(500 / 3);
    expect(row.projectMargin).toBe(36);
    expect(row.incompleteCompleted).toBe(1);
  });
  it("does not present absence of data as a zero margin or average", () => {
    expect(analyticsMargin(0, 0)).toBeNull();
    expect(analyticsMargin(-100, -10)).toBeNull();
    const row = analyticsCustomerRows(fixture([]))[0];
    expect(row.projectMargin).toBeNull(); expect(row.averageEstimatedProject).toBeNull();
  });
  it("keeps negative profit", () => expect(analyticsMargin(100, -20)).toBe(-20));
  it("defines active consistently with the source", () => {
    expect(isActiveAnalyticsProject(project("a", 0, 0, { status: "LEAD" }))).toBe(true);
    for (const extra of [{ status: "COMPLETED" }, { status: "CANCELLED" }, { archived: true }]) expect(isActiveAnalyticsProject(project("b", 0, 0, extra as Partial<ProjectAnalyticsRow>))).toBe(false);
  });
  it("deduplicates project signals and retains the critical issue", () => {
    const data = { overview: { attention: [{ projectId: "p", severity: "warning", type: "margin" }, { projectId: "p", severity: "critical", type: "estimate" }, { projectId: "q", severity: "warning" }] } } as AdminAnalyticsData;
    expect(uniqueAnalyticsSignals(data).map(row => row.projectId)).toEqual(["p", "q"]);
    expect(uniqueAnalyticsSignals(data)[0].severity).toBe("critical");
  });
  it("fills empty months instead of connecting distant observations", () => {
    const points = [{ month: "2026-01", revenue: 100, profit: -10, orders: 1, projects: 0 }];
    const rows = completeAnalyticsTimeline(points, "2026-01-10", "2026-03-15");
    expect(rows.map(row => row.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(rows[1].revenue).toBe(0); expect(rows[0].profit).toBe(-10);
    expect(completeAnalyticsTimeline([], "2000-01-01", "2026-01-01")).toHaveLength(120);
  });
  it("rejects corrupted calendar dates without a rendering crash", () => {
    expect(isAnalyticsDate("2026-13-01")).toBe(false);
    expect(isAnalyticsDate("2026-02-30")).toBe(false);
    expect(isAnalyticsDate("2024-02-29")).toBe(true);
    expect(completeAnalyticsTimeline([], "2026-13-01", "2027-01-01")).toEqual([]);
  });
});
