"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { loadCart, saveCart, type CartLine } from "@/lib/cart";
import {
  catalogDatesFromStorage,
  formatDateRu,
  getDefaultCatalogDates,
  normalizeCatalogDates,
  todayDateOnly,
} from "@/lib/catalogDates";
import "./catalog.css";
import { CatalogDateField } from "@/app/catalog/CatalogDateField";
import { CatalogItemCard } from "@/app/catalog/CatalogItemCard";
import { ItemModal } from "@/app/catalog/ItemModal";

type CatalogTab = "positions" | "categories" | "kits";

type Category = { id: string; name: string; slug: string };

type KitLine = { defaultQty: number; item: { id: string; name: string } };
type Kit = { id: string; name: string; description: string | null; lines: KitLine[] };

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
  availability: { availableNow: number; availableForDates?: number };
};

function daysBetweenDateOnly(start: string, end: string) {
  // Treat end as exclusive like backend ([start, end))
  const a = new Date(start + "T12:00:00");
  const b = new Date(end + "T12:00:00");
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 0;
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  // UX: если пользователь выбрал один и тот же день, считаем 1 день аренды
  return days === 0 ? 1 : days;
}

export default function CatalogPage() {
  const { state } = useAuth();
  const isGreenwich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const [quickParentId, setQuickParentId] = React.useState<string | null>(null);

  const isQuickSupplement = Boolean(quickParentId);
  const cartScope = quickParentId ? `quick:${quickParentId}` : undefined;

  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [kits, setKits] = React.useState<Kit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<CatalogTab>("positions");
  // Одинаковые дефолты на SSR и первом кадре клиента — иначе гидратация и «ломаные» min/max у type=date
  const [startDate, setStartDate] = React.useState(() => getDefaultCatalogDates().startDate);
  const [endDate, setEndDate] = React.useState(() => getDefaultCatalogDates().endDate);
  const [readyByDate, setReadyByDate] = React.useState(() => getDefaultCatalogDates().readyByDate);
  const [showFloatingCart, setShowFloatingCart] = React.useState(false);

  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const cartScopeRef = React.useRef(cartScope);
  cartScopeRef.current = cartScope;

  const datesRef = React.useRef({ readyByDate, startDate, endDate });
  datesRef.current = { readyByDate, startDate, endDate };

  const patchCatalogDates = React.useCallback(
    (patch: Partial<{ readyByDate: string; startDate: string; endDate: string }>) => {
      try {
        const n = normalizeCatalogDates({ ...datesRef.current, ...patch });
        setReadyByDate(n.readyByDate);
        setStartDate(n.startDate);
        setEndDate(n.endDate);
      } catch (e) {
        console.error("[catalog] patchCatalogDates", e);
      }
    },
    [],
  );

  const dateMin = todayDateOnly();
  /** Конец периода не раньше начала; один и тот же день — допустим. */
  const endMin = startDate;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setQuickParentId(params.get("quickParentId"));
  }, []);

  /** После монтирования подставляем даты из localStorage (не в useState — иначе mismatch гидратации). */
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("quickParentId")) return;
    const n = catalogDatesFromStorage();
    setStartDate(n.startDate);
    setEndDate(n.endDate);
    setReadyByDate(n.readyByDate);
  }, []);

  React.useEffect(() => {
    if (!quickParentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${quickParentId}/quick-supplement/parent`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as
          | { startDate?: string; endDate?: string; readyByDate?: string }
          | null;
        if (!res.ok || !data) return;
        if (cancelled) return;
        if (data.startDate) setStartDate(data.startDate);
        if (data.endDate) setEndDate(data.endDate);
        if (data.readyByDate) setReadyByDate(data.readyByDate);
      } catch {
        // ignore: page can still work with existing dates
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quickParentId]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      if (!isQuickSupplement) {
        localStorage.setItem("catalog_readyByDate", readyByDate);
      }
    }
  }, [readyByDate, isQuickSupplement]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      if (!isQuickSupplement) {
        localStorage.setItem("catalog_startDate", startDate);
        localStorage.setItem("catalog_endDate", endDate);
      }
    }
  }, [startDate, endDate, isQuickSupplement]);

  React.useEffect(() => {
    setCart(loadCart(cartScope));
  }, [cartScope]);

  const floatingCartScrollRef = React.useRef(false);
  React.useEffect(() => {
    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const next = y > 280;
        if (next !== floatingCartScrollRef.current) {
          floatingCartScrollRef.current = next;
          setShowFloatingCart(next);
        }
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const fetchCategoryId =
    activeTab === "positions" ? null : activeTab === "categories" ? categoryId : null;

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const [catRes, kitRes] = await Promise.all([
          fetch("/api/catalog/categories", { cache: "no-store" }),
          fetch("/api/catalog/kits", { cache: "no-store" }),
        ]);
        const catData = (await catRes.json().catch(() => null)) as { categories?: Category[] } | null;
        const kitData = (await kitRes.json().catch(() => null)) as { kits?: Kit[] } | null;

        const url = new URL("/api/catalog/items", window.location.origin);
        if (query.trim()) url.searchParams.set("query", query.trim());
        if (fetchCategoryId) url.searchParams.set("category", fetchCategoryId);
        url.searchParams.set("startDate", startDate);
        url.searchParams.set("endDate", endDate);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { items?: CatalogItem[] } | null;
        if (!cancelled) {
          setCategories(catData?.categories ?? []);
          setKits(kitData?.kits ?? []);
          setItems(data?.items ?? []);
        }
      } catch (e) {
        console.error("catalog load failed", e);
        if (!cancelled) {
          setCategories([]);
          setKits([]);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run().catch((e) => console.error("catalog fetch", e));
    return () => {
      cancelled = true;
    };
  }, [query, fetchCategoryId, startDate, endDate]);

  const addToCart = React.useCallback((itemId: string, pricePerDay?: number) => {
    setCart((prev) => {
      const catalog = itemsRef.current;
      const item = catalog.find((i) => i.id === itemId);
      const max = item
        ? (item.availability.availableForDates ?? item.availability.availableNow)
        : 0;
      const price = pricePerDay ?? (item ? Number(item.pricePerDay) : undefined);
      const next = [...prev];
      const idx = next.findIndex((l) => l.itemId === itemId);
      const currentQty = idx >= 0 ? next[idx].qty : 0;
      const nextQty = max <= 0 ? 0 : Math.min(currentQty + 1, max);
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          qty: nextQty,
          pricePerDay: price ?? next[idx].pricePerDay,
        };
      } else {
        next.push({ itemId, qty: nextQty, pricePerDay: price });
      }
      saveCart(next, cartScopeRef.current);
      return next.filter((l) => l.qty > 0);
    });
  }, []);

  const setQty = React.useCallback((itemId: string, qty: number) => {
    setCart((prev) => {
      const catalog = itemsRef.current;
      const item = catalog.find((i) => i.id === itemId);
      const max = item
        ? (item.availability.availableForDates ?? item.availability.availableNow)
        : 0;
      const clamped = max <= 0 ? 0 : Math.max(0, Math.min(qty, max));
      const next = prev
        .map((l) => (l.itemId === itemId ? { ...l, qty: clamped } : l))
        .filter((l) => l.qty > 0);
      if (!next.some((l) => l.itemId === itemId) && clamped > 0) {
        next.push({
          itemId,
          qty: clamped,
          pricePerDay: item ? Number(item.pricePerDay) : undefined,
        });
      }
      saveCart(next, cartScopeRef.current);
      return next;
    });
  }, []);

  function addKitToCart(kit: Kit) {
    // Обновляем корзину ОДНИМ апдейтом, чтобы не словить race condition и не выйти за лимит доступности
    setCart((prev) => {
      const catalog = itemsRef.current;
      const next = [...prev];
      for (const l of kit.lines) {
        const itemId = l.item.id;
        const inv = catalog.find((i) => i.id === itemId);
        const max = inv
          ? (inv.availability.availableForDates ?? inv.availability.availableNow)
          : 0;
        const idx = next.findIndex((x) => x.itemId === itemId);
        const currentQty = idx >= 0 ? next[idx].qty : 0;
        const desired = currentQty + l.defaultQty;
        const clamped = max <= 0 ? 0 : Math.min(desired, max);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            qty: clamped,
            pricePerDay: next[idx].pricePerDay ?? (inv ? Number(inv.pricePerDay) : undefined),
          };
        } else {
          next.push({
            itemId,
            qty: clamped,
            pricePerDay: inv ? Number(inv.pricePerDay) : undefined,
          });
        }
      }
      const cleaned = next.filter((x) => x.qty > 0);
      saveCart(cleaned, cartScopeRef.current);
      return cleaned;
    });
  }

  const qtyByItemId = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of cart) m[l.itemId] = l.qty;
    return m;
  }, [cart]);

  const openDetail = React.useCallback((id: string) => setSelectedId(id), []);
  const handleCardAdd = React.useCallback(
    (id: string, price: number) => addToCart(id, price),
    [addToCart],
  );
  const handleCardDec = React.useCallback(
    (id: string, currentQty: number) => setQty(id, currentQty - 1),
    [setQty],
  );
  const handleCardInc = React.useCallback(
    (id: string, currentQty: number) => setQty(id, currentQty + 1),
    [setQty],
  );
  const handleCardSetQty = React.useCallback(
    (id: string, qty: number) => setQty(id, qty),
    [setQty],
  );

  const selectedItem = selectedId
    ? items.find((i) => i.id === selectedId) ?? null
    : null;

  const cartTotalQty = cart.reduce((sum, l) => sum + l.qty, 0);
  const cartTotalPerDay = cart.reduce((sum, l) => {
    const price =
      l.pricePerDay ?? Number(items.find((i) => i.id === l.itemId)?.pricePerDay) ?? 0;
    return sum + l.qty * price;
  }, 0);
  const rentalDays = daysBetweenDateOnly(startDate, endDate);
  const cartTotalForPeriod = cartTotalPerDay * (rentalDays || 1);

  return (
    <AppShell title="Каталог">
      <section className="mk-section">
        <div className="mk-head">
          <div className="mk-title">
            {isQuickSupplement ? "Быстрая доп.-выдача" : "Реквизит, который работает на ваши события"}
          </div>
          <div className="mk-subtitle">
            {isQuickSupplement
              ? "Добавь нужные позиции и оформи доп.-заявку. Даты и заказчик будут взяты из родительской заявки."
              : "Ищи позиции, добавляй в корзину, указывай даты — склад подготовит смету и подтвердит доступность."}
          </div>

          {!isQuickSupplement ? (
            <>
              <div className="mk-datesRow">
                <CatalogDateField
                  label="Дата начала"
                  value={startDate}
                  onChange={(v) => patchCatalogDates({ startDate: v })}
                  min={dateMin}
                />
                <CatalogDateField
                  label="Дата окончания"
                  value={endDate}
                  onChange={(v) => patchCatalogDates({ endDate: v })}
                  min={endMin >= dateMin ? endMin : dateMin}
                />
                {isGreenwich ? (
                  <CatalogDateField
                    label="Готовность к дате"
                    value={readyByDate}
                    onChange={(v) => patchCatalogDates({ readyByDate: v })}
                    min={dateMin}
                    max={startDate}
                    hint="Склад обязуется подготовить реквизит к этой дате (не позже начала аренды)"
                  />
                ) : null}
              </div>
              <span className="mk-subtitle">
                Доступность и цены считаются на выбранный период. Даты в прошлом недоступны; по умолчанию —
                готовность сегодня, аренда с завтра до послезавтра.
              </span>
            </>
          ) : (
            <div className="mk-subtitle">
              Период: <strong>{formatDateRu(startDate)}</strong> — <strong>{formatDateRu(endDate)}</strong>
            </div>
          )}

          <div className="mk-toolbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mk-search"
              placeholder="Поиск по каталогу…"
            />
            <div className="flex items-center gap-2 justify-between md:justify-end">
              <Link href={isQuickSupplement ? `/cart?quickParentId=${quickParentId}` : "/cart"} className="mk-cartPill">
                Корзина: <strong>{cartTotalQty}</strong>
                {cartTotalForPeriod > 0 ? ` · ${Math.round(cartTotalForPeriod)} ₽` : ""}
              </Link>
            </div>
          </div>

          <div className="mk-tabs" role="tablist" aria-label="Разделы каталога">
            <button
              role="tab"
              aria-selected={activeTab === "positions"}
              className={["mk-tab", activeTab === "positions" ? "mk-tabActive" : ""].join(" ")}
              onClick={() => setActiveTab("positions")}
            >
              Позиции
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "categories"}
              className={["mk-tab", activeTab === "categories" ? "mk-tabActive" : ""].join(" ")}
              onClick={() => setActiveTab("categories")}
            >
              Категории
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "kits"}
              className={["mk-tab", activeTab === "kits" ? "mk-tabActive" : ""].join(" ")}
              onClick={() => setActiveTab("kits")}
            >
              Пакеты
            </button>
          </div>

          {activeTab === "categories" && categories.length ? (
            <div className="mk-chipRow" aria-label="Категории">
              <button
                className={["mk-chip", !categoryId ? "mk-chipActive" : ""].join(" ")}
                onClick={() => setCategoryId(null)}
              >
                Все
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={["mk-chip", categoryId === c.id ? "mk-chipActive" : ""].join(" ")}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {activeTab === "positions" ? (
          loading ? (
            <div className="text-sm text-zinc-600">Загрузка каталога…</div>
          ) : (
            <div className="mk-grid">
              {items.map((it) => (
                <CatalogItemCard
                  key={it.id}
                  item={it}
                  qtyInCart={qtyByItemId[it.id] ?? 0}
                  onDetail={openDetail}
                  onAdd={handleCardAdd}
                  onDec={handleCardDec}
                  onInc={handleCardInc}
                  onSetQty={handleCardSetQty}
                />
              ))}
            </div>
          )
        ) : activeTab === "categories" ? (
          !categoryId ? (
            <div className="mk-emptyTab">
              <p className="mk-subtitle">Выберите категорию выше — отобразятся позиции этой категории.</p>
            </div>
          ) : loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : (
            <div className="mk-grid">
              {items.map((it) => (
                <CatalogItemCard
                  key={it.id}
                  item={it}
                  qtyInCart={qtyByItemId[it.id] ?? 0}
                  onDetail={openDetail}
                  onAdd={handleCardAdd}
                  onDec={handleCardDec}
                  onInc={handleCardInc}
                  onSetQty={handleCardSetQty}
                />
              ))}
            </div>
          )
        ) : activeTab === "kits" ? (
          kits.length ? (
            <div className="mk-sectionBlock">
              <div className="mk-row">
                <div className="mk-name" style={{ fontSize: "1.05rem" }}>
                  Пакетные предложения
                </div>
                <div className="mk-subtitle">Наборы, которые часто берут вместе.</div>
              </div>
              <div className="mk-kits">
                {kits.map((k) => (
                  <div key={k.id} className="mk-kit">
                    <div className="mk-kitHead">
                      <div className="mk-kitName">{k.name}</div>
                      <div className="mk-subtitle">
                        {k.description ?? "Набор реквизита"}
                      </div>
                    </div>
                    <div className="mk-kitBody">
                      <div className="mk-kitList">
                        {k.lines.slice(0, 5).map((l) => (
                          <div key={l.item.id} className="mk-kitListItem">
                            <span>{l.item.name}</span>
                            <span>× {l.defaultQty}</span>
                          </div>
                        ))}
                        {k.lines.length > 5 ? (
                          <div className="mk-subtitle">+ ещё {k.lines.length - 5} поз.</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mk-kitFooter">
                      <button className="mk-addBtn" onClick={() => addKitToCart(k)}>
                        Добавить набор в корзину
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-600">Пакетов пока нет.</div>
          )
        ) : null}
      </section>

      {cartTotalQty > 0 && showFloatingCart && typeof document !== "undefined"
        ? createPortal(
            <Link
              href={isQuickSupplement ? `/cart?quickParentId=${quickParentId}` : "/cart"}
              className="mk-floatingCart"
              aria-label={`Корзина: ${cartTotalQty} поз., ${Math.round(cartTotalForPeriod)} ₽ за период`}
            >
              <span className="mk-floatingCartIcon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 01-8 0" />
                </svg>
              </span>
              <span className="mk-floatingCartSum">
                {cartTotalQty} поз. · {Math.round(cartTotalForPeriod)} ₽
              </span>
            </Link>,
            document.body
          )
        : null}

      {selectedItem ? (
        <ItemModal
          item={selectedItem}
          qtyInCart={qtyByItemId[selectedItem.id] ?? 0}
          availableForDates={selectedItem.availability.availableForDates}
          onClose={() => setSelectedId(null)}
          onAdd={() => addToCart(selectedItem.id, Number(selectedItem.pricePerDay))}
          onInc={() => setQty(selectedItem.id, (qtyByItemId[selectedItem.id] ?? 0) + 1)}
          onDec={() => setQty(selectedItem.id, (qtyByItemId[selectedItem.id] ?? 0) - 1)}
          onSetQty={(qty) => setQty(selectedItem.id, qty)}
        />
      ) : null}
    </AppShell>
  );
}

