"use client";

import React from "react";
import { AppShell } from "@/app/_ui/AppShell";
import { SectionHeader } from "@/app/_ui/SectionHeader";
import { DashboardSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import { useClientReady } from "@/lib/use-client-ready";
import { useLocalStorageText } from "@/lib/use-local-storage-text";
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
    basis: "Факт заявок — по дате завершения. Факт проектов — по окончанию мероприятия; без дат — временно по закрытию. Прогноз — по пересечению дат.",
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
    basis: "Завершённые — по окончанию мероприятия (или началу); без дат — временно по закрытию. Даты можно уточнить здесь. Остальные — по пересечению дат.",
  },
  {
    id: "customers",
    label: "Клиенты",
    shortLabel: "Клиенты",
    description: "Повторные продажи, ценность клиентской базы и качество портфеля.",
    basis: "Общий период с обзором: отдельные заявки по дате окончания; проекты по дате мероприятия, без неё — временно по закрытию. Прогноз — отдельно.",
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

function restoredScopes(raw: string | null, defaults: Record<Tab, Scope>): Record<Tab, Scope> {
  const next = { ...defaults };
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<Record<Tab, Scope>> | null;
    for (const tab of TAB_META) {
      const saved = parsed?.[tab.id];
      if (saved && isAnalyticsDate(saved.from) && isAnalyticsDate(saved.to)) next[tab.id] = saved;
    }
  } catch { /* Damaged preferences must not block the report. */ }
  return updateAnalyticsScope(next, "overview", next.overview);
}

