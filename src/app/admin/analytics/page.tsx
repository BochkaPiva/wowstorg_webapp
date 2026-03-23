"use client";

import React from "react";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Scope = { from: string; to: string };
type TopItem = { itemId: string; itemName: string; issuedQty?: number; revenue?: number };
type TopCustomer = { customerId: string; customerName: string; total: number };
type AnalyticsPayload = {
  kpi: {
    ordersTotal: number;
    ordersClosed: number;
    totalRevenue: number;
    itemsRevenue: number;
    servicesRevenue: number;
    averageOrderRevenue: number;
    averageRentalDays: number;
  };
  breakdowns: {
    byStatus: Array<{ status: string; count: number }>;
    bySource: Array<{ source: string; count: number; revenue: number }>;
    revenueByMonth: Array<{ month: string; revenue: number; orders: number }>;
  };
  tops: {
    topByIssued: TopItem[];
    topByRevenue: TopItem[];
    topCustomers: TopCustomer[];
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

export default function AdminAnalyticsPage() {
  const defaultScope = React.useMemo<Scope>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return { from: `${year}-01-01`, to: `${year}-${month}-${day}` };
  }, []);

  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [globalScope, setGlobalScope] = React.useState<Scope>(defaultScope);
  const [overviewScope, setOverviewScope] = React.useState<Scope>(defaultScope);
  const [topsScope, setTopsScope] = React.useState<Scope>(defaultScope);
  const [profitScope, setProfitScope] = React.useState<Scope>(defaultScope);
  const [globalData, setGlobalData] = React.useState<AnalyticsPayload | null>(null);
  const [overviewData, setOverviewData] = React.useState<AnalyticsPayload | null>(null);
  const [topsData, setTopsData] = React.useState<AnalyticsPayload | null>(null);
  const [profitData, setProfitData] = React.useState<AnalyticsPayload | null>(null);
  const [sectionLoading, setSectionLoading] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchAnalytics = React.useCallback(async (scope: Scope): Promise<AnalyticsPayload> => {
    const params = new URLSearchParams();
    if (scope.from) params.set("from", scope.from);
    if (scope.to) params.set("to", scope.to);
    const qs = params.toString();
    const url = `/api/admin/analytics${qs ? `?${qs}` : ""}`;
    const r = await fetch(url, { cache: "no-store" });
    const data = (await r.json().catch(() => null)) as AnalyticsPayload | null;
    if (!r.ok || !data) throw new Error("Не удалось загрузить аналитику");
    return data;
  }, []);

  React.useEffect(() => {
    if (forbidden) return;
    fetchAnalytics(globalScope)
      .then((d) => {
        setGlobalData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setLoading(false));
  }, [forbidden, fetchAnalytics, globalScope]);

  const applySection = React.useCallback(
    async (key: "overview" | "tops" | "profitability", scope: Scope) => {
      setSectionLoading((s) => ({ ...s, [key]: true }));
      try {
        const data = await fetchAnalytics(scope);
        if (key === "overview") setOverviewData(data);
        if (key === "tops") setTopsData(data);
        if (key === "profitability") setProfitData(data);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setSectionLoading((s) => ({ ...s, [key]: false }));
      }
    },
    [fetchAnalytics],
  );

  const resetSectionToGlobal = React.useCallback((key: "overview" | "tops" | "profitability") => {
    if (key === "overview") {
      setOverviewScope(defaultScope);
      setOverviewData(null);
    }
    if (key === "tops") {
      setTopsScope(defaultScope);
      setTopsData(null);
    }
    if (key === "profitability") {
      setProfitScope(defaultScope);
      setProfitData(null);
    }
  }, [defaultScope]);

  const formatInt = React.useCallback((n: number) => n.toLocaleString("ru-RU"), []);
  const formatMoney = React.useCallback(
    (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [],
  );
  const formatRatio = React.useCallback((n: number | null) => (n == null ? "—" : n.toFixed(2)), []);
  const formatPercent = React.useCallback((n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`), []);
  const kpiTone = React.useCallback((value: number, mode: "positive" | "neutral") => {
    if (mode === "neutral") return "border-zinc-200 bg-white";
    if (value > 0) return "border-emerald-200 bg-emerald-50";
    return "border-rose-200 bg-rose-50";
  }, []);
  const roiTone = React.useCallback((roi: number | null) => {
    if (roi == null) return "border-zinc-200 bg-white";
    if (roi >= 0) return "border-emerald-200 bg-emerald-50";
    return "border-rose-200 bg-rose-50";
  }, []);
  const ratioTone = React.useCallback((ratio: number | null) => {
    if (ratio == null) return "text-zinc-700";
    if (ratio >= 1) return "text-emerald-700";
    return "text-rose-700";
  }, []);
  const overview = (overviewData ?? globalData)!;
  const tops = (topsData ?? globalData)!;
  const profitability = (profitData ?? globalData)!;
  const downloadExport = React.useCallback(
    (section: "global" | "overview" | "tops" | "profitability", scope: Scope) => {
      const params = new URLSearchParams();
      params.set("section", section);
      if (scope.from) params.set("from", scope.from);
      if (scope.to) params.set("to", scope.to);
      window.location.href = `/api/admin/analytics/export?${params.toString()}`;
    },
    [],
  );

  return (
    <AppShell title="Админка · Аналитика">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              ← Админка
            </Link>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-sm font-semibold text-violet-900">Глобальный период (для всех разделов)</div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                С даты
                <input
                  type="date"
                  className="h-10 rounded-xl border border-zinc-300 px-3"
                  value={globalScope.from}
                  onChange={(e) => setGlobalScope((s) => ({ ...s, from: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                По дату
                <input
                  type="date"
                  className="h-10 rounded-xl border border-zinc-300 px-3"
                  value={globalScope.to}
                  onChange={(e) => setGlobalScope((s) => ({ ...s, to: e.target.value }))}
                />
              </label>
              <button
                type="button"
                onClick={() => setGlobalScope(defaultScope)}
                className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Сбросить период
              </button>
              <button
                type="button"
                onClick={() => downloadExport("global", globalScope)}
                className="h-10 rounded-xl border border-violet-300 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-medium text-white hover:from-violet-700 hover:to-fuchsia-700"
              >
                Скачать общий XLSX (все листы)
              </button>
            </div>
          </div>

          {loading || !globalData ? (
            <p className="text-sm text-zinc-500">Загрузка…</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : (
            <>
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-zinc-900">Общий обзор</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void applySection("overview", overviewScope)}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                    >
                      {sectionLoading.overview ? "..." : "Применить период раздела"}
                    </button>
                    <button
                      type="button"
                      onClick={() => resetSectionToGlobal("overview")}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium"
                    >
                      Использовать глобальный
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadExport(
                          "overview",
                          overviewScope.from || overviewScope.to ? overviewScope : globalScope,
                        )
                      }
                      className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
                    >
                      XLSX раздела
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    type="date"
                    className="h-9 rounded-xl border border-zinc-300 px-3 text-sm"
                    value={overviewScope.from}
                    onChange={(e) => setOverviewScope((s) => ({ ...s, from: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="h-9 rounded-xl border border-zinc-300 px-3 text-sm"
                    value={overviewScope.to}
                    onChange={(e) => setOverviewScope((s) => ({ ...s, to: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className={`rounded-2xl border p-4 ${kpiTone(overview.kpi.ordersTotal, "neutral")}`}>
                    <div className="text-xs text-zinc-500">Заявки (все статусы)</div>
                    <div className="mt-1 text-xl font-semibold">{formatInt(overview.kpi.ordersTotal)}</div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${kpiTone(overview.kpi.ordersClosed, "positive")}`}>
                    <div className="text-xs text-zinc-500">Закрытые заявки</div>
                    <div className="mt-1 text-xl font-semibold">{formatInt(overview.kpi.ordersClosed)}</div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${kpiTone(overview.kpi.totalRevenue, "positive")}`}>
                    <div className="text-xs text-zinc-500">Суммарная выручка</div>
                    <div className="mt-1 text-xl font-semibold">{formatInt(overview.kpi.totalRevenue)} ₽</div>
                  </div>
                  <div className={`rounded-2xl border p-4 ${kpiTone(overview.kpi.averageOrderRevenue, "positive")}`}>
                    <div className="text-xs text-zinc-500">Средний чек (закрытые)</div>
                    <div className="mt-1 text-xl font-semibold">{formatInt(overview.kpi.averageOrderRevenue)} ₽</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-800">Статусы заявок</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {overview.breakdowns.byStatus.map((r) => (
                          <tr key={r.status} className="border-b border-zinc-100">
                            <td className="p-3 text-zinc-700">{r.status}</td>
                            <td className="p-3 text-right tabular-nums">{formatInt(r.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-800">Выручка по месяцам</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-100">
                          <th className="p-3 text-left text-zinc-600 font-medium">Месяц</th>
                          <th className="p-3 text-right text-zinc-600 font-medium">Выручка, ₽</th>
                          <th className="p-3 text-right text-zinc-600 font-medium">Закрытых</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.breakdowns.revenueByMonth.map((r) => (
                          <tr key={r.month} className="border-b border-zinc-100">
                            <td className="p-3">{r.month}</td>
                            <td className="p-3 text-right tabular-nums">{formatInt(r.revenue)}</td>
                            <td className="p-3 text-right tabular-nums">{formatInt(r.orders)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-zinc-900">ТОПы: реквизит и заказчики</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void applySection("tops", topsScope)}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                    >
                      {sectionLoading.tops ? "..." : "Применить период раздела"}
                    </button>
                    <button
                      type="button"
                      onClick={() => resetSectionToGlobal("tops")}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium"
                    >
                      Использовать глобальный
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadExport("tops", topsScope.from || topsScope.to ? topsScope : globalScope)}
                      className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
                    >
                      XLSX раздела
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    type="date"
                    className="h-9 rounded-xl border border-zinc-300 px-3 text-sm"
                    value={topsScope.from}
                    onChange={(e) => setTopsScope((s) => ({ ...s, from: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="h-9 rounded-xl border border-zinc-300 px-3 text-sm"
                    value={topsScope.to}
                    onChange={(e) => setTopsScope((s) => ({ ...s, to: e.target.value }))}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-800">Топ по выдачам</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {tops.tops.topByIssued.map((row, i) => (
                          <tr key={row.itemId} className="border-b border-zinc-100">
                            <td className="p-2 text-zinc-400">{i + 1}</td>
                            <td className="p-2">{row.itemName}</td>
                            <td className="p-2 text-right tabular-nums">{formatInt(row.issuedQty ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-800">Топ по выручке</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {tops.tops.topByRevenue.map((row, i) => (
                          <tr key={row.itemId} className="border-b border-zinc-100">
                            <td className="p-2 text-zinc-400">{i + 1}</td>
                            <td className="p-2">{row.itemName}</td>
                            <td className="p-2 text-right tabular-nums">{formatInt(row.revenue ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-zinc-800">Топ заказчиков</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {tops.tops.topCustomers.map((row, i) => (
                          <tr key={row.customerId} className="border-b border-zinc-100">
                            <td className="p-2 text-zinc-400">{i + 1}</td>
                            <td className="p-2">{row.customerName}</td>
                            <td className="p-2 text-right tabular-nums">{formatInt(row.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-zinc-900">Рентабельность реквизита</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void applySection("profitability", profitScope)}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100"
                    >
                      {sectionLoading.profitability ? "..." : "Применить период раздела"}
                    </button>
                    <button
                      type="button"
                      onClick={() => resetSectionToGlobal("profitability")}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium"
                    >
                      Использовать глобальный
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadExport(
                          "profitability",
                          profitScope.from || profitScope.to ? profitScope : globalScope,
                        )
                      }
                      className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
                    >
                      XLSX раздела
                    </button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    type="date"
                    className="h-9 rounded-xl border border-zinc-300 px-3 text-sm"
                    value={profitScope.from}
                    onChange={(e) => setProfitScope((s) => ({ ...s, from: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="h-9 rounded-xl border border-zinc-300 px-3 text-sm"
                    value={profitScope.to}
                    onChange={(e) => setProfitScope((s) => ({ ...s, to: e.target.value }))}
                  />
                </div>
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div
                      className={`rounded-2xl border p-4 ${kpiTone(
                        profitability.profitability.summary.trackedItems,
                        "neutral",
                      )}`}
                    >
                      <div className="text-xs text-zinc-500">Позиции с закупом</div>
                      <div className="mt-1 text-xl font-semibold">{formatInt(profitability.profitability.summary.trackedItems)}</div>
                    </div>
                    <div
                      className={`rounded-2xl border p-4 ${kpiTone(
                        profitability.profitability.summary.itemsWithRevenue,
                        "positive",
                      )}`}
                    >
                      <div className="text-xs text-zinc-500">Позиции с выручкой</div>
                      <div className="mt-1 text-xl font-semibold">{formatInt(profitability.profitability.summary.itemsWithRevenue)}</div>
                    </div>
                    <div className={`rounded-2xl border p-4 ${roiTone(profitability.profitability.summary.totalRoiPercent)}`}>
                      <div className="text-xs text-zinc-500">Суммарный ROI</div>
                      <div className="mt-1 text-xl font-semibold">
                        {formatPercent(profitability.profitability.summary.totalRoiPercent)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <div className="text-zinc-700">Выручка: {formatInt(profitability.profitability.summary.totalRevenue)} ₽</div>
                      <div className="text-zinc-700">Закуп: {formatInt(profitability.profitability.summary.totalPurchaseCost)} ₽</div>
                      <div className="text-zinc-700">Прибыль: {formatInt(profitability.profitability.summary.totalGrossProfit)} ₽</div>
                      <div className="text-zinc-700">Окупаемость: {formatRatio(profitability.profitability.summary.totalPaybackRatio)}x</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                          <th className="text-left p-3 font-semibold text-zinc-700">Позиция</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">Кол-во</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">Закуп, ₽/шт</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">Закуп всего, ₽</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">Выручка, ₽</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">Прибыль, ₽</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">Окупаемость</th>
                          <th className="text-right p-3 font-semibold text-zinc-700">ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profitability.profitability.rows.map((row) => (
                          <tr key={row.itemId} className="border-b border-zinc-100">
                            <td className="p-3 font-medium text-zinc-900">{row.itemName}</td>
                            <td className="p-3 text-right tabular-nums">{formatInt(row.totalQty)}</td>
                            <td className="p-3 text-right tabular-nums">{formatMoney(row.unitPurchasePrice)}</td>
                            <td className="p-3 text-right tabular-nums">{formatInt(row.purchaseCost)}</td>
                            <td className="p-3 text-right tabular-nums">{formatInt(row.revenue)}</td>
                            <td
                              className={[
                                "p-3 text-right tabular-nums font-medium",
                                row.grossProfit >= 0 ? "text-emerald-700" : "text-rose-700",
                              ].join(" ")}
                            >
                              {formatInt(row.grossProfit)}
                            </td>
                            <td className={`p-3 text-right tabular-nums font-medium ${ratioTone(row.paybackRatio)}`}>
                              {formatRatio(row.paybackRatio)}x
                            </td>
                            <td
                              className={[
                                "p-3 text-right tabular-nums font-medium",
                                (row.roiPercent ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700",
                              ].join(" ")}
                            >
                              {formatPercent(row.roiPercent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
