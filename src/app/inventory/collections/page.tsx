"use client";

import Link from "next/link";
import React from "react";
import { useJsonResource } from "@/lib/use-json-resource";

import { AppShell } from "@/app/_ui/AppShell";
import { SectionHeader } from "@/app/_ui/SectionHeader";
import { useAuth } from "@/app/providers";
import "../inventory.css";

type Collection = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemsCount: number;
  updatedAt: string;
};

export default function InventoryCollectionsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const { data, loading, error, refresh: load } = useJsonResource<{ collections?: Collection[] }>(
    state.status === "authenticated" && !forbidden ? "/api/inventory/collections" : null,
    "Не удалось загрузить категории",
  );
  const items = data?.collections ?? [];

  return (
    <AppShell title="Инвентарь · Категории">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="inventory-workspace space-y-4">
<SectionHeader title="Категории" description="Группировка реквизита для удобного поиска в каталоге." mascot="inventory" actions={<div className="flex flex-wrap gap-2">
          <Link href="/inventory/collections/new" className="inv-button inv-primary">+ Новая категория</Link>

          <button type="button" onClick={() => void load()} disabled={loading} className="inv-button">Обновить</button></div>} />

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">Категорий пока нет.</div>
          ) : (
            <div className="space-y-2">
              {items.map((c) => (
                <Link
                  key={c.id}
                  href={`/inventory/collections/${c.id}`}
                  className={[
                    "block rounded-xl border bg-white p-4 hover:border-violet-300",
                    !c.isActive ? "border-zinc-200/60 opacity-80" : "border-zinc-200 hover:border-violet-200",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-zinc-900 truncate">{c.name}</div>
                        {!c.isActive ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
                            неактивна
                          </span>
                        ) : null}
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                          позиций: {c.itemsCount}
                        </span>
                      </div>
                      {c.description?.trim() ? (
                        <div className="mt-1 text-sm text-zinc-600 line-clamp-2">{c.description}</div>
                      ) : (
                        <div className="mt-1 text-sm text-zinc-500">Без описания</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">Обновлено: {new Date(c.updatedAt).toLocaleDateString("ru-RU")}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

