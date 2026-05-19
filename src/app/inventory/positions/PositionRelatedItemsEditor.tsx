"use client";

import React from "react";

import { MAX_ITEM_RELATIONS_PER_SOURCE } from "@/lib/item-related-constants";

type RelationKind = "REQUIRED" | "RECOMMENDED";

type RelationRow = {
  relatedItemId: string;
  relatedName: string;
  isActive: boolean;
  internalOnly: boolean;
  kind: RelationKind;
  sortOrder: number;
  defaultSuggestedQty: number;
  note: string;
};

type SearchItem = { id: string; name: string; isActive: boolean; internalOnly: boolean };

type DraftRow = {
  key: string;
  relatedItemId: string;
  relatedName: string;
  isActive: boolean;
  internalOnly: boolean;
  kind: RelationKind;
  sortOrder: number;
  defaultSuggestedQty: number;
  note: string;
};

function newKey() {
  return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PositionRelatedItemsEditor({ positionId }: { positionId: string }) {
  const [rows, setRows] = React.useState<DraftRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [query, setQuery] = React.useState("");
  const [searchItems, setSearchItems] = React.useState<SearchItem[]>([]);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${positionId}/related`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as {
        relations?: Array<{
          relatedItemId: string;
          kind: RelationKind;
          sortOrder: number;
          defaultSuggestedQty: number;
          note: string | null;
          relatedItem: { name: string; isActive: boolean; internalOnly: boolean };
        }>;
        error?: { message?: string };
      } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить связи");
      setRows(
        (data?.relations ?? []).map((r) => ({
          key: newKey(),
          relatedItemId: r.relatedItemId,
          relatedName: r.relatedItem.name,
          isActive: r.relatedItem.isActive,
          internalOnly: r.relatedItem.internalOnly,
          kind: r.kind,
          sortOrder: r.sortOrder,
          defaultSuggestedQty: r.defaultSuggestedQty,
          note: r.note ?? "",
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [positionId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchItems([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("query", q);
        params.set("all", "true");
        params.set("internalOnly", "true");
        const res = await fetch(`/api/catalog/items?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as {
          items?: Array<{ id: string; name: string; internalOnly?: boolean }>;
        } | null;
        if (!cancelled) {
          setSearchItems(
            (data?.items ?? [])
              .filter((i) => i.id !== positionId)
              .map((i) => ({
                id: i.id,
                name: i.name,
                isActive: true,
                internalOnly: Boolean(i.internalOnly),
              })),
          );
        }
      } catch {
        if (!cancelled) setSearchItems([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, positionId]);

  function addRelation(item: SearchItem) {
    if (rows.some((r) => r.relatedItemId === item.id)) {
      setError("Эта позиция уже в списке связей");
      return;
    }
    if (rows.length >= MAX_ITEM_RELATIONS_PER_SOURCE) {
      setError(`Не более ${MAX_ITEM_RELATIONS_PER_SOURCE} связей`);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        relatedItemId: item.id,
        relatedName: item.name,
        isActive: item.isActive,
        internalOnly: item.internalOnly,
        kind: "RECOMMENDED",
        sortOrder: prev.length,
        defaultSuggestedQty: 1,
        note: "",
      },
    ]);
    setQuery("");
    setSearchOpen(false);
    setSaved(false);
  }

  function moveRow(index: number, dir: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next.map((r, i) => ({ ...r, sortOrder: i }));
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/inventory/positions/${positionId}/related`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relations: rows.map((r, index) => ({
            relatedItemId: r.relatedItemId,
            kind: r.kind,
            sortOrder: index,
            defaultSuggestedQty: Math.max(1, Math.trunc(r.defaultSuggestedQty) || 1),
            note: r.note.trim() ? r.note.trim() : null,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось сохранить");
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-zinc-900">Связанные позиции</div>
          <p className="mt-1 text-sm text-zinc-600">
            Рекомендации в корзине: «если взяли эту позицию — предложить связанные». Направление только
            от этой позиции к другим.
          </p>
        </div>
        <div className="text-xs text-zinc-500 tabular-nums">
          {rows.length} / {MAX_ITEM_RELATIONS_PER_SOURCE}
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Связи сохранены
        </div>
      ) : null}

      <div className="mt-4 relative">
        <label className="block text-xs font-medium text-zinc-500 mb-1">Добавить связь</label>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Поиск позиции по названию…"
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
        />
        {searchOpen && searchItems.length > 0 ? (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
            {searchItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => addRelation(item)}
              >
                {item.name}
                {item.internalOnly ? <span className="ml-2 text-xs text-zinc-500">внутр.</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Загрузка связей…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Связей пока нет.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row, index) => (
            <li key={row.key} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-zinc-900">{row.relatedName}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {!row.isActive ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">неактивна</span>
                    ) : null}
                    {row.internalOnly ? (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
                        только склад (Greenwich не увидит)
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                    onClick={() => moveRow(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                    onClick={() => moveRow(index, 1)}
                    disabled={index === rows.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-800"
                    onClick={() => {
                      setRows((prev) => prev.filter((r) => r.key !== row.key));
                      setSaved(false);
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="block text-xs text-zinc-500">
                  Тип
                  <select
                    value={row.kind}
                    onChange={(e) => {
                      const kind = e.target.value as RelationKind;
                      setRows((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, kind } : r)),
                      );
                      setSaved(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  >
                    <option value="REQUIRED">Обычно нужно</option>
                    <option value="RECOMMENDED">Может пригодиться</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-500">
                  Кол-во в рекомендации
                  <input
                    type="number"
                    min={1}
                    value={row.defaultSuggestedQty}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, defaultSuggestedQty: Number.isFinite(n) && n > 0 ? n : 1 }
                            : r,
                        ),
                      );
                      setSaved(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs text-zinc-500 md:col-span-1">
                  Подпись (необяз.)
                  <input
                    value={row.note}
                    onChange={(e) => {
                      const note = e.target.value;
                      setRows((prev) =>
                        prev.map((r) => (r.key === row.key ? { ...r, note } : r)),
                      );
                      setSaved(false);
                    }}
                    placeholder="для утяжеления"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить связи"}
        </button>
      </div>
    </div>
  );
}
