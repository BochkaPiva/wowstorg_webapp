"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Item = { id: string; name: string; isActive: boolean; available?: number };
type KitLine = { itemId: string; defaultQty: number };
type ApiError = { error?: { message?: string } };
type PackageGetResponse = {
  kit?: {
    name?: string | null;
    description?: string | null;
    isActive?: boolean;
    lines?: Array<{ itemId: string; defaultQty: number }>;
  };
  items?: Item[];
  error?: { message?: string };
};

export default function PackageEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const forbidden = state.status === "authenticated" && user?.role !== "WOWSTORG";
  // Next 16: dynamic params are async
  const { id } = React.use(params);

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [kitName, setKitName] = React.useState("");
  const [kitDescription, setKitDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [items, setItems] = React.useState<Item[]>([]);
  const [lines, setLines] = React.useState<Record<string, string>>({});
  const [search, setSearch] = React.useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/packages/${id}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as PackageGetResponse) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить пакет");
      if (!data.kit) throw new Error("Пакет не найден");
      const kit = data.kit;
      setKitName(kit.name ?? "");
      setKitDescription(kit.description ?? "");
      setIsActive(Boolean(kit.isActive));
      const itemsList = data.items ?? [];
      setItems(itemsList);
      const lineMap: Record<string, string> = {};
      const availableById = new Map(itemsList.map((i) => [i.id, i.available ?? 0]));
      for (const line of kit.lines ?? []) {
        if (!line.itemId) continue;
        const avail = availableById.get(line.itemId) ?? 0;
        const qty = Math.max(0, line.defaultQty ?? 0);
        lineMap[line.itemId] = String(avail > 0 ? Math.min(qty, avail) : qty);
      }
      setLines(lineMap);
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
  }, [forbidden, id]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const parsedLines: KitLine[] = Object.entries(lines)
        .map(([itemId, qtyStr]) => ({ itemId, defaultQty: Math.trunc(Number(qtyStr) || 0) }))
        .filter((l) => l.defaultQty > 0);

      const res = await fetch(`/api/inventory/packages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: kitName,
          description: kitDescription.trim() ? kitDescription.trim() : null,
          isActive,
          lines: parsedLines,
        }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as ApiError) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось сохранить");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить пакет?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/packages/${id}`, { method: "DELETE" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as ApiError) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось удалить");
      window.location.href = "/inventory/packages";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <AppShell title="Инвентарь · Пакет">
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Инвентарь · Пакет">
      <div className="space-y-4 max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/inventory/packages"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            ← К пакетам
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || loading || !kitName.trim()}
              className="rounded-lg border border-violet-200 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "Сохраняю…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy || loading}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-600">Загрузка…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Основные данные</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                  <input
                    value={kitName}
                    onChange={(e) => setKitName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Описание</label>
                  <textarea
                    value={kitDescription}
                    onChange={(e) => setKitDescription(e.target.value)}
                    className="w-full min-h-[96px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Активен
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Состав</div>
              <p className="mt-1 text-xs text-zinc-500">Добавляйте позиции через поиск ниже. В составе пакета отображаются только выбранные позиции.</p>

              {/* Позиции в пакете */}
              {(() => {
                const inPackage = items.filter((it) => Number(lines[it.id] || 0) > 0);
                if (inPackage.length === 0) return null;
                return (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-zinc-700 mb-2">В составе ({inPackage.length})</div>
                    <div className="space-y-2">
                      {inPackage.map((it) => {
                        const available = it.available ?? 0;
                        const raw = lines[it.id] ?? "";
                        const num = Math.trunc(Number(raw)) || 0;
                        const showError = raw !== "" && num > available;
                        return (
                          <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-zinc-900 truncate">{it.name}</div>
                              <div className="text-xs text-zinc-500">Доступно: {available}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={available}
                                value={lines[it.id] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const n = Math.trunc(Number(v)) || 0;
                                  const capped = available > 0 ? String(Math.min(Math.max(0, n), available)) : v;
                                  setLines((s) => ({ ...s, [it.id]: capped }));
                                }}
                                className={`w-[72px] rounded-lg border px-2 py-1 text-sm tabular-nums ${showError ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white"}`}
                                inputMode="numeric"
                                placeholder="0"
                                title={available > 0 ? `Макс. ${available}` : "Нет в наличии"}
                              />
                              <button
                                type="button"
                                onClick={() => setLines((s) => ({ ...s, [it.id]: "0" }))}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                Убрать
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Поиск и добавление */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-zinc-700 mb-2">Добавить позицию</label>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по названию…"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-2 max-h-[280px] overflow-y-auto rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
                  {(() => {
                    const q = search.trim().toLowerCase();
                    const filtered = q
                      ? items.filter((i) => i.name.toLowerCase().includes(q))
                      : items;
                    if (filtered.length === 0) {
                      return (
                        <div className="px-3 py-4 text-sm text-zinc-500">
                          {q ? "Ничего не найдено" : "Список позиций пуст"}
                        </div>
                      );
                    }
                    return filtered.map((it) => {
                      const inPkg = Number(lines[it.id] || 0) > 0;
                      const available = it.available ?? 0;
                      const raw = lines[it.id] ?? "";
                      const num = Math.trunc(Number(raw)) || 0;
                      const showError = inPkg && raw !== "" && num > available;
                      return (
                        <div
                          key={it.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-zinc-50"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-zinc-900 truncate">{it.name}</div>
                            <div className="text-xs text-zinc-500">Доступно: {available}</div>
                            {!it.isActive ? <div className="text-xs text-zinc-500">Неактивна</div> : null}
                          </div>
                          {inPkg ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={available}
                                value={lines[it.id] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const n = Math.trunc(Number(v)) || 0;
                                  const capped = available > 0 ? String(Math.min(Math.max(0, n), available)) : v;
                                  setLines((s) => ({ ...s, [it.id]: capped }));
                                }}
                                className={`w-[72px] rounded-lg border px-2 py-1 text-sm tabular-nums ${showError ? "border-red-400 bg-red-50" : "border-zinc-200"}`}
                                inputMode="numeric"
                                title={available > 0 ? `Макс. ${available}` : "Нет в наличии"}
                              />
                              <span className="text-xs text-zinc-500">в пакете</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setLines((s) => ({ ...s, [it.id]: "1" }))}
                              disabled={available < 1}
                              title={available < 1 ? "Нет в наличии" : undefined}
                              className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Добавить
                            </button>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

