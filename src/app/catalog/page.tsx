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
import { rentalCalendarDaysInclusive } from "@/lib/rental-days";
import "./catalog.css";
import { CatalogDateField } from "@/app/catalog/CatalogDateField";
import { CatalogItemCard } from "@/app/catalog/CatalogItemCard";
import { ItemModal } from "@/app/catalog/ItemModal";

type CatalogTab = "positions" | "categories" | "kits";

type Category = { id: string; name: string; slug: string };

type KitLine = { defaultQty: number; item: { id: string; name: string } };
type Kit = { id: string; name: string; description: string | null; lines: KitLine[] };
type CatalogPagination = { page: number; pageSize: number; total: number; totalPages: number };

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

const CATALOG_PAGE_SIZE = 32;

function buildPaginationTokens(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  const tokens: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) tokens.push("ellipsis");
  for (let page = start; page <= end; page += 1) {
    tokens.push(page);
  }
  if (end < totalPages - 1) tokens.push("ellipsis");
  tokens.push(totalPages);

  return tokens;
}

function ruCalendarDayCount(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return `${n} календарных дней`;
  if (m10 === 1) return `${n} календарный день`;
  if (m10 >= 2 && m10 <= 4) return `${n} календарных дня`;
  return `${n} календарных дней`;
}

function catalogCartHref(args: {
  quickParentId: string | null;
  projectId: string | null;
  projectMode: "dated" | "demo";
  estimateVersionId: string | null;
}): string {
  const { quickParentId, projectId, projectMode, estimateVersionId } = args;
  if (quickParentId) return `/cart?quickParentId=${encodeURIComponent(quickParentId)}`;
  if (projectId) {
    const params = new URLSearchParams();
    params.set("projectId", projectId);
    if (projectMode === "demo") params.set("projectMode", "demo");
    if (estimateVersionId?.trim()) params.set("estimateVersionId", estimateVersionId.trim());
    return `/cart?${params.toString()}`;
  }
  return "/cart";
}

