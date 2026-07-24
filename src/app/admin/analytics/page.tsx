"use client";

import Link from "next/link";
import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/app/_ui/AppShell";
import { DashboardSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import type {
  AdminAnalyticsData,
  ProjectAnalyticsRow,
} from "@/server/admin-analytics";

type Scope = { from: string; to: string };
type Tab = "overview" | "bonuses" | "reconciliation" | "requisites" | "projects" | "customers";
type PeriodPreset = "month" | "previousMonth" | "quarter" | "30days" | "year";
type AnalyticsPayload = AdminAnalyticsData;

type ReconciliationRow = {
  id?: string;
  rowNumber: number;
  projectName: string;
  revenue: number;
  expenses: number;
  profit: number;
  marginPercent: number;
  bonusPool: number;
  matchStatus: "MATCHED" | "UNMATCHED" | "CONFLICT" | "IGNORED";
  matchedEntityType: "PROJECT" | "ORDER" | null;
  matchedEntityId: string | null;
  matchNote: string | null;
};

type ReconciliationBatch = {
  id: string;
  title: string;
  sourceFileName: string;
  sheetName: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  _count: { rows: number };
};

type ReconciliationSelected = ReconciliationBatch & {
  rows: ReconciliationRow[];
  summary: {
    external: { revenue: number; expenses: number; profit: number; bonusPool: number };
    site: { revenue: number; expenses: number; profit: number; bonusPool: number };
    delta: { revenue: number; expenses: number; profit: number; bonusPool: number };
    matched: number;
    conflicts: number;
    unmatched: number;
  };
};

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
    shortLabel: "Сводка",
    description: "Факт, прогноз, структура результата и точки управленческого внимания.",
    basis: "Заявки — по дате завершения. Проекты — по датам мероприятия.",
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
    basis: "В период попадают проекты, чьи даты мероприятия пересекают интервал.",
  },
  {
    id: "customers",
    label: "Клиенты",
    shortLabel: "Клиенты",
    description: "Повторные продажи, ценность клиентской базы и качество портфеля.",
    basis: "Проекты — по мероприятию, отдельные заявки — по дате завершения.",
  },
];

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новая",
  ESTIMATE_SENT: "Смета отправлена",
  CHANGES: "Правки",
  APPROVED: "Согласована",
  ASSEMBLY: "Сборка",
  ISSUED: "Выдана",
  ACCEPTANCE: "Приёмка",
  CLOSED: "Закрыта",
  LEAD: "Лид",
  IN_PROGRESS: "В работе",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

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

