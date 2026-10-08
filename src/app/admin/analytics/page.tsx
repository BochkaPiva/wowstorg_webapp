"use client";

import React from "react";
import { AppShell } from "@/app/_ui/AppShell";
import { DashboardSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import type { AdminAnalyticsData } from "@/server/admin-analytics";
import { isAnalyticsDate, updateAnalyticsScope } from "@/lib/analytics-presentation";
import { AnalyticsOverview } from "./AnalyticsOverview";
import { AnalyticsDataQuality, AnalyticsBonuses, AnalyticsCustomers, AnalyticsProjects, AnalyticsRequisites } from "./AnalyticsSections";
import { AnalyticsReconciliation } from "./AnalyticsReconciliation";
import s from "./analytics.module.css";

type Scope = { from: string; to: string };
type Tab = "overview" | "bonuses" | "reconciliation" | "requisites" | "projects" | "customers";
type PeriodPreset = "month" | "previousMonth" | "quarter" | "30days" | "year";
type AnalyticsPayload = AdminAnalyticsData;

const TAB_META: Array<{
  id: Tab;
  label: string;
  shortLabel: string;
  description: string;
  basis: string;
}> = [
  {
    id: "overview",
    label: "Сводка бизнеса",
    shortLabel: "Обзор",
    description: "Факт, прогноз, структура результата и точки управленческого внимания.",
    basis: "Факт заявок — по дате завершения; прогноз — по пересечению периода аренды. Факт проектов — по окончанию мероприятия; прогноз — по пересечению дат.",
  },
  {
    id: "bonuses",
    label: "Бонусы",
    shortLabel: "Бонусы",
    description: "Отдельный расчёт бонусного пула без привязки к периоду других отчётов.",
    basis: "Факт: закрытые заявки без проекта и завершённые проекты за выбранный период.",
  },
  {
    id: "reconciliation",
    label: "Сверка",
    shortLabel: "Сверка",
    description: "Excel против факта сайта: расхождения, потерянные строки и ошибочные ссылки.",
    basis: "Импорт хранится отдельно и никогда не перезаписывает проекты или заявки.",
  },
  {
    id: "requisites",
    label: "Реквизит и услуги",
    shortLabel: "Реквизит",
    description: "Доходность проката, услуги, спрос и окупаемость складских позиций.",
    basis: "Период определяется по дате завершения заявки.",
  },
  {
    id: "projects",
    label: "Проекты",
    shortLabel: "Проекты",
    description: "Воронка, финансовый прогноз, зрелость процессов и проектные риски.",
    basis: "Завершённые — по окончанию мероприятия (или началу, если окончания нет); остальные — по пересечению дат.",
  },
  {
    id: "customers",
    label: "Клиенты",
    shortLabel: "Клиенты",
    description: "Повторные продажи, ценность клиентской базы и качество портфеля.",
    basis: "Общий период с обзором: завершённые проекты и отдельные заявки по дате окончания; прогноз — отдельно.",
  },
];

function dateOnlyLocal(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetScope(preset: PeriodPreset): Scope {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  if (preset === "month") from.setDate(1);
  if (preset === "previousMonth") {
    from.setMonth(now.getMonth() - 1, 1);
    to.setDate(0);
  }
  if (preset === "quarter") {
    from.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
  }
  if (preset === "30days") from.setDate(now.getDate() - 29);
  if (preset === "year") from.setMonth(0, 1);

  return { from: dateOnlyLocal(from), to: dateOnlyLocal(to) };
}

function initialScopes(): Record<Tab, Scope> {
  const annual = presetScope("year");
  return {
    overview: annual,
    bonuses: presetScope("month"),
    reconciliation: presetScope("month"),
    requisites: annual,
    projects: annual,
    customers: annual,
  };
}

function formatDate(value: string | null) {
  if (!value || !isAnalyticsDate(value.slice(0, 10))) return "Дата не задана";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export default function AdminAnalyticsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");
  const [scopes, setScopes] = React.useState<Record<Tab, Scope>>(initialScopes);
  const [cache, setCache] = React.useState<Record<string, AnalyticsPayload>>({});
  const [ready, setReady] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scope = scopes[activeTab];
  const scopeError = !isAnalyticsDate(scope.from) || !isAnalyticsDate(scope.to) || scope.from > scope.to;
  const cacheKey = `${scope.from}:${scope.to}`;
  const data = cache[cacheKey] ?? null;
  const activeMeta = TAB_META.find(item => item.id === activeTab) ?? TAB_META[0];
  const cacheRef = React.useRef(cache);
  React.useEffect(() => { cacheRef.current = cache; }, [cache]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("wowstorg.analytics.scopes.v3") ?? window.localStorage.getItem("wowstorg.analytics.scopes.v2");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<Tab, Scope>>;
        setScopes(current => {
          const next = { ...current };
          for (const tab of TAB_META) {
            const saved = parsed[tab.id];
            if (saved && isAnalyticsDate(saved.from) && isAnalyticsDate(saved.to)) next[tab.id] = saved;
          }
          return updateAnalyticsScope(next, "overview", next.overview);
        });
      }
    } catch { /* Local preferences must not block analytics. */ }
    setReady(true);
  }, []);
  React.useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem("wowstorg.analytics.scopes.v3", JSON.stringify(scopes)); } catch { /* Optional persistence. */ }
  }, [scopes, ready]);

  React.useEffect(() => {
    if (!ready || state.status !== "authenticated" || forbidden || scopeError || activeTab === "reconciliation" || cacheRef.current[cacheKey]) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/admin/analytics?${new URLSearchParams({ from: scope.from, to: scope.to })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null) as AnalyticsPayload | null;
        if (!response.ok || !payload) throw new Error("Не удалось загрузить аналитику.");
        if (controller.signal.aborted) return;
        setCache(current => {
          const entries = Object.entries(current).slice(-7);
          return { ...Object.fromEntries(entries), [cacheKey]: payload };
        });
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Ошибка загрузки."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeTab, cacheKey, forbidden, ready, revision, scope.from, scope.to, scopeError, state.status]);

  function refresh() {
    const next = { ...cacheRef.current }; delete next[cacheKey]; cacheRef.current = next;
    setCache(next);
    setRevision(current => current + 1);
  }
  const exportSection = ({ overview: "global", requisites: "requisites", projects: "projects", customers: "customers", bonuses: "global", reconciliation: "global" } as const)[activeTab];

  return <AppShell title="Админка · Аналитика">{forbidden ? <div>Раздел доступен только команде Wowstorg.</div> : <section className={s.page} aria-label="Аналитика бизнеса">
    <header className={s.header}><div className={s.headingGroup}><h1>{activeTab === "overview" ? "Результаты бизнеса" : activeMeta.label}</h1><details className={s.datePicker}><summary>{formatDate(scope.from || null)} — {formatDate(scope.to || null)}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg></summary><div className={s.datePopup}><div className={s.period}><label>С<input type="date" aria-label="Начало периода" value={scope.from} onChange={event => setScopes(current => updateAnalyticsScope(current, activeTab, { ...scope, from: event.target.value }))} /></label><label>По<input type="date" aria-label="Конец периода" value={scope.to} onChange={event => setScopes(current => updateAnalyticsScope(current, activeTab, { ...scope, to: event.target.value }))} /></label></div><p className={s.note}>{activeMeta.basis}</p></div></details></div><div className={s.controls}>
      <select className={s.field} aria-label="Быстрый выбор периода" value="" onChange={event => setScopes(current => updateAnalyticsScope(current, activeTab, presetScope(event.target.value as PeriodPreset)))}><option value="" disabled>Выбрать период</option><option value="month">Этот месяц</option><option value="previousMonth">Прошлый месяц</option><option value="quarter">Квартал</option><option value="30days">30 дней</option><option value="year">Этот год</option></select>
      {activeTab !== "reconciliation" && <><button type="button" className={s.button} disabled={loading || scopeError} onClick={refresh}>Обновить</button><a className={s.primary} href={scopeError || !data ? undefined : `/api/admin/analytics/export?${new URLSearchParams({ section: exportSection, ...scope })}`} aria-disabled={scopeError || !data}>Экспорт Excel</a></>}
    </div></header>
    <nav className={s.tabs} aria-label="Разделы аналитики">{["overview", "projects", "customers", "requisites", "bonuses", "reconciliation"].map(id => TAB_META.find(tab => tab.id === id)!).map(tab => <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => { setActiveTab(tab.id); setError(null); }}>{tab.shortLabel}</button>)}</nav>
    {scopeError ? <div className={s.error}>Укажите обе даты; начало периода не должно быть позже конца.</div> : activeTab === "reconciliation" && ready && state.status === "authenticated" ? <AnalyticsReconciliation scope={scope} /> : error ? <div className={s.error}>{error}<button className={s.button} onClick={refresh} type="button">Повторить</button></div> : !ready || !data ? <DashboardSkeleton /> : <>
      {loading && <span className={s.note} role="status">Обновляем данные…</span>}
      {activeTab !== "bonuses" && <AnalyticsDataQuality data={data} />}
      {activeTab === "overview" && <AnalyticsOverview data={data} scope={scope} onProjects={() => setActiveTab("projects")} />}
      {activeTab === "bonuses" && <AnalyticsBonuses data={data} />}
      {activeTab === "requisites" && <AnalyticsRequisites data={data} scope={scope} />}
      {activeTab === "projects" && <AnalyticsProjects data={data} />}
      {activeTab === "customers" && <AnalyticsCustomers data={data} />}
    </>}
  </section>}</AppShell>;
}
