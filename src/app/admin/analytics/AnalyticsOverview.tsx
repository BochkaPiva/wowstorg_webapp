"use client";

import Link from "next/link";
import React from "react";
import type { AdminAnalyticsData } from "@/server/admin-analytics";
import { analyticsCustomerRows, analyticsMargin, completeAnalyticsTimeline, uniqueAnalyticsSignals } from "@/lib/analytics-presentation";
import { Empty, Filters, Metrics, money, Panel, percent, Sources, Trend } from "./AnalyticsUI";
import s from "./analytics.module.css";

export function AnalyticsOverview({ data, scope, onProjects }: { data: AdminAnalyticsData; scope: { from: string; to: string }; onProjects: () => void }) {
  const [leader, setLeader] = React.useState("customers");
  const finance = data.overview.finance;
  const fact = finance.fact;
  const forecast = finance.forecast;
  const signals = uniqueAnalyticsSignals(data);
  const clients = React.useMemo(() => analyticsCustomerRows(data).sort((a, b) => b.actualRevenue - a.actualRevenue), [data]);
  const leaders = leader === "customers" ? clients.filter(row => row.actualRevenue !== 0).slice(0, 5).map(row => ({ id: row.customerId, label: row.customerName, value: row.actualRevenue })) : leader === "projects" ? [...data.projects.rows].filter(row => row.status === "COMPLETED").sort((a, b) => b.financials.revenueTotal - a.financials.revenueTotal).slice(0, 5).map(row => ({ id: row.projectId, href: `/projects/${row.projectId}`, label: row.title, value: row.financials.revenueTotal })) : data.overview.topItems.slice(0, 5).map(row => ({ id: row.itemId, label: row.itemName, value: row.revenue }));
  const points = completeAnalyticsTimeline(data.overview.timeline, scope.from, scope.to);
  return <div className={s.stack}><Metrics items={[
    { label: "Выручка", value: money(fact.revenueTotal), note: "Завершённые работы" },
    { label: "Прибыль", value: money(fact.profitTotal), note: "Завершённые работы" },
    { label: "Взвешенная маржа", value: percent(analyticsMargin(fact.revenueTotal, fact.profitTotal)), note: "Прибыль / выручка" },
  ]} /><div className={s.chartRow}><Panel title="Выручка и прибыль по месяцам"><Trend points={points} />{points.length === 120 && points.at(-1)?.month !== scope.to.slice(0, 7) && <p className={s.note}>Показаны первые 120 месяцев. Полный период — в Excel.</p>}</Panel><Panel title="Источники выручки"><Sources rows={[{ label: "Самостоятельные заявки", value: fact.standaloneOrdersRevenue }, { label: "Завершённые проекты", value: fact.completedProjectsRevenue }]} /></Panel></div><section className={s.forecast}><div><h2>В работе · Прогноз</h2><p className={s.note}>Ожидаемый результат, не факт</p></div><div><span className={s.label}>Выручка</span><strong>{money(forecast.revenueTotal)}</strong></div><div><span className={s.label}>Прибыль</span><strong>{money(forecast.profitTotal)}</strong></div><div><span className={s.label}>Активные работы</span><strong>{data.overview.kpi.activeProjects + forecast.standaloneOrdersTotal}</strong></div></section><div className={s.lowerRow}><Panel title="Требует внимания" action={<button type="button" className={s.quiet} onClick={onProjects}>Все проекты</button>}>{signals.length ? signals.slice(0, 4).map(signal => <Link key={signal.projectId} href={`/projects/${signal.projectId}`} className={s.signal}><span><strong>{signal.projectTitle}</strong><small>{signal.message}</small></span><span className={`${s.badge} ${s.warning}`}>{signal.severity === "critical" ? "Критично" : "Проверить"}</span></Link>) : <Empty>Сигналов в выбранном периоде нет.</Empty>}</Panel><Panel title="Лидеры по выручке" action={<Filters value={leader} onChange={setLeader} items={[{ value: "customers", label: "Клиенты" }, { value: "projects", label: "Проекты" }, { value: "items", label: "Реквизит" }]} />}>{leaders.length ? leaders.map(row => <div key={row.id} className={s.signal}>{"href" in row ? <Link className={s.cellTitle} href={row.href as string}>{row.label}</Link> : <strong>{row.label}</strong>}<strong>{money(row.value)}</strong></div>) : <Empty>Завершённых работ за период нет.</Empty>}</Panel></div></div>;
}
