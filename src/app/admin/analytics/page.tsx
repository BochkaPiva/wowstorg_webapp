"use client";

import React from "react";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Scope = { from: string; to: string };
type Tab = "overview" | "requisites" | "customers" | "projects";

type ProjectRow = {
  projectId: string;
  title: string;
  customerName: string;
  status: string;
  archived: boolean;
  eventStartDate: string | null;
  eventEndDate: string | null;
  eventDateConfirmed: boolean;
  ordersCount: number;
  estimateVersionsCount: number;
  hasPrimaryEstimate: boolean;
  hasLinkedOrder: boolean;
  daysSinceActivity: number;
  currentStatusAgeDays: number;
  healthScore: number;
  risks: string[];
  financials: {
    clientSubtotal: number;
    internalSubtotal: number;
    commission: number;
    revenueTotal: number;
    tax: number;
    grossMargin: number;
    marginAfterTax: number;
    marginAfterTaxPct: number;
  };
};

type CustomerRow = {
  customerId: string;
  customerName: string;
  projectsCount: number;
  activeProjects: number;
  completedProjects: number;
  cancelledProjects: number;
  forecastRevenue: number;
  forecastMarginAfterTax: number;
  averageProjectRevenue: number;
  averageMarginAfterTaxPercent: number;
  closedOrdersFactRevenue: number;
  ltvMixed: number;
  repeat: boolean;
  completionRatePercent: number;
  cancelRatePercent: number;
};

type AnalyticsPayload = {
  period: {
    from: string | null;
    to: string | null;
    dateBasis: {
      requisites: string;
      projects: string;
      customers: string;
    };
  };
  overview: {
    kpi: {
      factRevenue: number;
      factItemsRevenue: number;
      factServicesRevenue: number;
      factGrossProfit: number;
      ordersClosed: number;
      averageOrderRevenue: number;
      projectForecastRevenue: number;
      projectForecastMarginAfterTax: number;
      activeProjects: number;
      completedProjects: number;
      cancelledProjects: number;
      staleProjects: number;
      lowMarginProjects: number;
      repeatCustomers: number;
    };
    finance: {
      fact: {
        standaloneOrdersRevenue: number;
        standaloneOrdersProfit: number;
        completedProjectsRevenue: number;
        completedProjectsProfit: number;
        revenueTotal: number;
        profitTotal: number;
      };
      forecast: {
        standaloneOrdersRevenue: number;
        standaloneOrdersProfit: number;
        standaloneOrdersTotal: number;
        activeProjectsRevenue: number;
        activeProjectsProfit: number;
        revenueTotal: number;
        profitTotal: number;
      };
      bonuses: {
        ratePercent: number;
        recipients: number;
        factPool: number;
        factPerPerson: number;
        forecastPool: number;
        forecastPerPerson: number;
      };
      ownership: {
        linkedOrdersExcluded: number;
        linkedClosedOrdersExcluded: number;
      };
    };
    attention: Array<{
      type: string;
      severity: "warning" | "critical";
      projectId: string;
      projectTitle: string;
      message: string;
    }>;
    topProjects: ProjectRow[];
    topCustomers: CustomerRow[];
    topItems: Array<{ itemId: string; itemName: string; revenue: number }>;
  };
  requisites: {
    kpi: {
      ordersTotal: number;
      ordersClosed: number;
      totalRevenue: number;
      itemsRevenue: number;
      servicesRevenue: number;
      profitEstimate: number;
      averageOrderRevenue: number;
      averageRentalDays: number;
      linkedOrdersExcluded: number;
      linkedClosedOrdersExcluded: number;
    };
    breakdowns: {
      byStatus: Array<{ status: string; count: number }>;
      bySource: Array<{ source: string; count: number; revenue: number }>;
      revenueByMonth: Array<{ month: string; revenue: number; orders: number }>;
    };
    tops: {
      topByIssued: Array<{ itemId: string; itemName: string; issuedQty: number }>;
      topByRevenue: Array<{ itemId: string; itemName: string; revenue: number }>;
      topCustomers: Array<{ customerId: string; customerName: string; total: number }>;
    };
    services: {
      deliveryRevenue: number;
      montageRevenue: number;
      demontageRevenue: number;
      deliveryOrders: number;
      montageOrders: number;
      demontageOrders: number;
    };
    profitability: {
      summary: {
        trackedItems: number;
        itemsWithRevenue: number;
        totalRevenue: number;
        totalPurchaseCost: number;
        totalGrossProfit: number;
        totalPaybackRatio: number | null;
        totalRoiPercent: number | null;
      };
      rows: Array<{
        itemId: string;
        itemName: string;
        totalQty: number;
        unitPurchasePrice: number;
        purchaseCost: number;
        revenue: number;
        grossProfit: number;
        paybackRatio: number | null;
        roiPercent: number | null;
      }>;
    };
  };
  projects: {
    kpi: {
      projectsTotal: number;
      activeProjects: number;
      completedProjects: number;
      cancelledProjects: number;
      archivedProjects: number;
      withPrimaryEstimate: number;
      withoutPrimaryEstimate: number;
      withLinkedOrder: number;
      withoutLinkedOrder: number;
      confirmedDates: number;
      completionRatePercent: number;
      cancelRatePercent: number;
      forecastRevenueTotal: number;
      forecastMarginAfterTax: number;
      actualRevenueTotal: number;
      actualMarginAfterTax: number;
      averageForecastRevenue: number;
      averageMarginAfterTaxPercent: number;
      averageOrdersPerProject: number;
      averageEstimateVersions: number;
      stale7Days: number;
      stale14Days: number;
      lowMarginProjects: number;
    };
    funnel: {
      created: number;
      withPrimaryEstimate: number;
      withConfirmedDates: number;
      withLinkedOrder: number;
      completed: number;
    };
    byStatus: Array<{ status: string; count: number }>;
    statusAging: Array<{ status: string; projects: number; averageCurrentAgeDays: number; maxCurrentAgeDays: number }>;
    topByRevenue: ProjectRow[];
    topByMargin: ProjectRow[];
    lowMargin: ProjectRow[];
    risks: ProjectRow[];
    rows: ProjectRow[];
  };
  customers: {
    kpi: {
      customersTotal: number;
      repeatCustomers: number;
      newCustomers: number;
      forecastRevenueTotal: number;
      forecastMarginAfterTax: number;
      closedOrdersFactRevenue: number;
      averageProjectRevenue: number;
      averageProjectMarginPercent: number;
    };
    rows: CustomerRow[];
  };
  methodology: Array<{ section: string; rule: string }>;
};

