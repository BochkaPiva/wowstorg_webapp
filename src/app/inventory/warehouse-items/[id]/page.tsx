"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type ItemType = "ASSET" | "BULK" | "CONSUMABLE";

type Item = {
  id: string;
  name: string;
  description: string | null;
  type: ItemType;
  isActive: boolean;
  internalOnly: boolean;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  updatedAt: string;
};

type ApiError = { error?: { message?: string } };
type ItemGetResponse = { item?: Item; error?: { message?: string } };

function computeAvailableNow(p: Pick<Item, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, p.total - p.inRepair - p.broken - p.missing);
}

export default function WarehouseItemEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  // Next 16: dynamic params are async
  const { id } = React.use(params);

  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [item, setItem] = React.useState<Item | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    description: "",
    type: "CONSUMABLE" as ItemType,
    total: "0",
    inRepair: "0",
    broken: "0",
    missing: "0",
    isActive: true,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as ItemGetResponse) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить");
      if (!data.item) throw new Error("Не найдено");
      const it = data.item;
      if (!it.internalOnly) {
        throw new Error("Это не складской реквизит");
      }
      setItem(it);
      setForm({
        name: it.name,
        description: it.description ?? "",
        type: it.type,
        total: String(it.total),
        inRepair: String(it.inRepair),
        broken: String(it.broken),
        missing: String(it.missing),
        isActive: it.isActive,
      });
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
      const total = Math.trunc(Number(form.total) || 0);
      const inRepair = Math.trunc(Number(form.inRepair) || 0);
      const broken = Math.trunc(Number(form.broken) || 0);
      const missing = Math.trunc(Number(form.missing) || 0);

      const res = await fetch(`/api/inventory/positions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description.trim() ? form.description.trim() : null,
          type: form.type,
          pricePerDay: 0,
          total,
          inRepair,
          broken,
          missing,
          internalOnly: true,
          isActive: form.isActive,
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
    if (!confirm("Удалить складской реквизит?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, { method: "DELETE" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as ApiError) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось удалить");
      window.location.href = "/inventory/warehouse-items";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <AppShell title="Инвентарь · Складской реквизит">
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Инвентарь · Складской реквизит">
      <div className="space-y-4 max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/inventory/warehouse-items"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            ← Назад
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || loading || !form.name.trim()}
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
        ) : item ? (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-zinc-900">{item.name}</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Доступно сейчас:{" "}
                    <span className="inline-flex items-baseline gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-bold text-violet-800 tabular-nums">
                      {computeAvailableNow(item)}
                    </span>{" "}
                    из {item.total}
                  </div>
                </div>
                <div className="text-xs text-zinc-400">Обновлено: {new Date(item.updatedAt).toLocaleString("ru-RU")}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Поля</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Описание</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    className="w-full min-h-[96px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Тип</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as ItemType }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="ASSET">Штучный</option>
                    <option value="BULK">Мерный</option>
                    <option value="CONSUMABLE">Расходник</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Общее количество</label>
                  <input
                    value={form.total}
                    onChange={(e) => setForm((s) => ({ ...s, total: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                    inputMode="numeric"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 md:col-span-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Ремонт</label>
                    <input
                      value={form.inRepair}
                      onChange={(e) => setForm((s) => ({ ...s, inRepair: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Сломано</label>
                    <input
                      value={form.broken}
                      onChange={(e) => setForm((s) => ({ ...s, broken: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Утеряно</label>
                    <input
                      value={form.missing}
                      onChange={(e) => setForm((s) => ({ ...s, missing: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
                  />
                  Активен
                </label>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-600">Не найдено.</div>
        )}
      </div>
    </AppShell>
  );
}

