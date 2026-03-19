"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type ItemType = "ASSET" | "BULK" | "CONSUMABLE";

export default function NewWarehouseItemPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<ItemType>("CONSUMABLE");
  const [total, setTotal] = React.useState<string>("0");
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const qty = Number(total);
      const res = await fetch("/api/inventory/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() ? description.trim() : null,
          type,
          pricePerDay: 0,
          total: Number.isFinite(qty) ? Math.max(0, Math.trunc(qty)) : 0,
          internalOnly: true,
          isActive,
        }),
      });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { id?: string; error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось создать");
      const id = data.id;
      if (!id) throw new Error("Создано, но сервер не вернул id");
      window.location.href = `/inventory/warehouse-items/${id}`;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Инвентарь · Новый складской реквизит">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/inventory/warehouse-items"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              ← К складскому реквизиту
            </Link>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-zinc-900">Складской реквизит</div>
            <div className="mt-1 text-sm text-zinc-600">
              Это внутренний реквизит склада, он не показывается в каталоге. Фото не требуется.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Название</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Например: скотч малярный"
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
                <label className="block text-xs font-medium text-zinc-500 mb-1">Количество (общее)</label>
                <input
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                  inputMode="numeric"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Активен
              </label>
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
                {busy ? "Создаю…" : "Создать"}
              </button>
              <Link
                href="/inventory/warehouse-items"
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