function defaultScope(): Scope {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return { from: `${year}-01-01`, to: `${year}-${month}-${day}` };
}

function formatInt(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function formatMoney(n: number) {
  return `${formatInt(n)} ₽`;
}

function formatPercent(n: number | null) {
  return n == null ? "—" : `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function formatRatio(n: number | null) {
  return n == null ? "—" : `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}x`;
}

function kpiTone(tone: "violet" | "emerald" | "amber" | "rose" | "slate") {
  const map = {
    violet: "border-violet-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(124,58,237,0.12),transparent_55%),rgba(255,255,255,0.72)] text-violet-950",
    emerald: "border-emerald-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.13),transparent_55%),rgba(255,255,255,0.72)] text-emerald-950",
    amber: "border-amber-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(250,204,21,0.18),transparent_55%),rgba(255,255,255,0.72)] text-amber-950",
    rose: "border-rose-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(244,63,94,0.12),transparent_55%),rgba(255,255,255,0.72)] text-rose-950",
    slate: "border-white/70 bg-white/70 text-zinc-950",
  } satisfies Record<string, string>;
  return map[tone];
}

function KpiCard(props: { label: string; value: string | number; note?: string; tone?: "violet" | "emerald" | "amber" | "rose" | "slate" }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-[0_16px_40px_rgba(76,29,149,0.08)] backdrop-blur ${kpiTone(props.tone ?? "slate")}`}>
      <div className="text-xs font-black uppercase tracking-[0.14em] opacity-65">{props.label}</div>
      <div className="mt-2 text-2xl font-black tabular-nums">{props.value}</div>
      {props.note ? <div className="mt-1 text-xs font-semibold opacity-65">{props.note}</div> : null}
    </div>
  );
}

function SectionCard(props: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/70 shadow-[0_22px_60px_rgba(76,29,149,0.09)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(245,243,255,0.58))] p-4">
        <h2 className="text-lg font-black text-zinc-950">{props.title}</h2>
        {props.action}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  );
}

