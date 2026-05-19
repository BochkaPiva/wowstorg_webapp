"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ToggleSwitch } from "@/app/_ui/ToggleSwitch";
import { useAuth } from "@/app/providers";

import "./position-edit.css";

type Position = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  isActive: boolean;
  internalOnly: boolean;
  pricePerDay: string;
  purchasePricePerUnit: string | null;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  photo1Key: string | null;
  categories: { categoryId: string; category: { name: string } }[];
  collections: { collectionId: string; collection: { name: string }; position: number }[];
  updatedAt: string;
};

function computeAvailableNow(p: Pick<Position, "total" | "inRepair" | "broken" | "missing">) {
  return Math.max(0, p.total - p.inRepair - p.broken - p.missing);
}

export default function InventoryPositionsPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [query, setQuery] = React.useState("");
  const [includeInactive, setIncludeInactive] = React.useState(false);
  // Позиции каталога: по умолчанию показываем только то, что видно в каталоге
  const [internalOnly, setInternalOnly] = React.useState<"all" | "internal" | "public">("public");
  const [items, setItems] = React.useState<Position[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set("query", query.trim());
      if (includeInactive) sp.set("includeInactive", "true");
      if (internalOnly !== "all") sp.set("internalOnly", internalOnly === "internal" ? "true" : "false");
      const res = await fetch(`/api/inventory/positions?${sp.toString()}`, { cache: "no-store" });
      const txt = await res.text();
      const data = txt ? (JSON.parse(txt) as { items?: Position[]; error?: { message?: string } }) : {};
      if (!res.ok) throw new Error(data?.error?.message ?? "Не удалось загрузить позиции");
      setItems(data.items ?? []);
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
  }, [forbidden, includeInactive, internalOnly]);

  return (
    <AppShell title="Инвентарь · Позиции">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/inventory/items"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                ← В инвентарь
              </Link>
              <Link
                href="/inventory/positions/new"
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
              >
                + Новая позиция
              </Link>
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Обновить
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label className="pos-edit-label" htmlFor="pos-list-search">
                  Поиск
                </label>
                <input
                  id="pos-list-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void load();
                  }}
                  className="pos-edit-input"
                  style={{ marginTop: "0.35rem" }}
                  placeholder="Например: фотозона, стол, стойка…"
                />
              </div>

              <div>
                <span className="pos-edit-label">Видимость</span>
                <div className="pos-edit-segment" style={{ marginTop: "0.35rem" }} role="group" aria-label="Видимость">
                  {(
                    [
                      { value: "public", label: "Каталог" },
                      { value: "internal", label: "Внутренние" },
                      { value: "all", label: "Все" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={[
                        "pos-edit-segment-btn",
                        internalOnly === opt.value ? "pos-edit-segment-btn--active" : "",
                      ].join(" ")}
                      onClick={() => setInternalOnly(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void load()}
                className="pos-edit-btn pos-edit-btn--primary"
              >
                Найти
              </button>
            </div>

            <div
              className="pos-edit-toggle-row"
              style={{
                marginTop: "1rem",
                background: includeInactive
                  ? "linear-gradient(135deg, rgba(124, 58, 237, 0.06), rgba(255, 255, 255, 0.95))"
                  : undefined,
              }}
            >
              <ToggleSwitch
                checked={includeInactive}
                onChange={setIncludeInactive}
                label="Показывать неактивные"
                description="Включите, чтобы видеть позиции, снятые с каталога и недоступные для новых заявок."
              />
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">Позиции не найдены.</div>
          ) : (
            <div className="space-y-2">
              {items.map((p) => {
                const avail = computeAvailableNow(p);
                return (
                  <Link
                    key={p.id}
                    href={`/inventory/positions/${p.id}`}
                    className={[
                      "block rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                      !p.isActive ? "border-zinc-200/60 opacity-80" : "border-zinc-200 hover:border-violet-200",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50"
                          aria-hidden="true"
                        >
                          {p.photo1Key ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/inventory/positions/${p.id}/photo?w=160`}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-50 to-amber-50 text-[0.65rem] font-bold tracking-wider text-violet-700">
                              WOW
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-zinc-900 truncate">{p.name}</div>
                          {!p.isActive ? (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
                              неактивна
                            </span>
                          ) : null}
                          {p.internalOnly ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                              внутренняя
                            </span>
                          ) : null}
                        </div>
                        {p.description?.trim() ? (
                          <div className="mt-1 text-sm text-zinc-600 line-clamp-2">{p.description}</div>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                          <span className="rounded-md bg-zinc-50 border border-zinc-200 px-2 py-1">
                            Доступно сейчас: <strong className="text-zinc-900">{avail}</strong> / {p.total}
                          </span>
                          {(p.inRepair + p.broken + p.missing) > 0 ? (
                            <span className="rounded-md bg-zinc-50 border border-zinc-200 px-2 py-1">
                              Ремонт: <strong className="text-zinc-900">{p.inRepair}</strong> · Сломано:{" "}
                              <strong className="text-zinc-900">{p.broken}</strong> · Утеряно:{" "}
                              <strong className="text-zinc-900">{p.missing}</strong>
                            </span>
                          ) : null}
                        </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-sm text-zinc-600">Цена / сутки</div>
                        <div className="mt-0.5 inline-flex items-baseline gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-bold text-violet-800 tabular-nums">
                          {Number(p.pricePerDay).toLocaleString("ru-RU")} ₽
                        </div>
                        {p.purchasePricePerUnit != null ? (
                          <div className="mt-2">
                            <div className="text-xs text-zinc-500">Цена закупа / шт</div>
                            <div className="mt-0.5 inline-flex items-baseline gap-1 rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 tabular-nums">
                              {Number(p.purchasePricePerUnit).toLocaleString("ru-RU")} ₽
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs text-zinc-400">Обновлено: {new Date(p.updatedAt).toLocaleDateString("ru-RU")}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

