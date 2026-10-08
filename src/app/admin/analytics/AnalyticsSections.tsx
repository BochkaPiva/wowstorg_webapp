"use client";

import Link from "next/link";
import React from "react";
import type { AdminAnalyticsData, ProjectAnalyticsRow } from "@/server/admin-analytics";
import { analyticsCustomerRows, analyticsMargin, completeAnalyticsTimeline, isActiveAnalyticsProject } from "@/lib/analytics-presentation";
import { Column, date, Filters, Methodology, Metrics, money, Panel, percent, SmartTable, status, Trend } from "./AnalyticsUI";
import s from "./analytics.module.css";
type Scope = { from: string; to: string };
const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
const ratio = (value: number | null) => value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}×`;
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div><span className={s.label}>{label}</span><strong>{children}</strong></div>; }
function ProjectMoney({ row }: { row: ProjectAnalyticsRow }) { return <>{row.hasPrimaryEstimate && row.status !== "CANCELLED" ? <><Detail label="Внутренние расходы">{money(row.financials.internalExpensesTotal)}</Detail><Detail label="Налог">{money(row.financials.tax)}</Detail><Detail label="Комиссия">{money(row.financials.commission)}</Detail></> : <Detail label="Финансы">{row.status === "CANCELLED" ? "Отменён — не входит в результат" : "Нет основной сметы"}</Detail>}<Detail label="Сметы / связанные заявки">{row.estimateVersionsCount} / {row.ordersCount}</Detail><Detail label="Без активности">{row.daysSinceActivity} дн.</Detail><Detail label="Риски">{row.risks.length ? row.risks.join(" · ") : "Нет"}</Detail></>; }

export function AnalyticsProjects({ data }: { data: AdminAnalyticsData }) {
  const [filter, setFilter] = React.useState("all");
  const all = data.projects.rows;
  const active = all.filter(isActiveAnalyticsProject);
  const completed = all.filter(row => row.status === "COMPLETED");
  const riskIds = new Set(data.projects.risks.map(row => row.projectId));
  const rows = all.filter(row => filter === "all" || filter === "active" && isActiveAnalyticsProject(row) || filter === "complete" && row.status === "COMPLETED" || filter === "cancelled" && row.status === "CANCELLED" || filter === "risks" && riskIds.has(row.projectId));
  const columns: Column<ProjectAnalyticsRow>[] = [
    { key: "title", label: "Проект / клиент", minWidth: 180, sort: row => row.title, render: row => <><Link href={`/projects/${row.projectId}`} className={s.cellTitle}>{row.title}</Link><p className={s.note}>{row.customerName}</p></> },
    { key: "status", label: "Состояние", sort: row => status(row.status), render: row => <><span className={s.badge}>{status(row.status)}</span>{row.archived && <p className={s.note}>Архив</p>}</> },
    { key: "date", label: "Мероприятие", sort: row => row.eventStartDate, render: row => <>{date(row.eventStartDate)}{!row.eventDateConfirmed && <p className={s.note}>Дата не подтверждена</p>}</> },
    { key: "revenue", label: "Выручка", numeric: true, sort: row => row.hasPrimaryEstimate && row.status !== "CANCELLED" ? row.financials.revenueTotal : null, render: row => row.hasPrimaryEstimate && row.status !== "CANCELLED" ? money(row.financials.revenueTotal) : "—" },
    { key: "profit", label: "Прибыль", numeric: true, sort: row => row.hasPrimaryEstimate && row.status !== "CANCELLED" ? row.financials.marginAfterTax : null, render: row => row.hasPrimaryEstimate && row.status !== "CANCELLED" ? <span className={row.financials.marginAfterTax < 0 ? s.negative : s.positive}>{money(row.financials.marginAfterTax)}</span> : "—" },
    { key: "margin", label: "Маржа", numeric: true, sort: row => row.hasPrimaryEstimate && row.status !== "CANCELLED" ? analyticsMargin(row.financials.revenueTotal, row.financials.marginAfterTax) : null, render: row => row.hasPrimaryEstimate && row.status !== "CANCELLED" ? percent(analyticsMargin(row.financials.revenueTotal, row.financials.marginAfterTax)) : "—" },
  ];
  return <div className={s.stack}><Metrics items={[{ label: "Выручка завершённых", value: money(sum(completed, row => row.financials.revenueTotal)), note: `${completed.length} проектов` }, { label: "Прогноз активных", value: money(sum(active, row => row.financials.revenueTotal)), note: `${active.length} проектов` }, { label: "Прибыль активных", value: money(sum(active, row => row.financials.marginAfterTax)) }, { label: "Требуют внимания", value: riskIds.size, note: "Уникальные проекты" }]} /><Panel title="Проекты за период"><SmartTable rows={rows} columns={columns} rowKey={row => row.projectId} searchText={row => `${row.title} ${row.customerName}`} searchLabel="Найти проект или клиента" defaultSort="revenue" details={row => <ProjectMoney row={row} />} toolbar={<Filters value={filter} onChange={setFilter} items={[{ value: "all", label: "Все" }, { value: "active", label: "В работе" }, { value: "complete", label: "Завершены" }, { value: "risks", label: "С рисками" }, { value: "cancelled", label: "Отменены" }]} />} /><Methodology>Выручка и прибыль завершённых проектов — факт, остальных — расчёт по основной смете. Отменённые не учитываются. Период — по датам мероприятия.</Methodology></Panel></div>;
}

export function AnalyticsCustomers({ data }: { data: AdminAnalyticsData }) {
  const [filter, setFilter] = React.useState("all");
  const all = React.useMemo(() => analyticsCustomerRows(data), [data]);
  const rows = all.filter(row => filter === "all" || filter === "actual" && row.actualRevenue !== 0 || filter === "active" && row.projects.some(isActiveAnalyticsProject));
  type Row = typeof all[number];
  const columns: Column<Row>[] = [
    { key: "name", label: "Клиент", minWidth: 180, sort: row => row.customerName, render: row => <strong className={s.cellTitle}>{row.customerName}</strong> },
    { key: "actual", label: "Завершённые работы", numeric: true, sort: row => row.actualRevenue, render: row => money(row.actualRevenue) },
    { key: "active", label: "В работе · проекты", numeric: true, sort: row => row.activeRevenue, render: row => money(row.activeRevenue) },
    { key: "projects", label: "Проекты", numeric: true, sort: row => row.projects.length, render: row => <>{row.projects.length}<p className={s.note}>{row.projects.filter(isActiveAnalyticsProject).length} в работе</p></> },
    { key: "average", label: "Средняя смета", numeric: true, sort: row => row.averageEstimatedProject, render: row => row.averageEstimatedProject == null ? "—" : money(row.averageEstimatedProject) },
  ];
  const actualClients = all.filter(row => row.actualRevenue !== 0);
  const activeClients = all.filter(row => row.projects.some(isActiveAnalyticsProject));
  return <div className={s.stack}><Metrics items={[{ label: "Клиенты с завершёнными работами", value: actualClients.length }, { label: "Выручка завершённых работ", value: money(sum(all, row => row.actualRevenue)) }, { label: "Клиенты с активными проектами", value: activeClients.length }, { label: "Активные проекты · прогноз", value: money(sum(all, row => row.activeRevenue)) }]} /><Panel title="Клиентская база за период"><SmartTable rows={rows} columns={columns} rowKey={row => row.customerId} searchText={row => row.customerName} searchLabel="Найти клиента" defaultSort="actual" toolbar={<Filters value={filter} onChange={setFilter} items={[{ value: "all", label: "Все" }, { value: "actual", label: "Есть завершённые работы" }, { value: "active", label: "Есть активные проекты" }]} />} details={row => <><Detail label="Завершённые проекты">{money(row.actualProjects)}</Detail><Detail label="Самостоятельные закрытые заявки">{money(row.closedOrdersFactRevenue)}</Detail><Detail label="Маржа только проектов">{percent(row.projectMargin)}</Detail>{row.incompleteCompleted > 0 && <Detail label="Не хватает данных">{row.incompleteCompleted} завершённых проектов без основной сметы</Detail>}<div><span className={s.label}>Проекты клиента</span>{row.projects.length ? row.projects.map(project => <div key={project.projectId}><Link href={`/projects/${project.projectId}`} className={s.cellTitle}>{project.title}</Link><span className={s.note}> · {status(project.status)}</span></div>) : "Нет проектов за период"}</div></>} /><Methodology>Здесь результат выбранного периода, не пожизненный LTV. Средняя смета — по проектам с основной сметой, без отменённых. Прогноз самостоятельных заявок в колонку «В работе» не входит.</Methodology></Panel></div>;
}

export function AnalyticsRequisites({ data, scope }: { data: AdminAnalyticsData; scope: Scope }) {
  const [filter, setFilter] = React.useState("all");
  const r = data.requisites;
  const merged = React.useMemo(() => {
    type Row = { itemId: string; itemName: string; revenue: number | null; issuedQty: number | null; cost: number | null; payback: number | null; roi: number | null; detail?: typeof r.profitability.rows[number] };
    const map = new Map<string, Row>();
    for (const row of r.profitability.rows) map.set(row.itemId, { itemId: row.itemId, itemName: row.itemName, revenue: row.revenue, issuedQty: null, cost: row.purchaseCost, payback: row.paybackRatio, roi: row.roiPercent, detail: row });
    for (const row of r.tops.topByRevenue) { const current = map.get(row.itemId); if (!current) map.set(row.itemId, { ...row, issuedQty: null, cost: null, payback: null, roi: null }); }
    for (const row of r.tops.topByIssued) { const current = map.get(row.itemId); if (current) current.issuedQty = row.issuedQty; else map.set(row.itemId, { ...row, revenue: null, cost: null, payback: null, roi: null }); }
    return [...map.values()];
  }, [r]);
  const rows = merged.filter(row => filter === "all" || filter === "earned" && row.revenue != null && row.revenue !== 0 || filter === "noCost" && !row.cost);
  type Row = typeof merged[number];
  const columns: Column<Row>[] = [
    { key: "name", label: "Позиция", minWidth: 180, sort: row => row.itemName, render: row => <strong className={s.cellTitle}>{row.itemName}</strong> },
    { key: "issued", label: "Выдано, шт.", numeric: true, sort: row => row.issuedQty, render: row => row.issuedQty || "—" },
    { key: "revenue", label: "Выручка", numeric: true, sort: row => row.revenue, render: row => row.revenue == null ? "—" : money(row.revenue) },
    { key: "cost", label: "Стоимость парка", numeric: true, sort: row => row.cost, render: row => row.cost ? money(row.cost) : "Не задана" },
    { key: "payback", label: "Выручка / закуп", numeric: true, sort: row => row.payback, render: row => ratio(row.payback) },
    { key: "roi", label: "ROI периода", numeric: true, sort: row => row.roi, render: row => percent(row.roi) },
  ];
  const points = completeAnalyticsTimeline(r.breakdowns.revenueByMonth.map(point => ({ ...point, projects: 0 })), scope.from, scope.to);
  return <div className={s.stack}><Metrics items={[{ label: "Выручка проката и услуг", value: money(r.kpi.totalRevenue), note: `${r.kpi.ordersClosed} закрытых заявок` }, { label: "Расчётная прибыль", value: money(r.kpi.profitEstimate), positive: r.kpi.profitEstimate >= 0 }, { label: "Средний чек заявки", value: money(r.kpi.averageOrderRevenue) }, { label: "Выручка в работе", value: money(r.forecast.totalRevenue), note: `${r.forecast.ordersTotal} заявок` }]} /><div className={s.chartRow}><Panel title="Прокат по месяцам"><Trend points={points} /></Panel><Panel title="Услуги в закрытых заявках">{[{ label: "Доставка", value: r.services.deliveryRevenue, count: r.services.deliveryOrders }, { label: "Монтаж", value: r.services.montageRevenue, count: r.services.montageOrders }, { label: "Демонтаж", value: r.services.demontageRevenue, count: r.services.demontageOrders }].map(row => <div key={row.label} className={s.signal}><span><strong>{row.label}</strong><small>{row.count} заявок</small></span><strong>{money(row.value)}</strong></div>)}</Panel></div><Panel title="Спрос и окупаемость позиций"><SmartTable rows={rows} columns={columns} rowKey={row => row.itemId} searchText={row => row.itemName} searchLabel="Найти позицию" defaultSort="revenue" toolbar={<Filters value={filter} onChange={setFilter} items={[{ value: "all", label: "Все" }, { value: "earned", label: "С выручкой" }, { value: "noCost", label: "Без закупочной цены" }]} />} details={row => row.detail ? <><Detail label="Количество в парке">{row.detail.totalQty}</Detail><Detail label="Закупка за единицу">{money(row.detail.unitPurchasePrice)}</Detail><Detail label="Валовая прибыль">{money(row.detail.grossProfit)}</Detail><Detail label="Доступность">{row.detail.isActive ? "Активна" : "Скрыта"}{row.detail.internalOnly ? " · только внутреннее использование" : ""}</Detail></> : <Detail label="Нет данных о закупке">Добавьте закупочную стоимость позиции для расчёта окупаемости.</Detail>} /><details className={s.help}><summary>О показателях реквизита</summary><p>Выданное количество — из рейтинга спроса, отсутствие в рейтинге не означает ноль. Выручка / закуп и ROI считаются за выбранный период, не за весь срок владения. Заявки проектов исключены из самостоятельного финансового результата.</p></details></Panel></div>;
}

export function AnalyticsBonuses({ data }: { data: AdminAnalyticsData }) {
  const { fact, forecast, bonuses: bonus } = data.overview.finance;
  return <div className={s.stack}><Metrics items={[{ label: "Бонусный пул · факт", value: money(bonus.factPool), note: `${bonus.ratePercent}% от прибыли` }, { label: "На человека", value: money(bonus.factPerPerson), note: `${bonus.recipients} получателей` }, { label: "Прибыль для расчёта", value: money(fact.profitTotal), positive: fact.profitTotal >= 0 }]} /><div className={s.lowerRow}><Panel title="Расчёт за период">{[{ label: "Прибыль самостоятельных заявок", value: fact.standaloneOrdersProfit }, { label: "Прибыль завершённых проектов", value: fact.completedProjectsProfit }, { label: `Бонусный пул · ${bonus.ratePercent}%`, value: bonus.factPool }, { label: `На человека · ÷ ${bonus.recipients}`, value: bonus.factPerPerson }].map(row => <div className={s.formula} key={row.label}><span>{row.label}</span><strong>{money(row.value)}</strong></div>)}<p className={s.note}>Расчётный пул, не подтверждение выплаты.</p><Methodology>Связанные заявки не дублируют прибыль проектов. Пул — процент от суммарной прибыли самостоятельных закрытых заявок и завершённых проектов; сумма на человека — пул, разделённый на число получателей.</Methodology></Panel><Panel title="Потенциальный бонус"><div className={s.formula}><span>Пул по активным работам</span><strong>{money(bonus.forecastPool)}</strong></div><div className={s.formula}><span>На человека</span><strong>{money(bonus.forecastPerPerson)}</strong></div><div className={s.formula}><span>Прогноз прибыли</span><strong>{money(forecast.profitTotal)}</strong></div><p className={s.note}>Не начислено. Итог изменится после завершения работ и уточнения расходов.</p></Panel></div></div>;
}
