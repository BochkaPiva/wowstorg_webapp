"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type RentItem = {
  itemId: string;
  itemName: string;
  qtyInRent: number;
  rentOrdersCount: number;
  nearestReleaseDate: string;
  overdueUnits: number;
};

type RentRow = {
  orderId: string;
  status: "ISSUED" | "RETURN_DECLARED";
  customerName: string;
  itemId: string;
  itemName: string;
  qty: number;
  startDate: string;
  endDate: string;
  overdueDays: number;
};

type Payload = {
  today: string;
  summary: {
    rowsCount: number;
    itemsInRent: number;
    unitsInRent: number;
    overdueRows: number;
    overdueUnits: number;
  };
  byItem: RentItem[];
  rows: RentRow[];
};

function fmtDateRu(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { timeZone: "UTC" });
}

export default function InRentPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/in-rent", { cache: "no-store" });
      const txt = await res.text();
      const json = txt ? (JSON.parse(txt) as Payload | { error?: { message?: string } }) : null;
      if (!res.ok) {
        const msg =
          json && "error" in json && json.error?.message ? json.error.message : "Не удалось загрузить раздел";
        throw new Error(msg);
      }
      setData(json as Payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (forbidden) return;
    void load();
  }, [forbidden, load]);

  return (
    <AppShell title="Инвентарь · В аренде">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/inventory/items"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              ← В инвентарь
            </Link>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Обновить
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Позиций в аренде</div>
                  <div className="mt-1 text-lg font-bold">{data.summary.itemsInRent}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Единиц в аренде</div>
                  <div className="mt-1 text-lg font-bold">{data.summary.unitsInRent}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Строк аренды</div>
                  <div className="mt-1 text-lg font-bold">{data.summary.rowsCount}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-xs text-amber-700">Просроченных строк</div>
                  <div className="mt-1 text-lg font-bold text-amber-900">{data.summary.overdueRows}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <div className="text-xs text-red-700">Просроченных единиц</div>
                  <div className="mt-1 text-lg font-bold text-red-900">{data.summary.overdueUnits}</div>
                </div>
              </div>

              <section className="rounded-2xl border border-zinc-200 bg-white overflow-auto">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-900">Сводка по позициям (в аренде сейчас)</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="p-3 text-left font-medium text-zinc-600">Позиция</th>
                      <th className="p-3 text-right font-medium text-zinc-600">В аренде, шт.</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Заявок</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Освобождение</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Просрочка, шт.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byItem.map((r) => (
                      <tr key={r.itemId} className="border-b border-zinc-100">
                        <td className="p-3 font-medium text-zinc-900">{r.itemName}</td>
                        <td className="p-3 text-right tabular-nums">{r.qtyInRent}</td>
                        <td className="p-3 text-right tabular-nums">{r.rentOrdersCount}</td>
                        <td className="p-3 text-right tabular-nums">{fmtDateRu(r.nearestReleaseDate)}</td>
                        <td className="p-3 text-right tabular-nums">
                          <span
                            className={
                              r.overdueUnits > 0
                                ? "rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-800"
                                : "text-zinc-500"
                            }
                          >
                            {r.overdueUnits}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.byItem.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-zinc-500">
                          Сейчас нет реквизита в аренде.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white overflow-auto">
                <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-900">Детализация по заявкам</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="p-3 text-left font-medium text-zinc-600">Позиция</th>
                      <th className="p-3 text-left font-medium text-zinc-600">Заказчик</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Кол-во</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Период</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Статус</th>
                      <th className="p-3 text-right font-medium text-zinc-600">Заявка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={`${r.orderId}:${r.itemId}:${r.startDate}:${r.qty}`} className="border-b border-zinc-100">
                        <td className="p-3 font-medium text-zinc-900">{r.itemName}</td>
                        <td className="p-3 text-zinc-700">{r.customerName}</td>
                        <td className="p-3 text-right tabular-nums">{r.qty}</td>
                        <td className="p-3 text-right tabular-nums">
                          {fmtDateRu(r.startDate)} — {fmtDateRu(r.endDate)}
                          {r.overdueDays > 0 ? (
                            <span className="ml-2 rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-800">
                              +{r.overdueDays} дн
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 text-right">
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-700">{r.status}</span>
                        </td>
                        <td className="p-3 text-right">
                          <Link
                            href={`/orders/${r.orderId}`}
                            className="text-violet-700 hover:text-violet-900 hover:underline"
                          >
                            Открыть
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-zinc-500">
                          Нет активных выдач.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            </>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

