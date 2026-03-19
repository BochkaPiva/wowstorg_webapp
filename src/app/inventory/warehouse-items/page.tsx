"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Item = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  isActive: boolean;
  internalOnly: boolean;
  pricePerDay: string;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  updatedAt: string;
};

function computeAvailableNow(p: Pick<Item, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, p.total - p.inRepair - p.broken - p.missing);
}

/** Сортировка: сначала с нулём в наличии, потом остальные; внутри — по имени */
function sortWarehouseItems(list: Item[]) {
  return [...list].sort((a, b) => {
    const availA = computeAvailableNow(a);
    const availB = computeAvailableNow(b);
    if (availA === 0 && availB !== 0) return -1;
    if (availA !== 0 && availB === 0) return 1;
    return (a.name || "").localeCompare(b.name || "", "ru");
  });
}

export default function WarehouseItemsPage() {
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const forbidden = state.status === "authenticated" && user?.role !== "WOWSTORG";

  const [query, setQuery] = React.useState("");
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [editTotalId, setEditTotalId] = React.useState<string | null>(null);
  const [editTotalValue, setEditTotalValue] = React.useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set("query", query.trim());
      if (includeInactive) sp.set("includeInactive", "true");
      sp.set("internalOnly", "true");
      const res = await fetch(`/api/inventory/positions?${sp.toString()}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { items?: Item[]; error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить реквизит");
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (forbidden) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbidden]);

  async function patchTotal(id: string, newTotal: number) {
    if (newTotal < 0) return;
    setBusyId(id);
    setError(null);
    setEditTotalId(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total: newTotal }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось обновить");
        return;
      }
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, total: newTotal } : p)),
      );
    } finally {
      setBusyId(null);
    }
  }

  function startEditTotal(p: Item) {
    setEditTotalId(p.id);
    setEditTotalValue(String(p.total));
  }

  function submitEditTotal(p: Item) {
    const n = parseInt(editTotalValue, 10);
    if (!Number.isNaN(n) && n >= 0 && n !== p.total) {
      void patchTotal(p.id, n);
    }
    setEditTotalId(null);
  }

  const sortedItems = sortWarehouseItems(items);

  return (
    <AppShell title="Инвентарь · Складской реквизит">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/inventory/items"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                ← В инвентарь
              </Link>
              <Link
                href="/inventory/warehouse-items/new"
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
              >
                + Новый складской реквизит
              </Link>
            </div>
            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Обновить
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Поиск</label>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void load();
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Например: скотч, удлинитель, инструмент…"
                />
              </div>
              <div className="flex items-end gap-3 md:col-span-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                  />
                  Показывать неактивные
                </label>
                <button
                  type="button"
                  onClick={load}
                  className="ml-auto rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  Найти
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
          ) : null}

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : sortedItems.length === 0 ? (
            <div className="text-sm text-zinc-600">Пусто.</div>
          ) : (
            <div className="space-y-2">
              {sortedItems.map((p) => {
                const avail = computeAvailableNow(p);
                const isZero = avail === 0;
                const busy = busyId === p.id;
                const editing = editTotalId === p.id;

                return (
                  <div
                    key={p.id}
                    className={[
                      "rounded-2xl border p-4 shadow-sm transition",
                      isZero
                        ? "border-red-300 bg-red-50/80"
                        : "border-zinc-200 bg-white hover:border-zinc-300",
                      !p.isActive ? "opacity-80" : "",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={["text-base font-semibold truncate", isZero ? "text-red-900" : "text-zinc-900"].join(" ")}>
                            {p.name}
                          </div>
                          {isZero ? (
                            <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                              Закончилось
                            </span>
                          ) : null}
                          {!p.isActive ? (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
                              неактивен
                            </span>
                          ) : null}
                        </div>
                        {p.description?.trim() ? (
                          <div className="mt-1 text-sm text-zinc-600 line-clamp-2">{p.description}</div>
                        ) : null}
                        <div className={["mt-2 text-xs", isZero ? "text-red-700" : "text-zinc-600"].join(" ")}>
                          Доступно: <strong>{avail}</strong> / {p.total}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white overflow-hidden">
                          <button
                            type="button"
                            disabled={busy || p.total <= 0}
                            onClick={() => patchTotal(p.id, Math.max(0, p.total - 1))}
                            className="h-9 w-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:pointer-events-none"
                            title="Минус 1 (израсходовано)"
                          >
                            −
                          </button>
                          {editing ? (
                            <input
                              type="number"
                              min={0}
                              value={editTotalValue}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^\d+$/.test(v)) setEditTotalValue(v);
                              }}
                              onBlur={() => submitEditTotal(p)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitEditTotal(p);
                                if (e.key === "Escape") setEditTotalId(null);
                              }}
                              className="w-14 h-9 text-center text-sm border-0 border-x border-zinc-200 bg-white"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startEditTotal(p)}
                              className="h-9 min-w-[2.25rem] px-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 border-x border-zinc-200"
                              title="Изменить количество"
                            >
                              {p.total}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patchTotal(p.id, p.total + 1)}
                            className="h-9 w-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                            title="Плюс 1 (докупили)"
                          >
                            +
                          </button>
                        </div>
                        <Link
                          href={`/inventory/warehouse-items/${p.id}`}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                        >
                          В карточку
                        </Link>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      Обновлено: {new Date(p.updatedAt).toLocaleDateString("ru-RU")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

