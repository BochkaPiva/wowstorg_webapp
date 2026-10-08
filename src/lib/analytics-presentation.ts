import type { AdminAnalyticsData, ProjectAnalyticsRow } from "@/server/admin-analytics";

export function isAnalyticsDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function analyticsMargin(revenue: number, profit: number): number | null {
  return revenue > 0 ? profit / revenue * 100 : null;
}

export function isActiveAnalyticsProject(row: ProjectAnalyticsRow) {
  return !row.archived && row.status !== "COMPLETED" && row.status !== "CANCELLED";
}

/** Presentation aggregation only: never recalculate the money of a source entity. */
export function analyticsCustomerRows(data: AdminAnalyticsData) {
  const grouped = new Map<string, ProjectAnalyticsRow[]>();
  for (const project of data.projects.rows) {
    if (!project.customerId) continue;
    const group = grouped.get(project.customerId) ?? [];
    group.push(project);
    grouped.set(project.customerId, group);
  }
  return data.customers.rows.map(customer => {
    const projects = grouped.get(customer.customerId) ?? [];
    const completed = projects.filter(project => project.status === "COMPLETED");
    const active = projects.filter(isActiveAnalyticsProject);
    const money = projects.filter(project => project.status !== "CANCELLED" && project.hasPrimaryEstimate);
    const projectRevenue = money.reduce((sum, project) => sum + project.financials.revenueTotal, 0);
    const projectProfit = money.reduce((sum, project) => sum + project.financials.marginAfterTax, 0);
    const actualProjects = completed.reduce((sum, project) => sum + project.financials.revenueTotal, 0);
    return {
      ...customer,
      actualProjects,
      actualRevenue: actualProjects + customer.closedOrdersFactRevenue,
      activeRevenue: active.reduce((sum, project) => sum + project.financials.revenueTotal, 0),
      projectMargin: analyticsMargin(projectRevenue, projectProfit),
      averageEstimatedProject: money.length ? projectRevenue / money.length : null,
      incompleteCompleted: completed.filter(project => !project.hasPrimaryEstimate).length,
      projects,
    };
  });
}

export function uniqueAnalyticsSignals(data: AdminAnalyticsData) {
  const signals = new Map<string, AdminAnalyticsData["overview"]["attention"][number]>();
  for (const signal of data.overview.attention) {
    const previous = signals.get(signal.projectId);
    if (!previous || previous.severity !== "critical" && signal.severity === "critical") signals.set(signal.projectId, signal);
  }
  return [...signals.values()].sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
}

export function completeAnalyticsTimeline(points: AdminAnalyticsData["overview"]["timeline"], from: string, to: string) {
  if (!isAnalyticsDate(from) || !isAnalyticsDate(to) || from > to) return points;
  const rows = new Map(points.map(point => [point.month, point]));
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = to.slice(0, 7);
  const result: typeof points = [];
  // UI guard: the full original period remains available in Excel.
  for (let index = 0; index < 120 && cursor.toISOString().slice(0, 7) <= end; index++) {
    const month = cursor.toISOString().slice(0, 7);
    result.push(rows.get(month) ?? { month, revenue: 0, profit: 0, orders: 0, projects: 0 });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}
