"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type ItemType = "ASSET" | "BULK" | "CONSUMABLE";

export default function NewPositionPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<ItemType>("ASSET");
  const [pricePerDay, setPricePerDay] = React.useState<string>("");
  const [purchasePricePerUnit, setPurchasePricePerUnit] = React.useState<string>("");
  const [total, setTotal] = React.useState<string>("0");
  // Это создание позиции каталога: внутренний реквизит создаётся в отдельном разделе
  const internalOnly = false;
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const photoPreviewUrl = React.useMemo(() => {
    if (!photo) return null;
    return URL.createObjectURL(photo);
  }, [photo]);

  React.useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const price = Number(pricePerDay);
      const purchasePrice = Number(purchasePricePerUnit);
      const qty = Number(total);
      const res = await fetch("/api/inventory/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() ? description.trim() : null,
          type,
          pricePerDay: Number.isFinite(price) ? price : 0,
          purchasePricePerUnit:
            purchasePricePerUnit.trim() === ""
              ? null
              : (Number.isFinite(purchasePrice) ? purchasePrice : 0),
          total: Number.isFinite(qty) ? Math.max(0, Math.trunc(qty)) : 0,
          internalOnly,
          isActive,
        }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { id?: string; error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось создать позицию");
      const id = data.id;
      if (!id) throw new Error("Позиция создана, но сервер не вернул id");

      if (photo) {
        const fd = new FormData();
        fd.set("file", photo);
        const photoRes = await fetch(`/api/inventory/positions/${id}/photo`, { method: "POST", body: fd });
        if (!photoRes.ok) {
          const ptxt = await photoRes.text();
          const pdata = ptxt ? (JSON.parse(ptxt) as { error?: { message?: string } }) : {};
          throw new Error(pdata?.error?.message ?? "Позиция создана, но фото загрузить не удалось");
        }
      }

      window.location.href = `/inventory/positions/${id}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Инвентарь · Новая позиция">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/inventory/positions"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              ← К позициям
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-zinc-900">Основные данные</div>
            <div className="mt-1 text-sm text-zinc-600">
              Фото можно добавить сейчас или позже — после создания на странице позиции появится кнопка загрузки.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Фото (опционально)</label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <div className="rounded-2xl border border-dashed border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-white text-2xl shadow-sm">
                        {photoPreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span aria-hidden="true">📷</span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">
                          {photo ? photo.name : "Фото позиции"}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {photo
                            ? `${(photo.size / 1024 / 1024).toFixed(2)} MB · будет загружено после создания`
                            : "JPG/PNG/WebP/GIF, до 5MB."}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => photoInputRef.current?.click()}
                        className="rounded-xl border border-violet-200 bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                      >
                        {photo ? "Заменить фото" : "Добавить фото"}
                      </button>
                      {photo ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setPhoto(null);
                            if (photoInputRef.current) photoInputRef.current.value = "";
                          }}
                          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Убрать
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Например: Игра «Гигантские крестики-нолики»"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Описание</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full min-h-[96px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Коротко и по делу: комплектность, ограничения, как использовать…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Тип</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ItemType)}
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
                  value={pricePerDay}
                  onChange={(e) => setPricePerDay(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  Цена закупа за единицу (₽, опционально)
                </label>
                <input
                  value={purchasePricePerUnit}
                  onChange={(e) => setPurchasePricePerUnit(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                  inputMode="decimal"
                  placeholder="Оставьте пустым, если не знаете цену"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Количество (общее)</label>
                <input
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                  inputMode="numeric"
                />
              </div>
              <div className="flex items-end gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked readOnly />
                  Позиция каталога (видна в каталоге)
                </label>
              </div>
              <div className="flex items-end gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Активна
                </label>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={create}
                className="rounded-lg border border-violet-200 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {busy ? "Создаю…" : "Создать позицию"}
              </button>
              <Link
                href="/inventory/positions"
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Отмена
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

