"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type ItemType = "ASSET" | "BULK" | "CONSUMABLE";
type Category = { id: string; name: string; slug: string };

type Item = {
  id: string;
  name: string;
  description: string | null;
  type: ItemType;
  isActive: boolean;
  internalOnly: boolean;
  pricePerDay: string;
  purchasePricePerUnit: string | null;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  photo1Key: string | null;
  categories: { categoryId: string }[];
  collections: { collectionId: string; position: number }[];
  updatedAt: string;
};

function computeAvailableNow(p: Pick<Item, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, p.total - p.inRepair - p.broken - p.missing);
}

export default function PositionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  // Next 16: dynamic params are async
  const { id } = React.use(params);
  const [item, setItem] = React.useState<Item | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    name: "",
    description: "",
    type: "ASSET" as ItemType,
    pricePerDay: "",
    purchasePricePerUnit: "",
    total: "0",
    inRepair: "0",
    broken: "0",
    missing: "0",
    internalOnly: false,
    isActive: true,
    categoryIds: [] as string[],
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt
        ? (JSON.parse(txt) as { item?: Item; categories?: Category[]; error?: { message?: string } })
        : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить позицию");
      if (!data.item) throw new Error("Позиция не найдена");
      const it = data.item;
      setItem(it);
      setCategories(data.categories ?? []);
      setForm({
        name: it.name,
        description: it.description ?? "",
        type: it.type,
        pricePerDay: String(it.pricePerDay ?? ""),
        purchasePricePerUnit: it.purchasePricePerUnit != null ? String(it.purchasePricePerUnit) : "",
        total: String(it.total),
        inRepair: String(it.inRepair),
        broken: String(it.broken),
        missing: String(it.missing),
        internalOnly: it.internalOnly,
        isActive: it.isActive,
        categoryIds: it.categories.map((c) => c.categoryId),
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
      const price = Number(form.pricePerDay);
      const purchasePrice = Number(form.purchasePricePerUnit);
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
          pricePerDay: Number.isFinite(price) ? price : 0,
          purchasePricePerUnit:
            form.purchasePricePerUnit.trim() === ""
              ? null
              : (Number.isFinite(purchasePrice) ? purchasePrice : 0),
          total,
          inRepair,
          broken,
          missing,
          internalOnly: form.internalOnly,
          isActive: form.isActive,
          categoryIds: form.categoryIds,
          collectionIds: [],
        }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось сохранить");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/inventory/positions/${id}/photo`, { method: "POST", body: fd });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить фото");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto() {
    if (!confirm("Удалить фото?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}/photo`, { method: "DELETE" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось удалить фото");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить позицию? Это действие необратимо.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const txt = await res.text();
        const data = txt ? (JSON.parse(txt) as { error?: { message?: string } }) : {};
        throw new Error(data?.error?.message ?? "Не удалось удалить");
      }
      window.location.href = "/inventory/positions";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <AppShell title="Инвентарь · Позиция">
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Инвентарь · Позиция">
      <div className="space-y-4 max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/inventory/positions"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              ← К позициям
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              <div className="text-base font-semibold text-zinc-900">Фото</div>
              <div className="mt-1 text-sm text-zinc-600">
                Можно добавить сейчас или позже. Фото используется для удобства в инвентаре (в каталоге подключим следующим шагом).
              </div>

              <div className="mt-4 flex flex-wrap items-start gap-4">
                <div className="w-[220px] h-[140px] rounded-xl border border-zinc-200 bg-zinc-50 overflow-hidden flex items-center justify-center">
                  {item.photo1Key ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/inventory/positions/${id}/photo`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-xs text-zinc-500">Фото не загружено</div>
                  )}
                </div>

                <div className="min-w-[240px] space-y-2">
                  <label className="block text-xs font-medium text-zinc-500">Загрузить</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPhoto(f);
                      e.currentTarget.value = "";
                    }}
                    className="block w-full text-sm"
                  />
                  {item.photo1Key ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={deletePhoto}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      Удалить фото
                    </button>
                  ) : null}
                  <div className="text-xs text-zinc-500">Поддержка: JPG/PNG/WebP/GIF, до 5MB.</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Реквизит</div>
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
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Цена / сутки (₽)</label>
                  <input
                    value={form.pricePerDay}
                    onChange={(e) => setForm((s) => ({ ...s, pricePerDay: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">
                    Цена закупа за единицу (₽, опционально)
                  </label>
                  <input
                    value={form.purchasePricePerUnit}
                    onChange={(e) => setForm((s) => ({ ...s, purchasePricePerUnit: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                    inputMode="decimal"
                    placeholder="Оставьте пустым, если не знаете цену"
                  />
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
                <div className="grid grid-cols-3 gap-2">
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

                <div className="flex items-end gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={form.internalOnly}
                      onChange={(e) => setForm((s) => ({ ...s, internalOnly: e.target.checked }))}
                    />
                    Внутренний реквизит (не показывать в каталоге)
                  </label>
                </div>
                <div className="flex items-end gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
                    />
                    Активна
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-zinc-900">Категории</div>
              <p className="mt-1 text-xs text-zinc-500">Выберите категории для отображения в каталоге.</p>
              <div className="mt-3 max-h-[200px] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 space-y-1">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.categoryIds.includes(c.id)}
                      onChange={(e) => {
                        setForm((s) => ({
                          ...s,
                          categoryIds: e.target.checked
                            ? [...s.categoryIds, c.id]
                            : s.categoryIds.filter((id) => id !== c.id),
                        }));
                      }}
                      className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm text-zinc-800">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-zinc-600">Позиция не найдена.</div>
        )}
      </div>
    </AppShell>
  );
}

