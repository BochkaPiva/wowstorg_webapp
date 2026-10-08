import { describe, expect, it } from "vitest";
import { analyticsBonusPool, analyticsFactTimeline, projectActualDate, splitAnalyticsMoney, sumAnalyticsMoney } from "@/lib/analytics-finance";
import { updateAnalyticsScope, type AnalyticsTab } from "@/lib/analytics-presentation";
import { projectFactPeriodWhere } from "@/server/analytics/period-filters";

describe("analytics financial contract", () => {
  it("preserves cents across customer and monthly aggregations", () => {
    const facts = [10.13, 20.27, 30.01].map((revenue, index) => ({ source: "ORDER" as const, id: String(index), customerId: "c", customerName: "Client", date: "2026-08-01", revenue, profit: revenue - 1 }));
    expect(sumAnalyticsMoney(facts.map(row => row.revenue))).toBe(60.41);
    expect(analyticsFactTimeline(facts)).toEqual([{ month: "2026-08", revenue: 60.41, profit: 57.41, orders: 3, projects: 0 }]);
  });
  it("uses end date, falls back to start, and never invents dates", () => {
    expect(projectActualDate({ eventStartDate: "2026-07-31", eventEndDate: "2026-08-01" })).toBe("2026-08-01");
    expect(projectActualDate({ eventStartDate: "2026-07-31", eventEndDate: null })).toBe("2026-07-31");
    expect(projectActualDate({ eventStartDate: null, eventEndDate: null })).toBeNull();
    expect(projectFactPeriodWhere({ from: "2026-08-01", to: "2026-08-31" })).toEqual({ OR: [
      { eventEndDate: { gte: new Date("2026-08-01Z"), lt: new Date("2026-09-01Z") } },
      { eventEndDate: null, eventStartDate: { gte: new Date("2026-08-01Z"), lt: new Date("2026-09-01Z") } },
    ] });
  });
  it("splits the pool without losing or creating a kopeck, including negatives", () => {
    expect(analyticsBonusPool(125735.41)).toBe(18860.31);
    expect(splitAnalyticsMoney(18860.31, 2)).toEqual([9430.16, 9430.15]);
    expect(splitAnalyticsMoney(-0.03, 2)).toEqual([-0.02, -0.01]);
    expect(sumAnalyticsMoney(splitAnalyticsMoney(18860.31, 2))).toBe(18860.31);
    expect(() => splitAnalyticsMoney(1, 0)).toThrow();
  });
  it("shares the core period while retaining separate bonus and reconciliation scopes", () => {
    const old = { from: "2026-01-01", to: "2026-07-23" };
    const next = { from: "2026-01-01", to: "2026-09-07" };
    const scopes = Object.fromEntries(["overview", "projects", "customers", "requisites", "bonuses", "reconciliation"].map(tab => [tab, old])) as Record<AnalyticsTab, typeof old>;
    const changed = updateAnalyticsScope(scopes, "customers", next);
    for (const tab of ["overview", "projects", "customers", "requisites"] as const) expect(changed[tab]).toEqual(next);
    expect(changed.bonuses).toEqual(old); expect(changed.reconciliation).toEqual(old);
    const bonusChanged = updateAnalyticsScope(changed, "bonuses", next);
    expect(bonusChanged.reconciliation).toEqual(old); expect(scopes.customers).toEqual(old);
  });
});
