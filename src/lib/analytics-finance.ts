import { roundMoney } from "@/lib/money";

/** One recognised work, not a payment or a lifetime estimate. Amounts are rubles. */
export type AnalyticsFinancialFact = {
  source: "ORDER" | "PROJECT";
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  revenue: number;
  profit: number;
};

/** Aggregate cents, not individually rounded display rubles. */
export function sumAnalyticsMoney(values: Iterable<number>): number {
  let cents = 0;
  for (const value of values) cents += Math.round(value * 100);
  return cents / 100;
}

export function projectActualDate(project: { eventEndDate: string | null; eventStartDate: string | null }) {
  return project.eventEndDate ?? project.eventStartDate;
}

export function splitAnalyticsMoney(total: number, recipients: number): number[] {
  if (!Number.isInteger(recipients) || recipients < 1) throw new RangeError("Recipients must be a positive integer");
  const cents = Math.round(total * 100);
  const base = Math.trunc(cents / recipients);
  const remainder = cents - base * recipients;
  return Array.from({ length: recipients }, (_, index) =>
    (base + (index < Math.abs(remainder) ? Math.sign(remainder) : 0)) / 100);
}

export function analyticsFactTimeline(facts: AnalyticsFinancialFact[]) {
  const groups = new Map<string, AnalyticsFinancialFact[]>();
  for (const fact of facts) {
    const month = fact.date.slice(0, 7);
    const group = groups.get(month) ?? [];
    group.push(fact); groups.set(month, group);
  }
  return [...groups].map(([month, group]) => ({
    month,
    revenue: sumAnalyticsMoney(group.map(fact => fact.revenue)),
    profit: sumAnalyticsMoney(group.map(fact => fact.profit)),
    orders: group.filter(fact => fact.source === "ORDER").length,
    projects: group.filter(fact => fact.source === "PROJECT").length,
  })).sort((a, b) => a.month.localeCompare(b.month));
}

export function analyticsBonusPool(profit: number) {
  return roundMoney(profit * 0.15);
}
