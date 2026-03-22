"use client";

import React from "react";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type TopItem = { itemId: string; itemName: string; issuedQty?: number; revenue?: number };
type TopCustomer = { customerId: string; customerName: string; total: number };

export default function AdminAnalyticsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [topByIssued, setTopByIssued] = React.useState<TopItem[]>([]);
  const [topByRevenue, setTopByRevenue] = React.useState<TopItem[]>([]);
  const [topCustomers, setTopCustomers] = React.useState<TopCustomer[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (forbidden) return;
    let cancelled = false;
    fetch("/api/admin/analytics", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { topByIssued?: TopItem[]; topByRevenue?: TopItem[]; topCustomers?: TopCustomer[] } | null) => {
        if (!cancelled && data) {
          setTopByIssued(data.topByIssued ?? []);
          setTopByRevenue(data.topByRevenue ?? []);
          setTopCustomers(data.topCustomers ?? []);
        } else if (!cancelled) {
          setTopByIssued([]);
          setTopByRevenue([]);
          setTopCustomers([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTopByIssued([]);
          setTopByRevenue([]);
          setTopCustomers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [forbidden]);

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

          <p className="text-sm text-zinc-500">
            По закрытым заявкам. Топ-20 позиций по количеству выдач и по выручке, топ-20 заказчиков по сумме заказов.
          </p>

          {loading ? (
            <p className="text-sm text-zinc-500">Загрузка…</p>
          ) : (
            <>
              <section>
                <h2 className="mb-3 text-lg font-semibold text-zinc-900">Топ реквизита по выдачам (шт.)</h2>
                <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        <th className="text-left p-3 font-semibold text-zinc-700">#</th>
                        <th className="text-left p-3 font-semibold text-zinc-700">Позиция</th>
                        <th className="text-right p-3 font-semibold text-zinc-700">Выдано, шт.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topByIssued.map((row, i) => (
                        <tr key={row.itemId} className="border-b border-zinc-100">
                          <td className="p-3 text-zinc-500">{i + 1}</td>
                          <td className="p-3 font-medium text-zinc-900">{row.itemName}</td>
                          <td className="p-3 text-right tabular-nums">{row.issuedQty ?? 0}</td>
                        </tr>
                      ))}
                      {topByIssued.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-zinc-500">
                            Нет данных по закрытым заявкам
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold text-zinc-900">Топ реквизита по выручке (₽)</h2>
                <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        <th className="text-left p-3 font-semibold text-zinc-700">#</th>
                        <th className="text-left p-3 font-semibold text-zinc-700">Позиция</th>
                        <th className="text-right p-3 font-semibold text-zinc-700">Выручка, ₽</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topByRevenue.map((row, i) => (
                        <tr key={row.itemId} className="border-b border-zinc-100">
                          <td className="p-3 text-zinc-500">{i + 1}</td>
                          <td className="p-3 font-medium text-zinc-900">{row.itemName}</td>
                          <td className="p-3 text-right tabular-nums">
                            {row.revenue != null ? row.revenue.toLocaleString("ru-RU") : "—"}
                          </td>
                        </tr>
                      ))}
                      {topByRevenue.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-zinc-500">
                            Нет данных
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold text-zinc-900">Топ заказчиков по сумме заказов (₽)</h2>
                <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        <th className="text-left p-3 font-semibold text-zinc-700">#</th>
                        <th className="text-left p-3 font-semibold text-zinc-700">Заказчик</th>
                        <th className="text-right p-3 font-semibold text-zinc-700">Сумма, ₽</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCustomers.map((row, i) => (
                        <tr key={row.customerId} className="border-b border-zinc-100">
                          <td className="p-3 text-zinc-500">{i + 1}</td>
                          <td className="p-3 font-medium text-zinc-900">{row.customerName}</td>
                          <td className="p-3 text-right tabular-nums">
                            {row.total.toLocaleString("ru-RU")}
                          </td>
                        </tr>
                      ))}
                      {topCustomers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-zinc-500">
                            Нет данных
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
