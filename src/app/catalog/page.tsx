"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { loadCart, saveCart, type CartLine } from "@/lib/cart";
import {
  catalogDatesFromStorage,
  getDefaultCatalogDates,
  normalizeCatalogDates,
  todayDateOnly,
} from "@/lib/catalogDates";
import "./catalog.css";
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

function formatDateRu(dateOnly: string) {
  // dateOnly = YYYY-MM-DD
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function parseRuToDateOnly(value: string) {
  const trimmed = value.trim();
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(trimmed);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  if (!yy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0, 0));
  // validate overflow (e.g. 31.02)
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

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

function typeLabelRu(t: CatalogItem["type"]) {
  switch (t) {
    case "ASSET":
      return "Штучный";
    case "BULK":
      return "Мерный";
    case "CONSUMABLE":
      return "Расходник";
  }
}

function DateField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint?: string;
  min?: string;
  max?: string;
}) {
  const safeMin = min;
  const safeMax =
    min && max && max.localeCompare(min) < 0 ? undefined : max;

  const hintRef = React.useRef<HTMLSpanElement | null>(null);
  const [text, setText] = React.useState(() => formatDateRu(value));
  const [showHint, setShowHint] = React.useState(false);

  React.useEffect(() => {
    setText(formatDateRu(value));
  }, [value]);

  React.useEffect(() => {
    if (!hint || !showHint) return;
    function handleClickOutside(e: MouseEvent) {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) {
        setShowHint(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [hint, showHint]);

  return (
    <div className="mk-dateField">
      <span className="mk-dateFieldLabel">
        {label}
        {hint ? (
          <span
            ref={hintRef}
            className="mk-dateHint"
            role="button"
            tabIndex={0}
            onClick={() => setShowHint((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setShowHint((v) => !v);
              }
            }}
            aria-label={hint}
            aria-expanded={showHint}
          >
            ?
            {showHint ? (
              <span className="mk-dateTooltip" role="tooltip">
                {hint}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="mk-dateWrap">
        <input
          className="mk-dateText"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const parsed = parseRuToDateOnly(text);
            if (parsed) onChange(parsed);
            else setText(formatDateRu(value));
          }}
          inputMode="numeric"
          placeholder="ДД.ММ.ГГГГ"
          aria-label={label}
        />
        {/*
          Не вызываем showPicker() из JS — в Chromium промис иногда отклоняется с Event,
          Next dev overlay показывает [object Event]. Нативный input поверх иконки открывает календарь без API.
        */}
        <label className="mk-dateBtn">
          <span className="mk-dateBtnFace" aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 2v2H5a2 2 0 0 0-2 2v2h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm14 8H3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10z" />
            </svg>
          </span>
          <input
            type="date"
            className="mk-dateNative"
            value={value}
            min={safeMin}
            max={safeMax}
            onChange={(e) => onChange(e.target.value)}
            tabIndex={-1}
            aria-label="Выбрать дату"
          />
        </label>
      </span>
    </div>
  );
}

export default function CatalogPage() {
  const { state } = useAuth();
  const isGreenwich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const [quickParentId, setQuickParentId] = React.useState<string | null>(null);

  /** Chromium: showPicker() иногда отклоняет промис с `Event` → Next overlay: [object Event]. */
  React.useEffect(() => {
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      if (e.reason instanceof Event) {
        e.preventDefault();
      }
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);
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

  React.useEffect(() => {
    function onScroll() {
      const y =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      setShowFloatingCart(y > 280);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll);
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

  function availableForItem(itemId: string) {
    const it = items.find((i) => i.id === itemId);
    if (!it) return 0;
    return it.availability.availableForDates ?? it.availability.availableNow;
  }

  function addToCart(itemId: string, pricePerDay?: number) {
    setCart((prev) => {
      const max = availableForItem(itemId);
      const item = items.find((i) => i.id === itemId);
      const price = pricePerDay ?? (item ? Number(item.pricePerDay) : undefined);
      const next = [...prev];
      const idx = next.findIndex((l) => l.itemId === itemId);
      const currentQty = idx >= 0 ? next[idx].qty : 0;
      const nextQty = Math.min(currentQty + 1, max || currentQty + 1);
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          qty: nextQty,
          pricePerDay: price ?? next[idx].pricePerDay,
        };
      } else {
        next.push({ itemId, qty: nextQty, pricePerDay: price });
      }
      saveCart(next, cartScope);
      return next.filter((l) => l.qty > 0);
    });
  }

  function setQty(itemId: string, qty: number) {
    setCart((prev) => {
      const max = availableForItem(itemId);
      const clamped = Math.max(0, Math.min(qty, max || qty));
      const item = items.find((i) => i.id === itemId);
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
      saveCart(next, cartScope);
      return next;
    });
  }

  function qtyInCart(itemId: string) {
    return cart.find((l) => l.itemId === itemId)?.qty ?? 0;
  }

  function addKitToCart(kit: Kit) {
    // Обновляем корзину ОДНИМ апдейтом, чтобы не словить race condition и не выйти за лимит доступности
    setCart((prev) => {
      const next = [...prev];
      for (const l of kit.lines) {
        const itemId = l.item.id;
        const max = availableForItem(itemId);
        const idx = next.findIndex((x) => x.itemId === itemId);
        const currentQty = idx >= 0 ? next[idx].qty : 0;
        const desired = currentQty + l.defaultQty;
        const clamped = Math.min(desired, max || desired);
        const item = items.find((i) => i.id === itemId);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            qty: clamped,
            pricePerDay: next[idx].pricePerDay ?? (item ? Number(item.pricePerDay) : undefined),
          };
        } else {
          next.push({ itemId, qty: clamped, pricePerDay: item ? Number(item.pricePerDay) : undefined });
        }
      }
      const cleaned = next.filter((x) => x.qty > 0);
      saveCart(cleaned, cartScope);
      return cleaned;
    });
  }

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
                <DateField
                  label="Дата начала"
                  value={startDate}
                  onChange={(v) => patchCatalogDates({ startDate: v })}
                  min={dateMin}
                />
                <DateField
                  label="Дата окончания"
                  value={endDate}
                  onChange={(v) => patchCatalogDates({ endDate: v })}
                  min={endMin >= dateMin ? endMin : dateMin}
                />
                {isGreenwich ? (
                  <DateField
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
            <article key={it.id} className="mk-card">
              <div className="mk-cardInner">
                <div className="mk-box">
                  {it.photo1Key ? (
                    <img
                      src={`/api/inventory/positions/${it.id}/photo`}
                      alt=""
                      className="mk-cardPhoto"
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  ) : (
                    <div className="mk-placeholder">
                      <div className="mk-placeholderBadge">
                        <span style={{ color: "var(--mk-violet)" }}>WOWSTORG</span>
                        <span style={{ opacity: 0.7 }}>·</span>
                        <span>без фото</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mk-corner">
                  <button
                    className="mk-cornerBtn"
                    onClick={() => setSelectedId(it.id)}
                    aria-label="Подробнее"
                    title="Подробнее"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                      <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mk-content">
                <div className="mk-nameRow">
                  <button
                    className="mk-cardLink"
                    onClick={() => setSelectedId(it.id)}
                  >
                    <div className="mk-name">{it.name}</div>
                  </button>
                  <div className="mk-price">
                    <strong>{it.pricePerDay}</strong>
                    <span className="mk-priceUnit">р/сут</span>
                  </div>
                </div>
                <div className="mk-meta">
                  <span className="mk-pill">{typeLabelRu(it.type)}</span>
                  <span className="mk-available">
                    Доступно:{" "}
                    <strong>
                      {it.availability.availableForDates ?? it.availability.availableNow}
                    </strong>
                  </span>
                </div>
                <div className="mk-desc">
                  {it.description?.trim()
                    ? it.description
                    : "Описание будет добавлено складом — пока можно оформить заявку по названию."}
                </div>

                <div className="mk-actions">
                  {(() => {
                    const available = it.availability.availableForDates ?? it.availability.availableNow;
                    const inCart = qtyInCart(it.id);
                    const canAdd = available > inCart;
                    if (inCart <= 0) {
                      return (
                        <button
                          className="mk-addBtn"
                          onClick={() => addToCart(it.id, Number(it.pricePerDay))}
                          disabled={!canAdd}
                          title={!canAdd ? "Нет доступных на выбранные даты" : undefined}
                        >
                          В корзину
                        </button>
                      );
                    }
                    return (
                      <div className="mk-qty" aria-label="Количество в корзине">
                        <button onClick={() => setQty(it.id, inCart - 1)} aria-label="Минус">
                          −
                        </button>
                        <span>{inCart}</span>
                        <button
                          onClick={() => setQty(it.id, inCart + 1)}
                          aria-label="Плюс"
                          disabled={!canAdd}
                        >
                          +
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </article>
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
                <article key={it.id} className="mk-card">
                  <div className="mk-cardInner">
                    <div className="mk-box">
                      {it.photo1Key ? (
                        <img
                          src={`/api/inventory/positions/${it.id}/photo`}
                          alt=""
                          className="mk-cardPhoto"
                          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                        />
                      ) : (
                        <div className="mk-placeholder">
                          <div className="mk-placeholderBadge">
                            <span style={{ color: "var(--mk-violet)" }}>WOWSTORG</span>
                            <span style={{ opacity: 0.7 }}>·</span>
                            <span>без фото</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mk-corner">
                      <button
                        className="mk-cornerBtn"
                        onClick={() => setSelectedId(it.id)}
                        aria-label="Подробнее"
                        title="Подробнее"
                      >
                        <svg viewBox="0 0 24 24">
                          <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                          <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="mk-content">
                    <div className="mk-nameRow">
                      <button className="mk-cardLink" onClick={() => setSelectedId(it.id)}>
                        <div className="mk-name">{it.name}</div>
                      </button>
                      <div className="mk-price">
                        <strong>{it.pricePerDay}</strong>
                        <span className="mk-priceUnit">р/сут</span>
                      </div>
                    </div>
                    <div className="mk-meta">
                      <span className="mk-pill">{typeLabelRu(it.type)}</span>
                      <span className="mk-available">
                        Доступно:{" "}
                        <strong>
                          {it.availability.availableForDates ?? it.availability.availableNow}
                        </strong>
                      </span>
                    </div>
                    <div className="mk-desc">
                      {it.description?.trim()
                        ? it.description
                        : "Описание будет добавлено складом — пока можно оформить заявку по названию."}
                    </div>
                    <div className="mk-actions">
                      {(() => {
                        const available =
                          it.availability.availableForDates ?? it.availability.availableNow;
                        const inCart = qtyInCart(it.id);
                        const canAdd = available > inCart;
                        if (inCart <= 0) {
                          return (
                            <button
                              className="mk-addBtn"
                              onClick={() => addToCart(it.id, Number(it.pricePerDay))}
                              disabled={!canAdd}
                              title={!canAdd ? "Нет доступных на выбранные даты" : undefined}
                            >
                              В корзину
                            </button>
                          );
                        }
                        return (
                          <div className="mk-qty" aria-label="Количество в корзине">
                            <button onClick={() => setQty(it.id, inCart - 1)} aria-label="Минус">
                              −
                            </button>
                            <span>{inCart}</span>
                            <button
                              onClick={() => setQty(it.id, inCart + 1)}
                              aria-label="Плюс"
                              disabled={!canAdd}
                            >
                              +
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </article>
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
          qtyInCart={qtyInCart(selectedItem.id)}
          availableForDates={selectedItem.availability.availableForDates}
          onClose={() => setSelectedId(null)}
          onAdd={() => addToCart(selectedItem.id, Number(selectedItem.pricePerDay))}
          onInc={() => setQty(selectedItem.id, qtyInCart(selectedItem.id) + 1)}
          onDec={() => setQty(selectedItem.id, qtyInCart(selectedItem.id) - 1)}
        />
      ) : null}
    </AppShell>
  );
}

