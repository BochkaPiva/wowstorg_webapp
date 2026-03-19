"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Item = { id: string; name: string; isActive: boolean };
type ApiError = { error?: { message?: string } };
type CollectionGetResponse = {
  collection?: {
    name?: string | null;
    slug?: string | null;
    order?: number;
    items?: Array<{ itemId: string }>;
  };
  items?: Item[];
  error?: { message?: string };
};

export default function CollectionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { state } = useAuth();
  const user = state.status === "authenticated" ? state.user : null;
  const forbidden = state.status === "authenticated" && user?.role !== "WOWSTORG";

  const { id } = React.use(params);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [collectionName, setCollectionName] = React.useState("");
  const [collectionSlug, setCollectionSlug] = React.useState("");
  const [collectionOrder, setCollectionOrder] = React.useState(0);
  const [items, setItems] = React.useState<Item[]>([]);
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/collections/${id}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as CollectionGetResponse) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить категорию");
      if (!data.collection) throw new Error("Категория не найдена");
      const c = data.collection;
      setCollectionName(c.name ?? "");
      setCollectionSlug(c.slug ?? "");
      setCollectionOrder(typeof c.order === "number" ? c.order : 0);
      setItems(data.items ?? []);
      const ids = (c.items ?? []).map((x) => x.itemId);
      setSelectedItemIds(ids);
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
      const res = await fetch(`/api/inventory/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: collectionName,
          slug: collectionSlug.trim(),
          order: collectionOrder,
          itemIds: selectedItemIds,
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
    if (!confirm("Удалить категорию?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/collections/${id}`, { method: "DELETE" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as ApiError) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось удалить");
      window.location.href = "/inventory/collections";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <AppShell title="Инвентарь · Категория">
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Инвентарь · Категория">
      <div className="space-y-4 max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/inventory/collections"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            ← К категориям
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || loading || !collectionName.trim()}
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
              <div className="text-base font-semibold text-zinc-900">Данные категории</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                  <input
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Slug (для URL)</label>
                  <input
                    value={collectionSlug}
                    onChange={(e) => setCollectionSlug(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Порядок (число)</label>
                  <input
                    type="number"
                    min={0}
                    value={collectionOrder}
                    onChange={(e) => setCollectionOrder(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Позиции в категории</div>
              <div className="mt-3">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по реквизиту…"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-3 max-h-[280px] overflow-y-auto rounded-xl border border-zinc-200 p-2 space-y-1">
                  {items
                    .filter((it) => {
                      const q = search.trim().toLowerCase();
                      if (!q) return true;
                      return it.name.toLowerCase().includes(q);
                    })
                    .map((it) => (
                  <label key={it.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItemIds.includes(it.id)}
                      onChange={(e) => {
                        setSelectedItemIds((prev) =>
                          e.target.checked ? [...prev, it.id] : prev.filter((id) => id !== it.id)
                        );
                      }}
                      className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                    />
                    <span className="text-sm text-zinc-800">{it.name}</span>
                    {!it.isActive ? <span className="text-xs text-zinc-500">(неактивна)</span> : null}
                  </label>
                ))}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Показано:{" "}
                  {
                    items.filter((it) => {
                      const q = search.trim().toLowerCase();
                      if (!q) return true;
                      return it.name.toLowerCase().includes(q);
                    }).length
                  }{" "}
                  из {items.length}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