export default function CatalogPage() {
  const { state } = useAuth();
  const isGreenwich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const isWarehouse = state.status === "authenticated" && state.user.role === "WOWSTORG";
  const [quickParentId, setQuickParentId] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [projectBannerTitle, setProjectBannerTitle] = React.useState<string | null>(null);
  const [projectMode, setProjectMode] = React.useState<"dated" | "demo">("dated");
  const [estimateVersionId, setEstimateVersionId] = React.useState<string | null>(null);

  const isQuickSupplement = Boolean(quickParentId);
  const isProjectCatalog = Boolean(projectId) && !quickParentId;
  const isProjectDemoCatalog = isProjectCatalog && projectMode === "demo";
  const cartScope = quickParentId
    ? `quick:${quickParentId}`
    : projectId
      ? isProjectDemoCatalog
        ? `project-demo:${projectId}`
        : `project:${projectId}`
      : undefined;
  const [projectBannerNote, setProjectBannerNote] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [kits, setKits] = React.useState<Kit[]>([]);
  const [kitItemsById, setKitItemsById] = React.useState<Record<string, CatalogItem>>({});
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<CatalogTab>("positions");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pagination, setPagination] = React.useState<CatalogPagination | null>(null);
  // Одинаковые дефолты на SSR и первом кадре клиента — иначе гидратация и «ломаные» min/max у type=date
  const [startDate, setStartDate] = React.useState(() => getDefaultCatalogDates().startDate);
  const [endDate, setEndDate] = React.useState(() => getDefaultCatalogDates().endDate);
  const [readyByDate, setReadyByDate] = React.useState(() => getDefaultCatalogDates().readyByDate);
  const [showFloatingCart, setShowFloatingCart] = React.useState(false);
  const projectDatesPrefilledRef = React.useRef<string | null>(null);

  const itemLookup = React.useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of items) map.set(item.id, item);
    for (const item of Object.values(kitItemsById)) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return map;
  }, [items, kitItemsById]);
  const itemLookupRef = React.useRef(itemLookup);
  itemLookupRef.current = itemLookup;
  const cartScopeRef = React.useRef(cartScope);
  cartScopeRef.current = cartScope;
  const isProjectDemoCatalogRef = React.useRef(isProjectDemoCatalog);
  isProjectDemoCatalogRef.current = isProjectDemoCatalog;

  const datesRef = React.useRef({ readyByDate, startDate, endDate });
  datesRef.current = { readyByDate, startDate, endDate };

  const patchCatalogDates = React.useCallback(
    (patch: Partial<{ readyByDate: string; startDate: string; endDate: string }>) => {
      try {
        const n = normalizeCatalogDates({ ...datesRef.current, ...patch });
        setReadyByDate(n.readyByDate);
        setStartDate(n.startDate);
        setEndDate(n.endDate);
        setCurrentPage(1);
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
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setQuickParentId(params.get("quickParentId"));
    setProjectId(params.get("projectId"));
    setProjectMode(params.get("projectMode") === "demo" ? "demo" : "dated");
    setEstimateVersionId(params.get("estimateVersionId"));
  }, []);

  /** После монтирования подставляем даты из localStorage (не в useState — иначе mismatch гидратации). */
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("quickParentId")) return;
    if (new URLSearchParams(window.location.search).get("projectMode") === "demo") return;
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
    if (!isProjectCatalog || !projectId || !isWarehouse) {
      setProjectBannerTitle(null);
      setProjectBannerNote(null);
      projectDatesPrefilledRef.current = null;
      return;
    }
    let cancelled = false;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((
        data: {
          project?: {
            title?: string;
            eventStartDate?: string | null;
            eventEndDate?: string | null;
            eventDateConfirmed?: boolean;
            draftOrder?: { linesCount?: number } | null;
          };
        } | null,
      ) => {
        if (cancelled) return;
        setProjectBannerTitle(data?.project?.title ?? null);
        const project = data?.project;
        if (!project) {
          setProjectBannerNote(null);
          return;
        }
        if (projectMode === "demo") {
          setProjectBannerNote("Demo-режим без дат: собираешь корзину, не резервируя остатки.");
          return;
        }
        const hasDates = Boolean(project.eventStartDate && project.eventEndDate);
        if (project.eventDateConfirmed && hasDates) {
          setProjectBannerNote("Даты проекта подставлены автоматически, но их можно изменить под часть мероприятия.");
          if (projectDatesPrefilledRef.current !== projectId) {
            setStartDate(project.eventStartDate ?? startDate);
            setEndDate(project.eventEndDate ?? endDate);
            setReadyByDate(project.eventStartDate ?? readyByDate);
            projectDatesPrefilledRef.current = projectId;
          }
        } else {
          setProjectBannerNote("У проекта ещё нет подтверждённых дат. Для предварительной сборки открой demo-режим.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectBannerTitle(null);
          setProjectBannerNote(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [endDate, isProjectCatalog, isWarehouse, projectId, projectMode, readyByDate, startDate]);

  React.useEffect(() => {
    if (!isProjectDemoCatalog || !projectId || !cartScope) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/draft-order`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as
          | {
              draftOrder?: {
                lines?: Array<{ itemId: string; qty: number; pricePerDaySnapshot: number | null }>;
              } | null;
            }
          | null;
        if (!res.ok || cancelled) return;
        const next =
          data?.draftOrder?.lines?.map((line) => ({
            itemId: line.itemId,
            qty: line.qty,
            pricePerDay: line.pricePerDaySnapshot ?? undefined,
          })) ?? [];
        saveCart(next, cartScope);
        setCart(next);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartScope, isProjectDemoCatalog, projectId]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      if (!isQuickSupplement && !isProjectDemoCatalog) {
        localStorage.setItem("catalog_readyByDate", readyByDate);
      }
    }
  }, [readyByDate, isProjectDemoCatalog, isQuickSupplement]);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      if (!isQuickSupplement && !isProjectDemoCatalog) {
        localStorage.setItem("catalog_startDate", startDate);
        localStorage.setItem("catalog_endDate", endDate);
      }
    }
  }, [startDate, endDate, isProjectDemoCatalog, isQuickSupplement]);

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
  const shouldFetchPagedItems = activeTab !== "kits" && !(activeTab === "categories" && !categoryId);

  React.useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      try {
        const [catRes, kitRes] = await Promise.all([
          fetch("/api/catalog/categories", { cache: "no-store" }),
          fetch("/api/catalog/kits", { cache: "no-store" }),
        ]);
        const catData = (await catRes.json().catch(() => null)) as { categories?: Category[] } | null;
        const kitData = (await kitRes.json().catch(() => null)) as { kits?: Kit[] } | null;
        if (!cancelled) {
          setCategories(catData?.categories ?? []);
          setKits(kitData?.kits ?? []);
        }
      } catch (e) {
        console.error("catalog meta load failed", e);
        if (!cancelled) {
          setCategories([]);
          setKits([]);
        }
      }
    }
    void loadMeta().catch((e) => console.error("catalog meta fetch", e));
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!shouldFetchPagedItems) {
      setItems([]);
      setPagination(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const url = new URL("/api/catalog/items", window.location.origin);
        if (debouncedQuery) url.searchParams.set("query", debouncedQuery);
        if (fetchCategoryId) url.searchParams.set("category", fetchCategoryId);
        if (!isProjectDemoCatalog) {
          url.searchParams.set("startDate", startDate);
          url.searchParams.set("endDate", endDate);
        }
        url.searchParams.set("page", String(currentPage));
        url.searchParams.set("pageSize", String(CATALOG_PAGE_SIZE));
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as {
          items?: CatalogItem[];
          pagination?: CatalogPagination | null;
        } | null;
        if (!cancelled) {
          setItems(data?.items ?? []);
          setPagination(data?.pagination ?? null);
        }
      } catch (e) {
        console.error("catalog load failed", e);
        if (!cancelled) {
          setItems([]);
          setPagination(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run().catch((e) => console.error("catalog fetch", e));
    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    debouncedQuery,
    endDate,
    fetchCategoryId,
    isProjectDemoCatalog,
    shouldFetchPagedItems,
    startDate,
  ]);

  React.useEffect(() => {
    const kitIds = Array.from(new Set(kits.flatMap((kit) => kit.lines.map((line) => line.item.id))));
    if (kitIds.length === 0) {
      setKitItemsById({});
      return;
    }
    let cancelled = false;
    async function loadKitItems() {
      try {
        const params = new URLSearchParams();
        params.set("ids", kitIds.join(","));
        if (!isProjectDemoCatalog) {
          params.set("startDate", startDate);
          params.set("endDate", endDate);
        }
        const res = await fetch(`/api/catalog/items?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { items?: CatalogItem[] } | null;
        if (!cancelled) {
          setKitItemsById(
            Object.fromEntries((data?.items ?? []).map((item) => [item.id, item])),
          );
        }
      } catch (e) {
        console.error("catalog kit items load failed", e);
        if (!cancelled) setKitItemsById({});
      }
    }
    void loadKitItems().catch((e) => console.error("catalog kit items fetch", e));
    return () => {
      cancelled = true;
    };
  }, [endDate, isProjectDemoCatalog, kits, startDate]);

  const addToCart = React.useCallback((itemId: string, pricePerDay?: number) => {
    setCart((prev) => {
      const item = itemLookupRef.current.get(itemId);
      const demo = isProjectDemoCatalogRef.current;
      const max = item
        ? demo
          ? item.availability.availableNow
          : item.availability.availableForDates ?? item.availability.availableNow
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
      const item = itemLookupRef.current.get(itemId);
      const demo = isProjectDemoCatalogRef.current;
      const max = item
        ? demo
          ? item.availability.availableNow
          : item.availability.availableForDates ?? item.availability.availableNow
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
      const demo = isProjectDemoCatalogRef.current;
      const next = [...prev];
      for (const l of kit.lines) {
        const itemId = l.item.id;
        const inv = itemLookupRef.current.get(itemId);
        const max = inv
          ? demo
            ? inv.availability.availableNow
            : inv.availability.availableForDates ?? inv.availability.availableNow
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

  const selectedItem = selectedId ? itemLookup.get(selectedId) ?? null : null;

  const cartTotalQty = cart.reduce((sum, l) => sum + l.qty, 0);
  const cartTotalPerDay = cart.reduce((sum, l) => {
    const item = itemLookup.get(l.itemId);
    const price = l.pricePerDay ?? (item ? Number(item.pricePerDay) : 0);
    return sum + l.qty * price;
  }, 0);
  const rentalDays = isProjectDemoCatalog ? 1 : rentalCalendarDaysInclusive(startDate, endDate);
  const cartTotalForPeriod = cartTotalPerDay * (rentalDays || 1);

  const cartHref = catalogCartHref({
    quickParentId,
    projectId,
    projectMode,
    estimateVersionId,
  });
  const showPager = Boolean(pagination && pagination.totalPages > 1 && shouldFetchPagedItems);
  const paginationTokens = React.useMemo(
    () =>
      pagination
        ? buildPaginationTokens(pagination.page, pagination.totalPages)
        : [],
    [pagination],
  );
  const pager = showPager ? (
    <div className="mk-pagination">
      <div className="mk-pageSummary">
        Страница <strong>{pagination?.page}</strong> из <strong>{pagination?.totalPages}</strong>
        <span> · всего {pagination?.total} поз.</span>
      </div>
      <div className="mk-pageControls" aria-label="Навигация по страницам каталога">
        <button
          type="button"
          className="mk-pageBtn"
          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage <= 1}
        >
          Назад
        </button>
        <div className="mk-pageNumbers">
          {paginationTokens.map((token, idx) =>
            token === "ellipsis" ? (
              <span key={`ellipsis-${idx}`} className="mk-pageDots" aria-hidden="true">
                ...
              </span>
            ) : (
              <button
                key={token}
                type="button"
                className={[
                  "mk-pageNumber",
                  token === currentPage ? "mk-pageNumberActive" : "",
                ].join(" ")}
                onClick={() => setCurrentPage(token)}
                aria-current={token === currentPage ? "page" : undefined}
              >
                {token}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="mk-pageBtn"
          onClick={() =>
            setCurrentPage((prev) => Math.min(pagination?.totalPages ?? prev, prev + 1))
          }
          disabled={currentPage >= (pagination?.totalPages ?? 1)}
        >
          Вперёд
        </button>
      </div>
    </div>
  ) : null;

  return (
    <AppShell title="Каталог">
      <section className="mk-section">
        {isProjectCatalog && projectId ? (
          <div
            className={`mb-4 rounded-xl px-4 py-3 text-sm ${
              isProjectDemoCatalog
                ? "border border-red-200 bg-red-50/90 text-red-950"
                : "border border-violet-200 bg-violet-50/90 text-zinc-800"
            }`}
          >
            <div className={`font-semibold ${isProjectDemoCatalog ? "text-red-950" : "text-violet-900"}`}>
              {isProjectDemoCatalog ? "Demo-каталог проекта" : "Каталог для проекта"}
              {projectBannerTitle ? `: ${projectBannerTitle}` : "…"}
            </div>
            <p className={`mt-1 ${isProjectDemoCatalog ? "text-red-900/80" : "text-zinc-600"}`}>
              {projectBannerNote ??
                (isProjectDemoCatalog
                  ? "Здесь нет дат и реальной заявки: ты просто собираешь demo-корзину без резервирования."
                  : "Корзина и заявка отдельные от обычной: полная цена, привязка к проекту.")}
            </p>
            <Link
              href={`/projects/${projectId}`}
              className={`mt-2 inline-block font-medium ${
                isProjectDemoCatalog ? "text-red-700 hover:text-red-900" : "text-violet-700 hover:text-violet-900"
              }`}
            >
              ← К карточке проекта
            </Link>
          </div>
        ) : null}

        <div className="mk-head">
          <div className="mk-title">
            {isQuickSupplement
              ? "Быстрая доп.-выдача"
              : isProjectDemoCatalog
                ? "Demo-каталог без дат"
                : "Реквизит, который работает на ваши события"}
          </div>
          <div className="mk-subtitle">
            {isQuickSupplement
              ? "Добавь нужные позиции и оформи доп.-заявку. Даты и заказчик будут взяты из родительской заявки."
              : isProjectDemoCatalog
                ? "Собери позиции заранее без дат. Корзина сохранится в demo-черновик проекта и не создаст реальную складскую заявку."
                : isProjectCatalog
                ? "Выбирай позиции и даты — оформи заявку реквизита в корзине; заказчик подставится из проекта."
                : "Ищи позиции, добавляй в корзину, указывай даты — склад подготовит смету и подтвердит доступность."}
          </div>

          {!isQuickSupplement && !isProjectDemoCatalog ? (
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
              {startDate && endDate && rentalDays > 0 ? (
                <p className="mt-2 text-sm font-medium text-violet-900/90">
                  Выбрано: {ruCalendarDayCount(rentalDays)} (даты начала и окончания включаются в период)
                </p>
              ) : null}
              <span className="mk-subtitle">
                Доступность и цены считаются на выбранный период. Даты в прошлом недоступны; по умолчанию —
                готовность сегодня, аренда с завтра до послезавтра.
              </span>
            </>
          ) : isQuickSupplement ? (
            <div className="mk-subtitle">
              Период: <strong>{formatDateRu(startDate)}</strong> — <strong>{formatDateRu(endDate)}</strong>
              {rentalDays > 0 ? (
                <span className="ml-1 text-zinc-500">· {ruCalendarDayCount(rentalDays)}</span>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-950">
              <div className="font-semibold">Демо-режим без дат</div>
              <div className="mt-1 text-red-900/80">
                Доступность считается по остатку на сейчас, а итог ниже показывает предварительную сумму за 1 день для
                ориентира.
              </div>
            </div>
          )}

          <div className="mk-toolbar">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="mk-search"
              placeholder="Поиск по каталогу…"
            />
            <div className="flex items-center gap-2 justify-between md:justify-end">
              <Link href={cartHref} className="mk-cartPill">
                {isProjectDemoCatalog ? "Demo-корзина" : "Корзина"}: <strong>{cartTotalQty}</strong>
                {cartTotalForPeriod > 0
                  ? ` · ${Math.round(cartTotalForPeriod)} ₽${isProjectDemoCatalog ? " / предв. день" : ""}`
                  : ""}
              </Link>
            </div>
          </div>

          <div className="mk-tabs" role="tablist" aria-label="Разделы каталога">
            <button
              role="tab"
              aria-selected={activeTab === "positions"}
              className={["mk-tab", activeTab === "positions" ? "mk-tabActive" : ""].join(" ")}
              onClick={() => {
                setActiveTab("positions");
                setCurrentPage(1);
              }}
            >
              Позиции
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "categories"}
              className={["mk-tab", activeTab === "categories" ? "mk-tabActive" : ""].join(" ")}
              onClick={() => {
                setActiveTab("categories");
                setCurrentPage(1);
              }}
            >
              Категории
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "kits"}
              className={["mk-tab", activeTab === "kits" ? "mk-tabActive" : ""].join(" ")}
              onClick={() => {
                setActiveTab("kits");
                setCurrentPage(1);
              }}
            >
              Пакеты
            </button>
          </div>

          {activeTab === "categories" && categories.length ? (
            <div className="mk-chipRow" aria-label="Категории">
              <button
                className={["mk-chip", !categoryId ? "mk-chipActive" : ""].join(" ")}
                onClick={() => {
                  setCategoryId(null);
                  setCurrentPage(1);
                }}
              >
                Все
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={["mk-chip", categoryId === c.id ? "mk-chipActive" : ""].join(" ")}
                  onClick={() => {
                    setCategoryId(c.id);
                    setCurrentPage(1);
                  }}
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
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">По выбранным параметрам ничего не найдено.</div>
          ) : (
            <>
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
              {pager}
            </>
          )
        ) : activeTab === "categories" ? (
          !categoryId ? (
            <div className="mk-emptyTab">
              <p className="mk-subtitle">Выберите категорию выше — отобразятся позиции этой категории.</p>
            </div>
          ) : loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-600">В этой категории пока нет позиций по выбранным параметрам.</div>
          ) : (
            <>
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
              {pager}
            </>
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
              href={cartHref}
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
                {cartTotalQty} поз. · {Math.round(cartTotalForPeriod)} ₽{isProjectDemoCatalog ? " / день" : ""}
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

