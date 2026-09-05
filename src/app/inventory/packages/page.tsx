"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import "../inventory.css";

type Package = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  linesCount: number;
  updatedAt: string;
};

export default function InventoryPackagesPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [items, setItems] = React.useState<Package[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/packages", { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { packages?: Package[]; error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить пакеты");
      setItems(data.packages ?? []);
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

  return (
    <AppShell title="Инвентарь · Пакеты">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="inventory-workspace space-y-4">
          <header className="inventory-heading"><div><Link href="/inventory/items" className="inventory-back">← Инвентарь</Link><h1>Пакеты</h1><p>Готовые комплекты и их состав.</p></div><div className="flex flex-wrap gap-2">
          <Link href="/inventory/packages/new" className="inv-button inv-primary">+ Новый пакет</Link>

          <button type="button" onClick={() => void load()} disabled={loading} className="inv-button">Обновить</button></div></header>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">Пакетов пока нет.</div>
          ) : (
            <div className="space-y-2">
              {items.map((p) => (
                <Link
                  key={p.id}
                  href={`/inventory/packages/${p.id}`}
                  className={[
                    "block rounded-xl border bg-white p-4 hover:border-violet-300",
                    !p.isActive ? "border-zinc-200/60 opacity-80" : "border-zinc-200 hover:border-violet-200",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-zinc-900 truncate">{p.name}</div>
                        {!p.isActive ? (
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
                            неактивен
                          </span>
                        ) : null}
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                          позиций: {p.linesCount}
                        </span>
                      </div>
                      {p.description?.trim() ? (
                        <div className="mt-1 text-sm text-zinc-600 line-clamp-2">{p.description}</div>
                      ) : (
                        <div className="mt-1 text-sm text-zinc-500">Без описания</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">Обновлено: {new Date(p.updatedAt).toLocaleDateString("ru-RU")}</div>
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

