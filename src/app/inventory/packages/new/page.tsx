"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Item = { id: string; name: string; isActive: boolean };
type CatalogItemsResponse = {
  items?: Array<{ id: string; name: string; isActive: boolean }>;
};
type ApiError = { error?: { message?: string } };

export default function NewPackagePage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<Item[]>([]);
  const [selected, setSelected] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (forbidden) return;
    void (async () => {
      const res = await fetch("/api/catalog/items?includeInactive=true", { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as (CatalogItemsResponse & ApiError)) : {};
      if (res.ok && data.items) {
        setItems(
          data.items.map((it) => ({
            id: it.id,
            name: it.name,
            isActive: Boolean(it.isActive),
          })),
        );
      }
    })();
  }, [forbidden]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const lines = Object.entries(selected)
        .map(([itemId, qtyStr]) => ({ itemId, defaultQty: Math.trunc(Number(qtyStr) || 0) }))
        .filter((l) => l.defaultQty > 0);

      const res = await fetch("/api/inventory/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() ? description.trim() : null,
          isActive,
          // на бэке lines задаются при PATCH, но чтобы не усложнять, создадим без состава
          lines: undefined,
        }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as ({ id?: string } & ApiError)) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось создать пакет");
      const id = data.id;
      if (!id) throw new Error("Пакет создан, но сервер не вернул id");

      if (lines.length) {
        const patchRes = await fetch(`/api/inventory/packages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description: description.trim() ? description.trim() : null,
            isActive,
            lines,
          }),
        });
        if (!patchRes.ok) {
          const ptxt = await patchRes.text();
          const pdata = ptxt ? (JSON.parse(ptxt) as ApiError) : {};
          throw new Error(pdata?.error?.message ?? "Не удалось сохранить состав пакета");
        }
      }

      window.location.href = `/inventory/packages/${id}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Инвентарь · Новый пакет">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/inventory/packages"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              ← К пакетам
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-zinc-900">Основные данные</div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Описание</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
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
            <div className="text-base font-semibold text-zinc-900">Состав пакета</div>
            <div className="mt-3">
              <div className="text-sm text-zinc-600">
                Задайте количество для каждой позиции. Позиция будет добавляться в корзину как отдельные строки.
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900 truncate">{it.name}</div>
                      {!it.isActive ? <div className="text-xs text-zinc-500">Неактивна</div> : null}
                    </div>
                    <input
                      value={selected[it.id] ?? ""}
                      onChange={(e) => setSelected((s) => ({ ...s, [it.id]: e.target.value }))}
                      className="w-[90px] rounded-lg border border-zinc-200 px-2 py-1 text-sm tabular-nums"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div> : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={create}
              className="rounded-lg border border-violet-200 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "Создаю…" : "Создать пакет"}
            </button>
            <Link
              href="/inventory/packages"
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Отмена
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

