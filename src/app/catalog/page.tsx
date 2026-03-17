"use client";

import React from "react";

import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  pricePerDay: string;
  photo1Key: string | null;
  photo2Key: string | null;
  total: number;
  inRepair: number;
  broken: number;
  missing: number;
  availability: { availableNow: number };
};

type CartLine = { itemId: string; qty: number };

function isCartLine(x: unknown): x is CartLine {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { itemId?: unknown }).itemId === "string" &&
    typeof (x as { qty?: unknown }).qty === "number"
  );
}

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem("cart");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine);
  } catch {
    return [];
  }
}

function saveCart(lines: CartLine[]) {
  localStorage.setItem("cart", JSON.stringify(lines));
}

export default function CatalogPage() {
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);

  React.useEffect(() => {
    setCart(loadCart());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const url = new URL("/api/catalog/items", window.location.origin);
      if (query.trim()) url.searchParams.set("query", query.trim());
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = (await res.json()) as { items: CatalogItem[] };
      if (!cancelled) {
        setItems(data.items ?? []);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  function addToCart(itemId: string) {
    const next = [...cart];
    const idx = next.findIndex((l) => l.itemId === itemId);
    if (idx >= 0) next[idx] = { itemId, qty: next[idx].qty + 1 };
    else next.push({ itemId, qty: 1 });
    setCart(next);
    saveCart(next);
  }

  return (
    <AppShell title="Каталог">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
            placeholder="Поиск по каталогу…"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-zinc-700">
            Корзина:{" "}
            <span className="font-medium">
              {cart.reduce((sum, l) => sum + l.qty, 0)}
            </span>
          </div>
          <Link
            href="/checkout"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            Оформить
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">Загрузка каталога…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="rounded-2xl border border-zinc-200 p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{it.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Доступно:{" "}
                    <span className="font-medium text-zinc-800">
                      {it.availability.availableNow}
                    </span>
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  {it.pricePerDay}₽/сут
                </div>
              </div>
              {it.description ? (
                <div className="mt-2 line-clamp-3 text-sm text-zinc-600">
                  {it.description}
                </div>
              ) : null}
              <button
                onClick={() => addToCart(it.id)}
                className="mt-3 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                В корзину
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