function formatDate(value: string | null) {
  if (!value || !isAnalyticsDate(value.slice(0, 10))) return "Дата не задана";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export default function AdminAnalyticsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");
  const ready = useClientReady();
  const [storedV3, writeScopes] = useLocalStorageText("wowstorg.analytics.scopes.v3");
  const [storedV2] = useLocalStorageText("wowstorg.analytics.scopes.v2");
  const stored = storedV3 ?? storedV2;
  const [defaults] = React.useState(initialScopes);
  const [scopes, setScopes] = React.useState(() => restoredScopes(stored, defaults));
  const [scopeSource, setScopeSource] = React.useState(stored);
  if (scopeSource !== stored) { setScopeSource(stored); setScopes(restoredScopes(stored, defaults)); }
  const [cache, setCache] = React.useState<Record<string, AnalyticsPayload>>({});
  const authKey = state.status === "authenticated" && !forbidden ? state.user.id : null;
  const [cacheOwner, setCacheOwner] = React.useState(authKey);
  if (cacheOwner !== authKey) { setCacheOwner(authKey); setCache({}); }
  const [revision, setRevision] = React.useState(0);
  const [result, setResult] = React.useState<{ key: string; error: string | null } | null>(null);
  const scope = scopes[activeTab];
  const scopeError = !isAnalyticsDate(scope.from) || !isAnalyticsDate(scope.to) || scope.from > scope.to;
  const cacheKey = `${scope.from}:${scope.to}`;
  const data = state.status === "authenticated" && !forbidden ? cache[cacheKey] ?? null : null;
  const canRequest = ready && state.status === "authenticated" && !forbidden && !scopeError && activeTab !== "reconciliation";
  const requestKey = JSON.stringify([cacheKey, revision, activeTab, authKey]);
  const error = canRequest && result?.key === requestKey ? result.error : null;
  const loading = canRequest && !data && !error;
  const activeMeta = TAB_META.find(item => item.id === activeTab) ?? TAB_META[0];
  React.useEffect(() => {
    if (ready && storedV3 === null) writeScopes(JSON.stringify(scopes));
  }, [ready, storedV3, scopes, writeScopes]);

  React.useEffect(() => {
    if (!canRequest || data) return;
    const controller = new AbortController();
    fetch(`/api/admin/analytics?${new URLSearchParams({ from: scope.from, to: scope.to })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null) as AnalyticsPayload | null;
        if (!response.ok || !payload) throw new Error("Не удалось загрузить аналитику.");
        if (controller.signal.aborted) return;
        setCache(current => {
          const entries = Object.entries(current).slice(-7);
          return { ...Object.fromEntries(entries), [cacheKey]: payload };
        });
        setResult({ key: requestKey, error: null });
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: reason instanceof Error ? reason.message : "Ошибка загрузки." }); });
    return () => controller.abort();
  }, [canRequest, data, cacheKey, requestKey, scope.from, scope.to]);

  function changeScope(nextScope: Scope) {
    const next = updateAnalyticsScope(scopes, activeTab, nextScope);
    const text = JSON.stringify(next);
    // Do not treat our own incomplete date input as an external preference reset.
    setScopeSource(text); setScopes(next); writeScopes(text);
  }

  function refresh() {
    const next = { ...cache }; delete next[cacheKey];
    setCache(next);
    setRevision(current => current + 1);
  }
  function datesChanged() {
    // A date correction moves a fact between periods; all cached periods are stale.
    setCache({});
    setRevision(current => current + 1);
  }
  const exportSection = ({ overview: "global", requisites: "requisites", projects: "projects", customers: "customers", bonuses: "global", reconciliation: "global" } as const)[activeTab];

  return <AppShell title="Админка · Аналитика">{forbidden ? <div>Раздел доступен только команде Wowstorg.</div> : <section className={s.page} aria-label="Аналитика бизнеса">
    <SectionHeader title={activeTab === "overview" ? "Результаты бизнеса" : activeMeta.label} mascot="admin" description="Финансы, проекты и клиенты. Выберите раздел и период для проверки результатов." tabs={<nav aria-label="Разделы аналитики">{["overview", "projects", "customers", "requisites", "bonuses", "reconciliation"].map(id => TAB_META.find(tab => tab.id === id)!).map(tab => <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>{tab.shortLabel}</button>)}</nav>}>
    <div className={s.header}><div className={s.headingGroup}><details className={s.datePicker}><summary>{formatDate(scope.from || null)} — {formatDate(scope.to || null)}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg></summary><div className={s.datePopup}><div className={s.period}><label>С<input type="date" aria-label="Начало периода" value={scope.from} onChange={event => changeScope({ ...scope, from: event.target.value })} /></label><label>По<input type="date" aria-label="Конец периода" value={scope.to} onChange={event => changeScope({ ...scope, to: event.target.value })} /></label></div><p className={s.note}>{activeMeta.basis}</p></div></details></div><div className={s.controls}>
      <select className={s.field} aria-label="Быстрый выбор периода" value="" onChange={event => changeScope(presetScope(event.target.value as PeriodPreset))}><option value="" disabled>Выбрать период</option><option value="month">Этот месяц</option><option value="previousMonth">Прошлый месяц</option><option value="quarter">Квартал</option><option value="30days">30 дней</option><option value="year">Этот год</option></select>
      {activeTab !== "reconciliation" && <><button type="button" className={s.button} disabled={loading || scopeError} onClick={refresh}>Обновить</button><a className={s.primary} href={scopeError || !data ? undefined : `/api/admin/analytics/export?${new URLSearchParams({ section: exportSection, ...scope })}`} aria-disabled={scopeError || !data}>Экспорт Excel</a></>}
    </div></div></SectionHeader>
    {scopeError ? <div className={s.error}>Укажите обе даты; начало периода не должно быть позже конца.</div> : activeTab === "reconciliation" && ready && state.status === "authenticated" ? <AnalyticsReconciliation scope={scope} /> : error ? <div className={s.error}>{error}<button className={s.button} onClick={refresh} type="button">Повторить</button></div> : !ready || !data ? <DashboardSkeleton /> : <>
      {loading && <span className={s.note} role="status">Обновляем данные…</span>}
      {activeTab !== "bonuses" && <AnalyticsDataQuality data={data} onDatesChanged={datesChanged} />}
      {activeTab === "overview" && <AnalyticsOverview data={data} scope={scope} onProjects={() => setActiveTab("projects")} />}
      {activeTab === "bonuses" && <AnalyticsBonuses data={data} />}
      {activeTab === "requisites" && <AnalyticsRequisites data={data} scope={scope} />}
      {activeTab === "projects" && <AnalyticsProjects data={data} onDatesChanged={datesChanged} />}
      {activeTab === "customers" && <AnalyticsCustomers data={data} />}
    </>}
  </section>}</AppShell>;
}