function ExportButton(props: { section: "global" | "requisites" | "projects" | "customers"; scope: Scope; children: React.ReactNode; primary?: boolean }) {
  const onClick = React.useCallback(() => {
    const params = new URLSearchParams();
    params.set("section", props.section);
    if (props.scope.from) params.set("from", props.scope.from);
    if (props.scope.to) params.set("to", props.scope.to);
    window.location.href = `/api/admin/analytics/export?${params.toString()}`;
  }, [props.section, props.scope]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        props.primary
          ? "rounded-2xl border border-black/10 bg-zinc-950 px-4 py-2 text-sm font-black text-white shadow-[0_18px_34px_rgba(17,24,39,0.22)] transition hover:-translate-y-0.5 hover:bg-violet-700"
          : "rounded-2xl border border-violet-200/70 bg-white/75 px-3 py-2 text-sm font-black text-violet-800 shadow-[0_12px_26px_rgba(109,40,217,0.09)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-violet-50"
      }
    >
      {props.children}
    </button>
  );
}

export default function AdminAnalyticsPage() {
  const initialScope = React.useMemo(() => defaultScope(), []);
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [scope, setScope] = React.useState<Scope>(initialScope);
  const [data, setData] = React.useState<AnalyticsPayload | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (forbidden) return;
    const params = new URLSearchParams();
    if (scope.from) params.set("from", scope.from);
    if (scope.to) params.set("to", scope.to);
    setLoading(true);
    fetch(`/api/admin/analytics?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const payload = (await r.json().catch(() => null)) as AnalyticsPayload | null;
        if (!r.ok || !payload) throw new Error("Не удалось загрузить аналитику");
        setData(payload);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [forbidden, scope]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Обзор" },
    { id: "requisites", label: "Реквизит" },
    { id: "customers", label: "Заказчики" },
    { id: "projects", label: "Проекты" },
  ];

  return (
    <AppShell title="Админка · Аналитика">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-6">
          <Link href="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            ← Админка
          </Link>

          <div className="rounded-[2rem] border border-white/70 bg-[radial-gradient(circle_at_0%_0%,rgba(124,58,237,0.16),transparent_35%),radial-gradient(circle_at_100%_10%,rgba(250,204,21,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(250,245,255,0.78))] p-5 shadow-[0_26px_70px_rgba(76,29,149,0.12)] backdrop-blur">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-violet-950">Глобальный период отчета</div>
                <div className="mt-1 text-xs text-violet-700">Один период применяется ко всем вкладкам и XLSX.</div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  С даты
                  <input
                    type="date"
                    className="h-11 rounded-2xl border border-white/80 bg-white/80 px-3 font-semibold shadow-sm outline-none backdrop-blur focus:border-violet-300"
                    value={scope.from}
                    onChange={(e) => setScope((s) => ({ ...s, from: e.target.value }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  По дату
                  <input
                    type="date"
                    className="h-11 rounded-2xl border border-white/80 bg-white/80 px-3 font-semibold shadow-sm outline-none backdrop-blur focus:border-violet-300"
                    value={scope.to}
                    onChange={(e) => setScope((s) => ({ ...s, to: e.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setScope(initialScope)}
                  className="h-11 rounded-2xl border border-white/80 bg-white/80 px-4 text-sm font-black text-zinc-800 shadow-sm backdrop-blur hover:bg-white"
                >
                  Сбросить
                </button>
                <ExportButton section="global" scope={scope} primary>
                  Скачать весь отчет
                </ExportButton>
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">Загрузка…</p>
          ) : error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
          ) : data ? (
            <>
              <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-white/70 bg-white/70 p-2 shadow-[0_18px_48px_rgba(76,29,149,0.08)] backdrop-blur">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "rounded-xl px-4 py-2 text-sm font-semibold transition",
                      activeTab === tab.id
                        ? "bg-zinc-950 text-white shadow-[0_12px_28px_rgba(17,24,39,0.2)]"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "overview" ? <OverviewTab data={data} /> : null}
              {activeTab === "requisites" ? <RequisitesTab data={data} scope={scope} /> : null}
              {activeTab === "customers" ? <CustomersTab data={data} scope={scope} /> : null}
              {activeTab === "projects" ? <ProjectsTab data={data} scope={scope} /> : null}

              <details className="group rounded-[1.75rem] border border-white/70 bg-white/70 shadow-[0_22px_60px_rgba(76,29,149,0.09)] backdrop-blur">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-zinc-900">
                  <span>Как считаются показатели</span>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600 transition group-open:rotate-180">
                    ↓
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-zinc-100 p-4 md:grid-cols-2">
                  {data.methodology.map((row) => (
                    <div key={row.section} className="rounded-2xl border border-white/70 bg-white/75 p-3 text-sm shadow-sm">
                      <div className="font-semibold text-zinc-900">{row.section}</div>
                      <div className="mt-1 text-zinc-600">{row.rule}</div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function OverviewTab({ data }: { data: AnalyticsPayload }) {
  const k = data.overview.kpi;
  const finance = data.overview.finance;
  const riskCount = k.staleProjects + k.lowMarginProjects;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_0.9fr]">
        <section className="rounded-[2rem] border border-emerald-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.18),transparent_42%),linear-gradient(135deg,rgba(236,253,245,0.88),rgba(255,255,255,0.72))] p-5 text-emerald-950 shadow-[0_26px_70px_rgba(6,95,70,0.10)] backdrop-blur">
          <div className="text-sm font-bold uppercase tracking-wide opacity-70">Факт</div>
          <div className="mt-2 text-4xl font-black tabular-nums">{formatMoney(finance.fact.profitTotal)}</div>
          <div className="mt-1 text-sm font-medium opacity-80">Прибыль за закрытые деньги периода</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <KpiCard label="Самостоятельные заявки" value={formatMoney(finance.fact.standaloneOrdersProfit)} note={formatMoney(finance.fact.standaloneOrdersRevenue)} />
            <KpiCard label="Завершенные проекты" value={formatMoney(finance.fact.completedProjectsProfit)} note={formatMoney(finance.fact.completedProjectsRevenue)} />
          </div>
        </section>

        <section className="rounded-[2rem] border border-violet-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(124,58,237,0.18),transparent_42%),linear-gradient(135deg,rgba(245,243,255,0.9),rgba(255,255,255,0.72))] p-5 text-violet-950 shadow-[0_26px_70px_rgba(76,29,149,0.10)] backdrop-blur">
          <div className="text-sm font-bold uppercase tracking-wide opacity-70">Прогноз</div>
          <div className="mt-2 text-4xl font-black tabular-nums">{formatMoney(finance.forecast.profitTotal)}</div>
          <div className="mt-1 text-sm font-medium opacity-80">Ожидаемая прибыль по активным заявкам и проектам</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <KpiCard label="Заявки без проекта" value={formatMoney(finance.forecast.standaloneOrdersProfit)} note={`${finance.forecast.standaloneOrdersTotal} шт. · ${formatMoney(finance.forecast.standaloneOrdersRevenue)}`} />
            <KpiCard label="Активные проекты" value={formatMoney(finance.forecast.activeProjectsProfit)} note={`${k.activeProjects} шт. · ${formatMoney(finance.forecast.activeProjectsRevenue)}`} />
          </div>
        </section>

        <section className="rounded-[2rem] border border-amber-200/70 bg-[radial-gradient(circle_at_0%_0%,rgba(250,204,21,0.24),transparent_42%),linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.72))] p-5 text-amber-950 shadow-[0_26px_70px_rgba(146,64,14,0.10)] backdrop-blur">
          <div className="text-sm font-bold uppercase tracking-wide opacity-70">Бонусы {finance.bonuses.ratePercent}%</div>
          <div className="mt-2 text-4xl font-black tabular-nums">{formatMoney(finance.bonuses.factPool)}</div>
          <div className="mt-1 text-sm font-medium opacity-80">Факт, пул на {finance.bonuses.recipients} человек</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <KpiCard label="Факт на человека" value={formatMoney(finance.bonuses.factPerPerson)} />
            <KpiCard label="Прогноз на человека" value={formatMoney(finance.bonuses.forecastPerPerson)} note={formatMoney(finance.bonuses.forecastPool)} />
          </div>
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Закрытые заявки" value={k.ordersClosed} note="Только без проекта" />
        <KpiCard label="Заявки в проектах" value={finance.ownership.linkedClosedOrdersExcluded} note="Исключены из факта заявок" tone={finance.ownership.linkedClosedOrdersExcluded > 0 ? "violet" : "slate"} />
        <KpiCard label="Проекты с рисками" value={riskCount} tone={riskCount > 0 ? "amber" : "slate"} />
        <KpiCard label="Повторные заказчики" value={k.repeatCustomers} />
      </div>
      <SectionCard title="Что требует внимания">
        {data.overview.attention.length === 0 ? (
          <p className="text-sm text-zinc-500">Критичных сигналов за период нет.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.overview.attention.map((item) => (
              <div
                key={`${item.projectId}-${item.message}`}
                className={`rounded-2xl border p-3 text-sm shadow-sm ${
                  item.severity === "critical" ? "border-rose-200/70 bg-rose-50/80" : "border-amber-200/70 bg-amber-50/80"
                }`}
              >
                <div className="font-semibold text-zinc-900">{item.projectTitle}</div>
                <div className="mt-1 text-zinc-700">{item.message}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <MiniTable
          title="Топ проектов"
          headers={["Проект", "Прогноз"]}
          rows={data.overview.topProjects.map((p) => [p.title, formatMoney(p.financials.revenueTotal)])}
        />
        <MiniTable
          title="Топ заказчиков"
          headers={["Заказчик", "LTV mixed"]}
          rows={data.overview.topCustomers.map((c) => [c.customerName, formatMoney(c.ltvMixed)])}
        />
        <MiniTable
          title="Топ реквизита"
          headers={["Позиция", "Выручка"]}
          rows={data.overview.topItems.map((i) => [i.itemName, formatMoney(i.revenue)])}
        />
      </div>
    </div>
  );
}

function RequisitesTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const r = data.requisites;
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <ExportButton section="requisites" scope={scope}>
          Скачать реквизит
        </ExportButton>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Заявки по дате завершения" value={r.kpi.ordersTotal} note="Order.endDate внутри периода" />
        <KpiCard label="Закрытые заявки" value={r.kpi.ordersClosed} tone="emerald" />
        <KpiCard label="Выручка реквизита" value={formatMoney(r.kpi.itemsRevenue)} tone="violet" />
        <KpiCard label="Выручка услуг" value={formatMoney(r.kpi.servicesRevenue)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MiniTable title="Топ по выдачам" headers={["Позиция", "Шт"]} rows={r.tops.topByIssued.map((i) => [i.itemName, formatInt(i.issuedQty)])} />
        <MiniTable title="Топ по выручке" headers={["Позиция", "Выручка"]} rows={r.tops.topByRevenue.map((i) => [i.itemName, formatMoney(i.revenue)])} />
        <MiniTable title="Услуги" headers={["Услуга", "Выручка"]} rows={[
          ["Доставка", formatMoney(r.services.deliveryRevenue)],
          ["Монтаж", formatMoney(r.services.montageRevenue)],
          ["Демонтаж", formatMoney(r.services.demontageRevenue)],
        ]} />
      </div>
      <SectionCard title="Рентабельность реквизита">
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <KpiCard label="Позиции с закупом" value={r.profitability.summary.trackedItems} />
          <KpiCard label="Позиции с выручкой" value={r.profitability.summary.itemsWithRevenue} />
          <KpiCard label="Валовая прибыль" value={formatMoney(r.profitability.summary.totalGrossProfit)} tone={r.profitability.summary.totalGrossProfit >= 0 ? "emerald" : "rose"} />
          <KpiCard label="ROI" value={formatPercent(r.profitability.summary.totalRoiPercent)} />
        </div>
        <DataTable
          headers={["Позиция", "Кол-во", "Закуп", "Выручка", "Прибыль", "Окупаемость", "ROI"]}
          rows={r.profitability.rows.map((row) => [
            row.itemName,
            formatInt(row.totalQty),
            formatMoney(row.purchaseCost),
            formatMoney(row.revenue),
            formatMoney(row.grossProfit),
            formatRatio(row.paybackRatio),
            formatPercent(row.roiPercent),
          ])}
        />
      </SectionCard>
    </div>
  );
}

function CustomersTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const c = data.customers;
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <ExportButton section="customers" scope={scope}>
          Скачать заказчиков
        </ExportButton>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Заказчиков" value={c.kpi.customersTotal} />
        <KpiCard label="Повторных" value={c.kpi.repeatCustomers} tone="violet" />
        <KpiCard label="Прогноз выручки" value={formatMoney(c.kpi.forecastRevenueTotal)} tone="emerald" />
        <KpiCard label="Факт заявок" value={formatMoney(c.kpi.closedOrdersFactRevenue)} />
      </div>
      <SectionCard title="Заказчики">
        <DataTable
          headers={["Заказчик", "Проекты", "Активные", "Заверш.", "Отмен.", "Прогноз", "Маржа", "Факт заявок", "LTV mixed", "Маржа %"]}
          rows={c.rows.map((row) => [
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
      </SectionCard>
    </div>
  );
}

function ProjectsTab({ data, scope }: { data: AnalyticsPayload; scope: Scope }) {
  const p = data.projects;
  const financialRows = p.rows.filter((row) => row.status !== "CANCELLED");
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <ExportButton section="projects" scope={scope}>
          Скачать проекты
        </ExportButton>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Проектов" value={p.kpi.projectsTotal} />
        <KpiCard label="Активные" value={p.kpi.activeProjects} tone="violet" />
        <KpiCard label="Прогноз выручки" value={formatMoney(p.kpi.forecastRevenueTotal)} tone="emerald" />
        <KpiCard label="Маржа после налога" value={formatMoney(p.kpi.forecastMarginAfterTax)} tone={p.kpi.forecastMarginAfterTax >= 0 ? "emerald" : "rose"} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Без сметы" value={p.kpi.withoutPrimaryEstimate} tone={p.kpi.withoutPrimaryEstimate > 0 ? "amber" : "slate"} />
        <KpiCard label="Без заявки" value={p.kpi.withoutLinkedOrder} tone={p.kpi.withoutLinkedOrder > 0 ? "amber" : "slate"} />
        <KpiCard label="Без активности 14+ дней" value={p.kpi.stale14Days} tone={p.kpi.stale14Days > 0 ? "rose" : "slate"} />
        <KpiCard label="Средняя маржа" value={formatPercent(p.kpi.averageMarginAfterTaxPercent)} />
      </div>

      <SectionCard title="Воронка проектов">
        <div className="grid gap-3 md:grid-cols-5">
          <KpiCard label="Созданы" value={p.funnel.created} />
          <KpiCard label="Есть смета" value={p.funnel.withPrimaryEstimate} />
          <KpiCard label="Дата подтверждена" value={p.funnel.withConfirmedDates} />
          <KpiCard label="Есть заявка" value={p.funnel.withLinkedOrder} />
          <KpiCard label="Завершены" value={p.funnel.completed} tone="emerald" />
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <MiniTable title="Возраст статусов" headers={["Статус", "Средн. дней"]} rows={p.statusAging.map((s) => [s.status, formatInt(s.averageCurrentAgeDays)])} />
        <MiniTable title="Проекты с рисками" headers={["Проект", "Сигнал"]} rows={p.risks.slice(0, 12).map((r) => [r.title, r.risks.slice(0, 2).join(", ")])} />
      </div>

      <SectionCard title="Финансы проектов">
        <p className="mb-3 text-xs text-zinc-500">
          Отмененные проекты не входят в финансовый прогноз и эту таблицу. Они остаются в метриках отмен и воронке.
        </p>
        <DataTable
          headers={["Проект", "Заказчик", "Статус", "Выручка", "Внутр.", "Налог", "Маржа", "Маржа %", "Здоровье"]}
          rows={financialRows.map((row) => [
            row.title,
            row.customerName,
            row.status,
            formatMoney(row.financials.revenueTotal),
            formatMoney(row.financials.internalSubtotal),
            formatMoney(row.financials.tax),
            formatMoney(row.financials.marginAfterTax),
            formatPercent(row.financials.marginAfterTaxPct),
            formatInt(row.healthScore),
          ])}
        />
      </SectionCard>
    </div>
  );
}

function MiniTable(props: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/70 shadow-[0_18px_48px_rgba(76,29,149,0.08)] backdrop-blur">
      <div className="border-b border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(245,243,255,0.58))] p-3 text-sm font-black text-zinc-950">{props.title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/70">
            {props.headers.map((h, i) => (
              <th key={h} className={["p-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-500", i === 0 ? "text-left" : "text-right"].join(" ")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.slice(0, 10).map((row, idx) => (
            <tr key={`${row[0]}-${idx}`} className="border-b border-white/60 last:border-0">
              {row.map((cell, i) => (
                <td key={`${cell}-${i}`} className={`p-3 ${i === 0 ? "text-left font-semibold" : "text-right font-bold tabular-nums"} text-zinc-800`}>
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

function DataTable(props: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-auto rounded-[1.5rem] border border-white/70 bg-white/70 shadow-[0_18px_48px_rgba(76,29,149,0.08)] backdrop-blur">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(245,243,255,0.58))]">
            {props.headers.map((h, i) => (
              <th key={h} className={["p-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-500", i === 0 ? "text-left" : "text-right"].join(" ")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, idx) => (
            <tr key={`${row[0]}-${idx}`} className="border-b border-white/60 last:border-0">
              {row.map((cell, i) => (
                <td key={`${cell}-${i}`} className={`p-3 ${i === 0 ? "text-left font-semibold text-zinc-900" : "text-right font-bold tabular-nums text-zinc-700"}`}>
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