function formatInt(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function formatMoney(value: number) {
  return `${formatInt(value)} ₽`;
}

function formatCompactMoney(value: number) {
  return `${new Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)} ₽`;
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function formatRatio(value: number | null) {
  return value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}×`;
}

function marginPercent(revenue: number, profit: number) {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" })
    .format(new Date(year, month - 1, 1))
    .replace(".", "");
}

function formatDate(value: string | null) {
  if (!value) return "Дата не задана";
  return new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function ExportButton(props: {
  section: "global" | "requisites" | "projects" | "customers";
  scope: Scope;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const onClick = React.useCallback(() => {
    const params = new URLSearchParams({ section: props.section });
    params.set("from", props.scope.from);
    params.set("to", props.scope.to);
    window.location.href = `/api/admin/analytics/export?${params.toString()}`;
  }, [props.scope, props.section]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-10 border px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600",
        props.primary
          ? "border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800"
          : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-600",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function PeriodControl(props: {
  tab: Tab;
  scope: Scope;
  onChange: (scope: Scope) => void;
}) {
  const meta = TAB_META.find((item) => item.id === props.tab) ?? TAB_META[0];
  const error =
    props.scope.from && props.scope.to && props.scope.from > props.scope.to
      ? "Начальная дата не может быть позже конечной."
      : null;

  return (
    <section className="border border-zinc-300 bg-white">
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="max-w-3xl">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">
            Период раздела
          </div>
          <h2 className="mt-1 text-xl font-black text-zinc-950">{meta.label}</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{meta.basis}</p>
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Быстрый выбор периода">
            {([
              ["month", "Этот месяц"],
              ["previousMonth", "Прошлый месяц"],
              ["quarter", "Квартал"],
              ["30days", "30 дней"],
              ["year", "Этот год"],
            ] as Array<[PeriodPreset, string]>).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => props.onChange(presetScope(preset))}
                className="border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 transition-colors hover:border-zinc-950 hover:bg-white hover:text-zinc-950"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
            С даты
            <input
              type="date"
              value={props.scope.from}
              onChange={(event) => props.onChange({ ...props.scope, from: event.target.value })}
              className="mt-1 block h-11 w-full min-w-44 border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-950 outline-none focus:border-violet-600"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">
            По дату
            <input
              type="date"
              value={props.scope.to}
              onChange={(event) => props.onChange({ ...props.scope, to: event.target.value })}
              className="mt-1 block h-11 w-full min-w-44 border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-950 outline-none focus:border-violet-600"
            />
          </label>
        </div>
      </div>
      {error ? (
        <p className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MetricStrip(props: {
  items: Array<{
    label: string;
    value: string | number;
    note?: string;
    accent?: "neutral" | "violet" | "green" | "yellow" | "red";
  }>;
}) {
  const accents = {
    neutral: "text-zinc-950",
    violet: "text-violet-700",
    green: "text-emerald-700",
    yellow: "text-amber-700",
    red: "text-rose-700",
  };

  return (
    <div className="grid border border-zinc-300 bg-white sm:grid-cols-2 xl:grid-cols-4">
      {props.items.map((item) => (
        <div
          key={item.label}
          className="min-h-32 border-b border-zinc-200 p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"
        >
          <div className="text-xs font-black uppercase tracking-[0.13em] text-zinc-500">
            {item.label}
          </div>
          <div
            className={`mt-3 text-3xl font-black tabular-nums ${accents[item.accent ?? "neutral"]}`}
          >
            {item.value}
          </div>
          {item.note ? <p className="mt-2 text-xs leading-5 text-zinc-500">{item.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Panel(props: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-zinc-300 bg-white ${props.className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
        <div>
          {props.eyebrow ? (
            <div className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">
              {props.eyebrow}
            </div>
          ) : null}
          <h2 className="mt-0.5 text-lg font-black text-zinc-950">{props.title}</h2>
          {props.description ? (
            <p className="mt-1 max-w-3xl text-sm leading-5 text-zinc-500">{props.description}</p>
          ) : null}
        </div>
        {props.action}
      </header>
      <div className="p-5">{props.children}</div>
    </section>
  );
}

function FinanceTrend(props: {
  points: Array<{ month: string; revenue: number; profit: number }>;
  emptyText?: string;
}) {
  const points = props.points.slice(-12);
  if (points.length === 0) {
    return <EmptyState>{props.emptyText ?? "За выбранный период нет данных для графика."}</EmptyState>;
  }

  const chartData = points.map((point) => ({
    ...point,
    label: formatMonth(point.month),
  }));
  const latest = chartData.at(-1);

  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-xs font-bold text-zinc-600">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-zinc-950" aria-hidden="true" />
            Выручка
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-violet-600" aria-hidden="true" />
            Прибыль
          </span>
        </div>
        {latest ? (
          <div className="flex gap-5 text-right text-xs text-zinc-500">
            <span>
              <small className="block uppercase tracking-[0.1em]">Последний месяц</small>
              <strong className="mt-1 block text-sm text-zinc-950">{formatMoney(latest.revenue)}</strong>
            </span>
            <span>
              <small className="block uppercase tracking-[0.1em]">Прибыль</small>
              <strong className="mt-1 block text-sm text-violet-700">{formatMoney(latest.profit)}</strong>
            </span>
          </div>
        ) : null}
      </div>
      <div className="h-[320px] min-w-0" role="img" aria-label="График выручки и прибыли по месяцам">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e4e4e0" strokeDasharray="3 5" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 12, fontWeight: 700 }}
              dy={10}
            />
            <YAxis
              yAxisId="revenue"
              axisLine={false}
              tickLine={false}
              width={72}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={formatCompactMoney}
            />
            <YAxis
              yAxisId="profit"
              orientation="right"
              axisLine={false}
              tickLine={false}
              width={72}
              tick={{ fill: "#6d28d9", fontSize: 11 }}
              tickFormatter={formatCompactMoney}
            />
            <Tooltip
              cursor={{ fill: "#f4f4f0" }}
              formatter={(value, name) => [formatMoney(Number(value)), name]}
              labelStyle={{ color: "#18181b", fontWeight: 800, marginBottom: 8 }}
              contentStyle={{
                border: "1px solid #d4d4d0",
                borderRadius: 10,
                boxShadow: "0 8px 18px rgb(0 0 0 / 0.1)",
                fontSize: 12,
              }}
            />
            <Bar
              yAxisId="revenue"
              dataKey="revenue"
              name="Выручка"
              fill="#18181b"
              barSize={36}
              radius={[5, 5, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              yAxisId="profit"
              type="monotone"
              dataKey="profit"
              name="Прибыль"
              stroke="#6d28d9"
              strokeWidth={3}
              dot={{ r: 4, fill: "#6d28d9", stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#6d28d9", stroke: "#fff", strokeWidth: 3 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DistributionBars(props: {
  rows: Array<{ label: string; value: number; meta?: string }>;
  valueFormatter?: (value: number) => string;
  color?: "violet" | "yellow" | "black";
}) {
  const max = Math.max(1, ...props.rows.map((row) => row.value));
  const colors = {
    violet: "bg-violet-600",
    yellow: "bg-amber-400",
    black: "bg-zinc-950",
  };

  if (props.rows.length === 0) return <EmptyState>Нет данных за выбранный период.</EmptyState>;

  return (
    <div className="space-y-4">
      {props.rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4 text-sm">
            <span className="font-semibold text-zinc-800">{row.label}</span>
            <span className="shrink-0 font-black tabular-nums text-zinc-950">
              {props.valueFormatter ? props.valueFormatter(row.value) : formatInt(row.value)}
            </span>
          </div>
          <div className="h-1.5 bg-zinc-100">
            <div
              className={`h-full ${colors[props.color ?? "violet"]}`}
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          {row.meta ? <p className="mt-1 text-xs text-zinc-500">{row.meta}</p> : null}
        </div>
      ))}
    </div>
  );
}

function DataTable(props: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyText?: string;
  minWidth?: number;
}) {
  if (props.rows.length === 0) return <EmptyState>{props.emptyText ?? "Нет данных."}</EmptyState>;

  return (
    <div className="overflow-auto border border-zinc-200">
      <table
        className="w-full text-sm"
        style={{ minWidth: `${props.minWidth ?? 760}px` }}
      >
        <thead className="sticky top-0 bg-zinc-100">
          <tr>
            {props.headers.map((header, index) => (
              <th
                key={header}
                className={`border-b border-zinc-300 px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-zinc-500 ${
                  index === 0 ? "text-left" : "text-right"
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-zinc-200 last:border-b-0 hover:bg-zinc-50">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-4 py-3 align-top ${
                    cellIndex === 0
                      ? "text-left font-semibold text-zinc-950"
                      : "text-right font-bold tabular-nums text-zinc-700"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");
  const [scopes, setScopes] = React.useState<Record<Tab, Scope>>(initialScopes);
  const [cache, setCache] = React.useState<Record<string, AnalyticsPayload>>({});
  const [loadingKey, setLoadingKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scope = scopes[activeTab];
  const scopeError = scope.from > scope.to;
  const cacheKey = `${activeTab}:${scope.from}:${scope.to}`;
  const data = cache[cacheKey] ?? null;
  const activeMeta = TAB_META.find((item) => item.id === activeTab) ?? TAB_META[0];

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("wowstorg.analytics.scopes.v2");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<Tab, Scope>>;
      setScopes((current) => {
        const next = { ...current };
        for (const tab of TAB_META) {
          const saved = parsed[tab.id];
          if (
            saved
            && /^\d{4}-\d{2}-\d{2}$/.test(saved.from)
            && /^\d{4}-\d{2}-\d{2}$/.test(saved.to)
          ) {
            next[tab.id] = saved;
          }
        }
        return next;
      });
    } catch {
      // Локальная настройка периода не должна блокировать аналитику.
    }
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem("wowstorg.analytics.scopes.v2", JSON.stringify(scopes));
  }, [scopes]);

  React.useEffect(() => {
    if (forbidden || scopeError || cache[cacheKey]) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: scope.from, to: scope.to });
    setLoadingKey(cacheKey);
    setError(null);

    fetch(`/api/admin/analytics?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as AnalyticsPayload | null;
        if (!response.ok || !payload) throw new Error("Не удалось загрузить аналитику.");
        setCache((current) => ({ ...current, [cacheKey]: payload }));
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Ошибка загрузки аналитики.");
      })
      .finally(() => setLoadingKey((current) => (current === cacheKey ? null : current)));

    return () => controller.abort();
  }, [cache, cacheKey, forbidden, scope.from, scope.to, scopeError]);

  const updateScope = React.useCallback(
    (next: Scope) => setScopes((current) => ({ ...current, [activeTab]: next })),
    [activeTab],
  );

  return (
    <AppShell title="Админка · Аналитика">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Раздел доступен только команде Wowstorg.</div>
      ) : (
        <main className="space-y-5 pb-10">
          <Link
            href="/admin"
            className="inline-flex text-sm font-bold text-zinc-600 hover:text-zinc-950"
          >
            ← Администрирование
          </Link>

          <header className="border-t-[6px] border-amber-400 bg-zinc-950 px-6 py-7 text-white">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.5fr)] lg:items-end">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">
                  Управленческий центр
                </div>
                <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Аналитика</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                  Не один универсальный отчёт, а отдельные рабочие пространства для финансов,
                  бонусов, реквизита, проектов и клиентской базы.
                </p>
              </div>
              <p className="border-l border-zinc-700 pl-4 text-sm leading-6 text-zinc-400">
                Каждый раздел запоминает собственный период. Смена периода бонусов больше не
                затрагивает проектную или складскую аналитику.
              </p>
            </div>
          </header>

          <nav
            aria-label="Разделы аналитики"
            className="grid border border-zinc-300 bg-white md:grid-cols-3 xl:grid-cols-6"
          >
            {TAB_META.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "min-h-20 border-b border-zinc-200 px-4 py-3 text-left transition-colors last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0",
                  activeTab === tab.id
                    ? "bg-amber-400 text-zinc-950"
                    : "bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950",
                ].join(" ")}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                <span className="block text-[10px] font-black tracking-[0.16em] opacity-60">
                  0{index + 1}
                </span>
                <span className="mt-1 block text-sm font-black">{tab.shortLabel}</span>
              </button>
            ))}
          </nav>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <PeriodControl tab={activeTab} scope={scope} onChange={updateScope} />
            <aside className="border border-zinc-300 bg-zinc-100 p-5">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                Что здесь смотреть
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-zinc-900">
                {activeMeta.description}
              </p>
            </aside>
          </div>

          {scopeError ? null : loadingKey === cacheKey && !data ? (
            <DashboardSkeleton />
          ) : error && !data ? (
            <div className="border border-rose-300 bg-rose-50 p-5 text-sm font-semibold text-rose-800">
              {error}
            </div>
          ) : data ? (
            <>
              {activeTab === "overview" ? <OverviewTab data={data} scope={scope} /> : null}
              {activeTab === "bonuses" ? <BonusesTab data={data} /> : null}
              {activeTab === "reconciliation" ? <ReconciliationTab scope={scope} /> : null}
              {activeTab === "requisites" ? <RequisitesTab data={data} scope={scope} /> : null}
              {activeTab === "projects" ? <ProjectsTab data={data} scope={scope} /> : null}
              {activeTab === "customers" ? <CustomersTab data={data} scope={scope} /> : null}
              <Methodology rows={data.methodology} />
            </>
          ) : null}
        </main>
      )}
    </AppShell>
  );
}

function OverviewTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const finance = data.overview.finance;
  const kpi = data.overview.kpi;
  const factMargin = marginPercent(finance.fact.revenueTotal, finance.fact.profitTotal);
  const forecastMargin = marginPercent(finance.forecast.revenueTotal, finance.forecast.profitTotal);

  return (
    <div className="space-y-5">
      <MetricStrip
        items={[
          {
            label: "Фактическая выручка",
            value: formatMoney(finance.fact.revenueTotal),
            note: "Только завершённые операции",
          },
          {
            label: "Фактическая прибыль",
            value: formatMoney(finance.fact.profitTotal),
            note: `Маржа ${formatPercent(factMargin)}`,
            accent: finance.fact.profitTotal >= 0 ? "green" : "red",
          },
          {
            label: "Прогноз выручки",
            value: formatMoney(finance.forecast.revenueTotal),
            note: "Активные заявки и проекты",
            accent: "violet",
          },
          {
            label: "Прогноз прибыли",
            value: formatMoney(finance.forecast.profitTotal),
            note: `Маржа ${formatPercent(forecastMargin)}`,
            accent: finance.forecast.profitTotal >= 0 ? "violet" : "red",
          },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <Panel
          eyebrow="Динамика"
          title="Финансовый результат"
          description="Выручка и прибыль по закрытым самостоятельным заявкам и завершённым проектам."
          action={
            <ExportButton section="global" scope={scope} primary>
              Скачать отчёт
            </ExportButton>
          }
        >
          <FinanceTrend points={data.overview.timeline} />
        </Panel>

        <Panel
          eyebrow="Структура"
          title="Из чего складывается результат"
          description="Проектная и складская экономика не смешиваются повторно."
        >
          <DistributionBars
            color="black"
            valueFormatter={formatMoney}
            rows={[
              {
                label: "Заявки без проекта",
                value: finance.fact.standaloneOrdersRevenue,
                meta: `Прибыль ${formatMoney(finance.fact.standaloneOrdersProfit)}`,
              },
              {
                label: "Завершённые проекты",
                value: finance.fact.completedProjectsRevenue,
                meta: `Прибыль ${formatMoney(finance.fact.completedProjectsProfit)}`,
              },
            ]}
          />
          <div className="mt-6 border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">
            {finance.ownership.linkedClosedOrdersExcluded > 0
              ? `${finance.ownership.linkedClosedOrdersExcluded} закрытых заявок внутри проектов исключены из складского факта, чтобы не задвоить выручку.`
              : "Связанные заявки не дублируют выручку проектов."}
          </div>
        </Panel>
      </div>

      <MetricStrip
        items={[
          { label: "Закрытые заявки", value: kpi.ordersClosed, note: "Без привязки к проектам" },
          { label: "Активные проекты", value: kpi.activeProjects, accent: "violet" },
          {
            label: "Проекты с рисками",
            value: kpi.staleProjects + kpi.lowMarginProjects,
            note: "Простой или низкая маржа",
            accent: kpi.staleProjects + kpi.lowMarginProjects > 0 ? "yellow" : "green",
          },
          { label: "Повторные клиенты", value: kpi.repeatCustomers },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Panel
          eyebrow="Контроль"
          title="Требует внимания"
          description="Только сигналы, по которым можно принять действие."
        >
          {data.overview.attention.length === 0 ? (
            <EmptyState>Критичных сигналов за период нет.</EmptyState>
          ) : (
            <div className="divide-y divide-zinc-200 border-y border-zinc-200">
              {data.overview.attention.map((item) => (
                <Link
                  key={`${item.projectId}-${item.type}`}
                  href={`/projects/${item.projectId}`}
                  className="grid gap-2 py-4 hover:bg-zinc-50 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center sm:px-3"
                >
                  <span
                    className={`w-fit border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                      item.severity === "critical"
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {item.severity === "critical" ? "Критично" : "Проверить"}
                  </span>
                  <span>
                    <span className="block font-bold text-zinc-950">{item.projectTitle}</span>
                    <span className="mt-0.5 block text-sm text-zinc-500">{item.message}</span>
                  </span>
                  <span className="text-lg text-zinc-400">→</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel eyebrow="Лидеры" title="Топ за период">
          <div className="space-y-6">
            <RankedList
              title="Проекты"
              rows={data.overview.topProjects.map((item) => ({
                label: item.title,
                value: formatMoney(item.financials.revenueTotal),
              }))}
            />
            <RankedList
              title="Клиенты"
              rows={data.overview.topCustomers.map((item) => ({
                label: item.customerName,
                value: formatMoney(item.ltvMixed),
              }))}
            />
            <RankedList
              title="Реквизит"
              rows={data.overview.topItems.map((item) => ({
                label: item.itemName,
                value: formatMoney(item.revenue),
              }))}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BonusesTab({ data }: { data: AnalyticsPayload }) {
  const finance = data.overview.finance;
  const bonus = finance.bonuses;

  return (
    <div className="space-y-5">
      <section className="grid border border-zinc-950 bg-zinc-950 text-white lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="p-6 sm:p-8">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">
            Бонусный пул · факт
          </div>
          <div className="mt-4 text-5xl font-black tabular-nums sm:text-6xl">
            {formatMoney(bonus.factPool)}
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-300">
            {bonus.ratePercent}% от фактической прибыли за собственный период бонусов. В расчёт
            входят только закрытые самостоятельные заявки и завершённые проекты.
          </p>
        </div>
        <div className="grid border-t border-zinc-700 lg:border-l lg:border-t-0">
          <div className="border-b border-zinc-700 p-6">
            <div className="text-xs font-black uppercase tracking-[0.13em] text-zinc-400">
              На одного получателя
            </div>
            <div className="mt-2 text-3xl font-black tabular-nums">
              {formatMoney(bonus.factPerPerson)}
            </div>
            <div className="mt-1 text-sm text-zinc-400">{bonus.recipients} получателя</div>
          </div>
          <div className="p-6">
            <div className="text-xs font-black uppercase tracking-[0.13em] text-zinc-400">
              База расчёта
            </div>
            <div className="mt-2 text-3xl font-black tabular-nums">
              {formatMoney(finance.fact.profitTotal)}
            </div>
            <div className="mt-1 text-sm text-zinc-400">Фактическая прибыль</div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          eyebrow="Формула"
          title="Как получилась сумма"
          description="Расчёт разложен до источников, без скрытого смешения периодов."
        >
          <div className="space-y-3 text-sm">
            <FormulaRow label="Прибыль заявок без проекта" value={finance.fact.standaloneOrdersProfit} />
            <FormulaRow label="Прибыль завершённых проектов" value={finance.fact.completedProjectsProfit} />
            <FormulaRow label="Итого база" value={finance.fact.profitTotal} strong />
            <FormulaRow label={`Бонусный пул · ${bonus.ratePercent}%`} value={bonus.factPool} strong accent />
            <FormulaRow
              label={`На человека · ÷ ${bonus.recipients}`}
              value={bonus.factPerPerson}
              strong
            />
          </div>
        </Panel>

        <Panel
          eyebrow="Не начислено"
          title="Потенциальный бонус"
          description="Прогноз вынесен отдельно и не смешивается с суммой к начислению."
        >
          <div className="text-4xl font-black tabular-nums text-violet-700">
            {formatMoney(bonus.forecastPool)}
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            {formatMoney(bonus.forecastPerPerson)} на человека, если активные заявки и проекты
            завершатся с текущей экономикой.
          </p>
          <div className="mt-6 space-y-3 border-t border-zinc-200 pt-5">
            <FormulaRow
              label="Прогноз прибыли заявок"
              value={finance.forecast.standaloneOrdersProfit}
            />
            <FormulaRow
              label="Прогноз прибыли проектов"
              value={finance.forecast.activeProjectsProfit}
            />
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Динамика"
        title="База бонусов по месяцам"
        description="Линия прибыли показывает, из какой фактической базы формируется бонус."
      >
        <FinanceTrend points={data.overview.timeline} />
      </Panel>
    </div>
  );
}

function ReconciliationTab({ scope }: { scope: Scope }) {
  const [batches, setBatches] = React.useState<ReconciliationBatch[]>([]);
  const [selected, setSelected] = React.useState<ReconciliationSelected | null>(null);
  const [selectedId, setSelectedId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("Сверка");
  const [preview, setPreview] = React.useState<{
    fileName: string;
    sheetName: string;
    rows: ReconciliationRow[];
    totals: { revenue: number; expenses: number; profit: number; bonusPool: number };
    matched: number;
    conflicts: number;
    unmatched: number;
  } | null>(null);
  const [busy, setBusy] = React.useState<"load" | "preview" | "commit" | null>("load");
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (id?: string) => {
    setBusy("load");
    setError(null);
    try {
      const params = new URLSearchParams();
      if (id) params.set("id", id);
      const response = await fetch(`/api/admin/analytics/reconciliation?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        batches?: ReconciliationBatch[];
        selected?: ReconciliationSelected | null;
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error?.message ?? "Не удалось загрузить сверки");
      }
      setBatches(payload.batches ?? []);
      setSelected(payload.selected ?? null);
      if (payload.selected) setSelectedId(payload.selected.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка загрузки сверок");
    } finally {
      setBusy(null);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submit(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(mode);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", title.trim() || file.name.replace(/\.[^.]+$/, ""));
      form.set("from", scope.from);
      form.set("to", scope.to);
      form.set("mode", mode);
      const response = await fetch("/api/admin/analytics/reconciliation", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        preview?: NonNullable<typeof preview>;
        batchId?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error?.message ?? "Не удалось обработать Excel");
      }
      if (payload.preview) setPreview(payload.preview);
      if (mode === "commit" && payload.batchId) {
        setPreview(null);
        await load(payload.batchId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка обработки Excel");
    } finally {
      setBusy(null);
    }
  }

  const report = selected ?? null;
  const rows = preview?.rows ?? report?.rows ?? [];

  return (
    <div className="space-y-5">
      <section className="grid border border-zinc-300 bg-white xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-5 sm:p-6">
          <h2 className="text-2xl font-black tracking-tight text-zinc-950">Импорт внешней таблицы</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Сначала система показывает предварительное сопоставление. Сохранение создаёт отдельный
            снимок сверки и не изменяет суммы, статусы или сметы на сайте.
          </p>
          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(260px,1fr)]">
            <label className="grid gap-1 text-xs font-bold text-zinc-600">
              Название сверки
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-11 border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:border-violet-600"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-zinc-600">
              Excel-файл
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setFile(next);
                  setPreview(null);
                  if (next && title === "Сверка") setTitle(next.name.replace(/\.[^.]+$/, ""));
                }}
                className="h-11 border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 file:mr-3 file:border-0 file:bg-zinc-950 file:px-3 file:py-1 file:font-bold file:text-white"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!file || busy != null}
              onClick={() => void submit("preview")}
              className="h-10 border border-zinc-950 bg-zinc-950 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy === "preview" ? "Проверяем…" : "Предварительная сверка"}
            </button>
            {preview ? (
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void submit("commit")}
                className="h-10 border border-amber-400 bg-amber-400 px-4 text-sm font-black text-zinc-950 disabled:opacity-40"
              >
                {busy === "commit" ? "Сохраняем…" : "Сохранить снимок"}
              </button>
            ) : null}
          </div>
          {error ? <div className="mt-4 border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div> : null}
        </div>
        <aside className="border-t border-zinc-300 bg-zinc-50 p-5 xl:border-l xl:border-t-0">
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
            Сохранённые сверки
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                if (event.target.value) void load(event.target.value);
                else setSelected(null);
              }}
              className="h-11 border border-zinc-300 bg-white px-3 text-sm font-bold normal-case tracking-normal text-zinc-950"
            >
              <option value="">Выберите снимок</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.title} · {formatDate(batch.periodStart)}—{formatDate(batch.periodEnd)}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            Период текущего импорта: {formatDate(scope.from)} — {formatDate(scope.to)}.
          </p>
        </aside>
      </section>

      {preview || report ? (
        <>
          <MetricStrip
            items={[
              {
                label: "Строк",
                value: formatInt(rows.length),
                note: preview ? preview.fileName : report?.sourceFileName ?? "",
              },
              {
                label: "Сопоставлено",
                value: formatInt(preview?.matched ?? report?.summary.matched ?? 0),
                note: "точная ссылка или уникальное название",
                accent: "green",
              },
              {
                label: "Конфликты",
                value: formatInt(preview?.conflicts ?? report?.summary.conflicts ?? 0),
                note: "ссылка и название расходятся",
                accent: (preview?.conflicts ?? report?.summary.conflicts ?? 0) > 0 ? "red" : undefined,
              },
              {
                label: "Не найдено",
                value: formatInt(preview?.unmatched ?? report?.summary.unmatched ?? 0),
                note: "нужно связать вручную",
              },
            ]}
          />

          {report ? (
            <section className="grid border border-zinc-300 bg-white lg:grid-cols-4">
              {(["revenue", "expenses", "profit", "bonusPool"] as const).map((key) => {
                const label = {
                  revenue: "Выручка",
                  expenses: "Расходы",
                  profit: "Прибыль",
                  bonusPool: "Бонусный пул",
                }[key];
                return (
                  <div key={key} className="border-b border-zinc-200 p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                    <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</div>
                    <div className="mt-3 grid gap-1 text-sm">
                      <span>Таблица <b className="float-right tabular-nums">{formatMoney(report.summary.external[key])}</b></span>
                      <span>Сайт <b className="float-right tabular-nums">{formatMoney(report.summary.site[key])}</b></span>
                      <span className="mt-2 border-t border-zinc-200 pt-2 font-bold">
                        Разница
                        <b className={["float-right tabular-nums", Math.abs(report.summary.delta[key]) > 1 ? "text-rose-700" : "text-emerald-700"].join(" ")}>
                          {formatMoney(report.summary.delta[key])}
                        </b>
                      </span>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          <section className="overflow-hidden border border-zinc-300 bg-white">
            <header className="border-b border-zinc-300 px-5 py-4">
              <h2 className="text-lg font-black text-zinc-950">Построчная диагностика</h2>
              <p className="mt-1 text-xs text-zinc-500">Красным отмечены строки, где ссылка ведёт не на тот проект или id отсутствует.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse text-sm">
                <thead className="bg-zinc-100 text-left text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Строка</th>
                    <th className="px-4 py-3">Проект</th>
                    <th className="px-4 py-3 text-right">Выручка</th>
                    <th className="px-4 py-3 text-right">Расходы</th>
                    <th className="px-4 py-3 text-right">Прибыль</th>
                    <th className="px-4 py-3">Сопоставление</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.id ?? "preview"}:${row.rowNumber}`} className="border-t border-zinc-200 align-top">
                      <td className="px-4 py-3 text-zinc-500">{row.rowNumber}</td>
                      <td className="px-4 py-3 font-bold text-zinc-950">{row.projectName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.expenses)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{formatMoney(row.profit)}</td>
                      <td className="px-4 py-3">
                        <span className={[
                          "inline-flex border px-2 py-1 text-[11px] font-black",
                          row.matchStatus === "MATCHED"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : row.matchStatus === "CONFLICT"
                              ? "border-rose-300 bg-rose-50 text-rose-800"
                              : "border-amber-300 bg-amber-50 text-amber-900",
                        ].join(" ")}>
                          {row.matchStatus === "MATCHED" ? "Совпало" : row.matchStatus === "CONFLICT" ? "Конфликт" : "Не найдено"}
                        </span>
                        <span className="mt-1 block max-w-sm text-xs leading-5 text-zinc-500">{row.matchNote}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <EmptyState>Загрузите таблицу или выберите сохранённый снимок сверки.</EmptyState>
      )}
    </div>
  );
}

function RequisitesTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const requisites = data.requisites;
  const factMargin = marginPercent(requisites.kpi.totalRevenue, requisites.kpi.profitEstimate);
  const serviceRows = [
    {
      label: "Доставка",
      value: requisites.services.deliveryRevenue,
      meta: `${requisites.services.deliveryOrders} заявок`,
    },
    {
      label: "Монтаж",
      value: requisites.services.montageRevenue,
      meta: `${requisites.services.montageOrders} заявок`,
    },
    {
      label: "Демонтаж",
      value: requisites.services.demontageRevenue,
      meta: `${requisites.services.demontageOrders} заявок`,
    },
  ];

  return (
    <div className="space-y-5">
      <MetricStrip
        items={[
          {
            label: "Выручка · факт",
            value: formatMoney(requisites.kpi.totalRevenue),
            note: `${requisites.kpi.ordersClosed} закрытых заявок`,
          },
          {
            label: "Прибыль · факт",
            value: formatMoney(requisites.kpi.profitEstimate),
            note: `Маржа ${formatPercent(factMargin)}`,
            accent: requisites.kpi.profitEstimate >= 0 ? "green" : "red",
          },
          {
            label: "Выручка · прогноз",
            value: formatMoney(requisites.forecast.totalRevenue),
            note: `${requisites.forecast.ordersTotal} активных заявок`,
            accent: "violet",
          },
          {
            label: "Средний чек",
            value: formatMoney(requisites.kpi.averageOrderRevenue),
            note: `Средняя аренда ${requisites.kpi.averageRentalDays.toLocaleString("ru-RU")} дн.`,
          },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <Panel
          eyebrow="Динамика"
          title="Доходность проката"
          action={
            <ExportButton section="requisites" scope={scope}>
              Скачать реквизит
            </ExportButton>
          }
        >
          <FinanceTrend points={requisites.breakdowns.revenueByMonth} />
        </Panel>
        <Panel eyebrow="Услуги" title="Дополнительная выручка">
          <DistributionBars rows={serviceRows} valueFormatter={formatMoney} color="yellow" />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Спрос по позициям">
          <RankedList
            rows={requisites.tops.topByIssued.slice(0, 8).map((item) => ({
              label: item.itemName,
              value: `${formatInt(item.issuedQty)} шт.`,
            }))}
          />
        </Panel>
        <Panel title="Выручка по позициям">
          <RankedList
            rows={requisites.tops.topByRevenue.slice(0, 8).map((item) => ({
              label: item.itemName,
              value: formatMoney(item.revenue),
            }))}
          />
        </Panel>
        <Panel title="Источники заявок">
          <DistributionBars
            rows={requisites.breakdowns.bySource.map((item) => ({
              label: item.source,
              value: item.revenue,
              meta: `${item.count} заявок`,
            }))}
            valueFormatter={formatMoney}
          />
        </Panel>
      </div>

      <Panel
        eyebrow="Инвестиции"
        title="Окупаемость реквизита"
        description="Закупочная стоимость сравнивается с фактической выручкой позиции."
      >
        <div className="mb-5 grid border border-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
          <CompactMetric label="Позиций с закупом" value={requisites.profitability.summary.trackedItems} />
          <CompactMetric label="С выручкой" value={requisites.profitability.summary.itemsWithRevenue} />
          <CompactMetric
            label="Валовая прибыль"
            value={formatMoney(requisites.profitability.summary.totalGrossProfit)}
          />
          <CompactMetric label="ROI" value={formatPercent(requisites.profitability.summary.totalRoiPercent)} />
        </div>
        <DataTable
          minWidth={940}
          headers={["Позиция", "Кол-во", "Закуп", "Выручка", "Валовая прибыль", "Окупаемость", "ROI"]}
          rows={requisites.profitability.rows.map((row) => [
            row.itemName,
            formatInt(row.totalQty),
            formatMoney(row.purchaseCost),
            formatMoney(row.revenue),
            formatMoney(row.grossProfit),
            formatRatio(row.paybackRatio),
            formatPercent(row.roiPercent),
          ])}
        />
      </Panel>
    </div>
  );
}

function ProjectsTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const projects = data.projects;
  const financialRows = projects.rows.filter((row) => row.status !== "CANCELLED");

  return (
    <div className="space-y-5">
      <MetricStrip
        items={[
          { label: "Активные проекты", value: projects.kpi.activeProjects, accent: "violet" },
          {
            label: "Прогноз выручки",
            value: formatMoney(projects.kpi.forecastRevenueTotal),
          },
          {
            label: "Прогноз прибыли",
            value: formatMoney(projects.kpi.forecastMarginAfterTax),
            note: `Маржа ${formatPercent(projects.kpi.averageMarginAfterTaxPercent)}`,
            accent: projects.kpi.forecastMarginAfterTax >= 0 ? "green" : "red",
          },
          {
            label: "Завершено / отменено",
            value: `${projects.kpi.completedProjects} / ${projects.kpi.cancelledProjects}`,
            note: `Конверсия ${formatPercent(projects.kpi.completionRatePercent)}`,
          },
        ]}
      />

      <Panel
        eyebrow="Процесс"
        title="Воронка готовности проекта"
        description="Показывает, на каком обязательном шаге теряются проекты."
        action={
          <ExportButton section="projects" scope={scope}>
            Скачать проекты
          </ExportButton>
        }
      >
        <Funnel
          stages={[
            { label: "Созданы", value: projects.funnel.created },
            { label: "Есть смета", value: projects.funnel.withPrimaryEstimate },
            { label: "Дата подтверждена", value: projects.funnel.withConfirmedDates },
            { label: "Заявка связана", value: projects.funnel.withLinkedOrder },
            { label: "Завершены", value: projects.funnel.completed },
          ]}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Panel
          eyebrow="Риски"
          title="Проекты, требующие решения"
          description="Сначала критичные и давно не обновлявшиеся проекты."
        >
          {projects.risks.length === 0 ? (
            <EmptyState>Проектных рисков за период нет.</EmptyState>
          ) : (
            <div className="divide-y divide-zinc-200 border-y border-zinc-200">
              {projects.risks.slice(0, 12).map((project) => (
                <ProjectSignal key={project.projectId} project={project} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Возраст текущих статусов">
          <DistributionBars
            color="yellow"
            rows={projects.statusAging.map((item) => ({
              label: statusLabel(item.status),
              value: item.averageCurrentAgeDays,
              meta: `${item.projects} проектов · максимум ${item.maxCurrentAgeDays} дн.`,
            }))}
            valueFormatter={(value) => `${formatInt(value)} дн.`}
          />
        </Panel>
      </div>

      <Panel
        eyebrow="Экономика"
        title="Финансы проектов"
        description="Отменённые проекты не входят в прогноз, но остаются в метриках процесса."
      >
        <DataTable
          minWidth={1120}
          headers={["Проект", "Клиент", "Статус", "Дата", "Выручка", "Внутренние", "Налог", "Прибыль", "Маржа", "Здоровье"]}
          rows={financialRows.map((row) => [
            <Link key={row.projectId} href={`/projects/${row.projectId}`} className="hover:text-violet-700">
              {row.title}
            </Link>,
            row.customerName,
            statusLabel(row.status),
            formatDate(row.eventStartDate),
            formatMoney(row.financials.revenueTotal),
            formatMoney(row.financials.internalExpensesTotal),
            formatMoney(row.financials.tax),
            formatMoney(row.financials.marginAfterTax),
            formatPercent(row.financials.marginAfterTaxPct),
            formatInt(row.healthScore),
          ])}
        />
      </Panel>
    </div>
  );
}

function CustomersTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const customers = data.customers;
  const repeatShare =
    customers.kpi.customersTotal > 0
      ? (customers.kpi.repeatCustomers / customers.kpi.customersTotal) * 100
      : 0;

  return (
    <div className="space-y-5">
      <MetricStrip
        items={[
          { label: "Клиентов в периоде", value: customers.kpi.customersTotal },
          {
            label: "Повторные клиенты",
            value: customers.kpi.repeatCustomers,
            note: `${formatPercent(repeatShare)} базы`,
            accent: "violet",
          },
          {
            label: "Прогноз выручки",
            value: formatMoney(customers.kpi.forecastRevenueTotal),
          },
          {
            label: "Факт отдельных заявок",
            value: formatMoney(customers.kpi.closedOrdersFactRevenue),
            accent: "green",
          },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          eyebrow="Состав базы"
          title="Новые и повторные"
          action={
            <ExportButton section="customers" scope={scope}>
              Скачать клиентов
            </ExportButton>
          }
        >
          <DistributionBars
            color="violet"
            rows={[
              { label: "Повторные", value: customers.kpi.repeatCustomers },
              { label: "Новые", value: customers.kpi.newCustomers },
            ]}
          />
        </Panel>
        <Panel eyebrow="Качество портфеля" title="Средние показатели">
          <div className="grid border border-zinc-200 sm:grid-cols-2">
            <CompactMetric
              label="Средний проект"
              value={formatMoney(customers.kpi.averageProjectRevenue)}
            />
            <CompactMetric
              label="Средняя маржа"
              value={formatPercent(customers.kpi.averageProjectMarginPercent)}
            />
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Клиентская база"
        title="Ценность и повторные продажи"
        description="LTV mixed объединяет прогноз проектов и факт самостоятельных закрытых заявок."
      >
        <DataTable
          minWidth={1120}
          headers={["Клиент", "Проекты", "Активные", "Завершены", "Отменены", "Прогноз", "Прибыль", "Факт заявок", "LTV mixed", "Маржа"]}
          rows={customers.rows.map((row) => [
            row.customerName,
            formatInt(row.projectsCount),
            formatInt(row.activeProjects),
            formatInt(row.completedProjects),
            formatInt(row.cancelledProjects),
            formatMoney(row.forecastRevenue),
            formatMoney(row.forecastMarginAfterTax),
            formatMoney(row.closedOrdersFactRevenue),
            formatMoney(row.ltvMixed),
            formatPercent(row.averageMarginAfterTaxPercent),
          ])}
        />
      </Panel>
    </div>
  );
}

function RankedList(props: {
  title?: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      {props.title ? (
        <h3 className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
          {props.title}
        </h3>
      ) : null}
      {props.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Нет данных.</p>
      ) : (
        <ol className="divide-y divide-zinc-200 border-y border-zinc-200">
          {props.rows.slice(0, 8).map((row, index) => (
            <li key={`${row.label}-${index}`} className="grid grid-cols-[26px_minmax(0,1fr)_auto] gap-2 py-2.5 text-sm">
              <span className="font-black tabular-nums text-zinc-400">
                {`${index + 1}`.padStart(2, "0")}
              </span>
              <span className="truncate font-semibold text-zinc-800">{row.label}</span>
              <span className="font-black tabular-nums text-zinc-950">{row.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FormulaRow(props: {
  label: string;
  value: number;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-b border-zinc-200 py-3 last:border-b-0 ${
        props.strong ? "font-black" : ""
      }`}
    >
      <span className={props.accent ? "text-violet-700" : "text-zinc-600"}>{props.label}</span>
      <span className={`shrink-0 tabular-nums ${props.accent ? "text-violet-700" : "text-zinc-950"}`}>
        {formatMoney(props.value)}
      </span>
    </div>
  );
}

function CompactMetric(props: { label: string; value: string | number }) {
  return (
    <div className="border-b border-zinc-200 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">{props.label}</div>
      <div className="mt-2 text-xl font-black tabular-nums text-zinc-950">{props.value}</div>
    </div>
  );
}

function Funnel(props: { stages: Array<{ label: string; value: number }> }) {
  const base = Math.max(1, props.stages[0]?.value ?? 1);
  return (
    <div className="grid gap-3 md:grid-cols-5">
      {props.stages.map((stage, index) => {
        const share = (stage.value / base) * 100;
        return (
          <div key={stage.label} className="relative border border-zinc-300 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10px] font-black tracking-[0.14em] text-zinc-400">
                0{index + 1}
              </span>
              <span className="text-xs font-bold text-zinc-500">{formatPercent(share)}</span>
            </div>
            <div className="mt-4 text-3xl font-black tabular-nums text-zinc-950">{stage.value}</div>
            <div className="mt-1 text-sm font-bold text-zinc-700">{stage.label}</div>
            <div className="mt-4 h-1 bg-zinc-100">
              <div className="h-full bg-violet-600" style={{ width: `${Math.max(2, share)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectSignal({ project }: { project: ProjectAnalyticsRow }) {
  return (
    <Link
      href={`/projects/${project.projectId}`}
      className="grid gap-2 py-4 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3"
    >
      <span>
        <span className="block font-bold text-zinc-950">{project.title}</span>
        <span className="mt-1 block text-sm text-zinc-500">{project.risks.slice(0, 3).join(" · ")}</span>
      </span>
      <span className="flex items-center gap-3">
        <span
          className={`border px-2 py-1 text-xs font-black tabular-nums ${
            project.healthScore < 45
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          {project.healthScore}/100
        </span>
        <span className="text-lg text-zinc-400">→</span>
      </span>
    </Link>
  );
}

function Methodology({ rows }: { rows: AnalyticsPayload["methodology"] }) {
  return (
    <details className="group border border-zinc-300 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-black text-zinc-900">
        <span>Методика и границы расчёта</span>
        <span className="text-lg text-zinc-400 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="grid border-t border-zinc-200 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.section} className="border-b border-zinc-200 p-5 last:border-b-0 md:border-r md:[&:nth-child(even)]:border-r-0">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-violet-700">
              {row.section}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{row.rule}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
