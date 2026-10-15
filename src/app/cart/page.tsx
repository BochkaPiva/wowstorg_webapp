"use client";

import React from "react";
import { createPortal } from "react-dom";
import { BackLink } from "@/app/_ui/BackLink";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useClientReady } from "@/lib/use-client-ready";
import { useJsonResource, useReadResource } from "@/lib/use-json-resource";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { CartRelatedSuggestions } from "@/app/cart/CartRelatedSuggestions";
import { ItemModal } from "@/app/catalog/ItemModal";
import {
  CompactOrderDiscountControl,
  getOrderDiscountError,
  type OrderDiscountType,
  type OrderDiscountValue,
} from "@/app/orders/OrderDiscountControl";
import { useAuth } from "@/app/providers";
import { loadCart, saveCart, clearCart, type CartLine } from "@/lib/cart";
import { addDays, catalogDatesFromStorage, todayDateOnly } from "@/lib/catalogDates";
import { ORDER_TAX_RATE } from "@/lib/constants";
import type { OrderServicePaymentMethod } from "@/lib/order-service-internal-costs";
import { billableRentalDaysFromDateOnly, type RentalPartOfDay } from "@/lib/rental-days";
import "./cart.css";
import "../catalog/catalog.css";
import "../checkout/checkout.css";

type CatalogItem = {
  id: string;
  name: string;
  description: string | null;
  type: "ASSET" | "BULK" | "CONSUMABLE";
  pricePerDay: string;
  basePricePerDay?: number;
  loyalty?: {
    discountPercent: number;
    source: "RATING_TIER" | "PERSONAL_OFFER";
    sourceLabel: string;
    offerTitle: string | null;
  } | null;
  photo1Key: string | null;
  availability: { availableNow: number; availableForDates?: number };
};
const EMPTY_ITEMS: CatalogItem[] = [];
type CartState = { lines: CartLine[]; persist: boolean };
type CartAction = { type: "replace"; lines: CartLine[] } | { type: "stock"; items: CatalogItem[]; demo: boolean };
function cartReducer(state: CartState, action: CartAction): CartState {
  if (action.type === "replace") return { lines: action.lines, persist: false };
  let changed = false;
  const lines = state.lines.map(line => {
    const item = action.items.find(entry => entry.id === line.itemId);
    if (!item) return line;
    const cap = action.demo ? item.availability.availableNow : item.availability.availableForDates ?? item.availability.availableNow;
    const qty = Math.max(0, cap) <= 0 ? 0 : Math.min(line.qty, Math.max(0, cap));
    if (qty !== line.qty) changed = true;
    return { ...line, qty };
  }).filter(line => line.qty > 0);
  return changed ? { lines, persist: true } : state;
}

function formatDateRu(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function formatMoneyRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={["co-toggle", checked ? "co-toggle--on" : ""].join(" ")}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="co-toggleLabel">{label}</span>
      <span className="co-toggleTrack" aria-hidden>
        <span className="co-toggleThumb" />
      </span>
    </button>
  );
}

type Customer = { id: string; name: string };
type GreenwichUser = {
  id: string;
  displayName: string;
  ratingScore: number;
  tierName: string;
  discountPercent: number;
  payMultiplier: number;
  activeBonuses: ActiveMonthlyBonus[];
  activeOffers: Array<{
    id: string;
    title: string;
    discountPercent: number;
    itemIds: string[];
  }>;
};
type ActiveMonthlyBonus = {
  id: string;
  code: string;
  discountPercent: number;
  validUntil: string;
};
type MyBonusSnapshot = {
  rating: { tierDiscountPercent: number };
  activeBonuses: ActiveMonthlyBonus[];
};
type DraftOrderResponse = {
  draftOrder?: {
    id: string;
    estimateVersionId: string | null;
    title: string | null;
    comment: string | null;
    lines: Array<{
      id: string;
      itemId: string;
      itemName: string;
      qty: number;
      plannedDays: number;
      comment: string | null;
      periodGroup: string | null;
      pricePerDaySnapshot: number | null;
    }>;
  } | null;
  error?: { message?: string };
};

export default function CartPage() {
  return <React.Suspense fallback={<AppShell title="Корзина"><ListSkeleton rows={4} /></AppShell>}><CartEntry /></React.Suspense>;
}

function CartEntry() {
  const params = useSearchParams();
  const ready = useClientReady();
  const { state } = useAuth();
  const context = {
    quickParentId: params.get("quickParentId"), projectId: params.get("projectId"),
    projectMode: params.get("projectMode") === "demo" ? "demo" as const : "dated" as const,
    initialEstimateVersionId: params.get("estimateVersionId"), returnTo: params.get("returnTo"),
  };
  if (!ready || state.status !== "authenticated") return <AppShell title="Корзина"><ListSkeleton rows={4} /></AppShell>;
  return <CartContent key={JSON.stringify([state.user.id, state.user.role, context])} {...context} />;
}

function CartContent({ quickParentId, projectId, projectMode, initialEstimateVersionId, returnTo }: {
  quickParentId: string | null; projectId: string | null; projectMode: "dated" | "demo";
  initialEstimateVersionId: string | null; returnTo: string | null;
}) {
  const router = useRouter();
  const { state } = useAuth();
  const authRole = state.status === "authenticated" ? state.user.role : null;
  const [estimateVersionId, setEstimateVersionId] = React.useState(initialEstimateVersionId);
  const isQuickSupplement = Boolean(quickParentId);
  const isProjectCart = Boolean(projectId) && !quickParentId;
  const isProjectDemoCart = isProjectCart && projectMode === "demo";
  const cartScope = quickParentId
    ? `quick:${quickParentId}`
    : projectId
      ? isProjectDemoCart
        ? `project-demo:${projectId}`
        : `project:${projectId}`
      : undefined;

  const [projectContext, setProjectContext] = React.useState<{
    id: string;
    title: string;
    customerId: string;
    customerName: string;
    eventStartDate?: string | null;
    eventEndDate?: string | null;
    eventDateConfirmed?: boolean;
    draftOrder?: {
      id: string;
      title: string | null;
      linesCount: number;
      estimateVersionId: string | null;
    } | null;
  } | null>(null);
  const [projectCartError, setProjectCartError] = React.useState<string | null>(() => isProjectCart && authRole !== "WOWSTORG" ? "Корзина проекта доступна только со склада (Wowstorg)." : null);
  const [draftLineMetaByItemId, setDraftLineMetaByItemId] = React.useState<
    Record<
      string,
      {
        id?: string;
        plannedDays: number;
        comment: string | null;
        periodGroup: string | null;
      }
    >
  >({});

  const [cartState, dispatchCart] = React.useReducer(cartReducer, cartScope, scope => ({ lines: loadCart(scope), persist: false }));
  const cart = cartState.lines;
  const setCart = React.useCallback((lines: CartLine[]) => dispatchCart({ type: "replace", lines }), []);
  React.useEffect(() => {
    if (cartState.persist) saveCart(cartState.lines, cartScope);
  }, [cartState, cartScope]);
  const [qtyDrafts, setQtyDrafts] = React.useState<Record<string, string>>(() => Object.fromEntries(cart.map(line => [line.itemId, String(line.qty)])));
  const [selectedItemId, setSelectedItemId] = React.useState<string | null>(null);
  const [initialDates] = React.useState(() => isQuickSupplement || isProjectDemoCart ? null : catalogDatesFromStorage());
  const [startDate, setStartDate] = React.useState<string | null>(initialDates?.startDate ?? null);
  const [endDate, setEndDate] = React.useState<string | null>(initialDates?.endDate ?? null);
  const [readyByDate, setReadyByDate] = React.useState<string | null>(initialDates?.readyByDate ?? null);
  const [rentalStartPartOfDay, setRentalStartPartOfDay] = React.useState<RentalPartOfDay>(initialDates?.rentalStartPartOfDay ?? "MORNING");
  const [rentalEndPartOfDay, setRentalEndPartOfDay] = React.useState<RentalPartOfDay>(initialDates?.rentalEndPartOfDay ?? "EVENING");
  if (startDate && startDate === endDate && (rentalStartPartOfDay !== "MORNING" || rentalEndPartOfDay !== "EVENING")) {
    setRentalStartPartOfDay("MORNING"); setRentalEndPartOfDay("EVENING");
  }

  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [customerInput, setCustomerInput] = React.useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = React.useState(false);
  const customerInputRef = React.useRef<HTMLInputElement>(null);
  const [eventName, setEventName] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [deliveryComment, setDeliveryComment] = React.useState("");
  const [deliveryPrice, setDeliveryPrice] = React.useState("");
  const [deliveryInternalCost, setDeliveryInternalCost] = React.useState("");
  const [deliveryInternalPaymentMethod, setDeliveryInternalPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");
  const [montageEnabled, setMontageEnabled] = React.useState(false);
  const [montageComment, setMontageComment] = React.useState("");
  const [montagePrice, setMontagePrice] = React.useState("");
  const [montageInternalCost, setMontageInternalCost] = React.useState("");
  const [montageInternalPaymentMethod, setMontageInternalPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");
  const [demontageEnabled, setDemontageEnabled] = React.useState(false);
  const [demontageComment, setDemontageComment] = React.useState("");
  const [demontagePrice, setDemontagePrice] = React.useState("");
  const [demontageInternalCost, setDemontageInternalCost] = React.useState("");
  const [demontageInternalPaymentMethod, setDemontageInternalPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");
  const [servicesOpen, setServicesOpen] = React.useState(false);
  const [rentalDiscountType, setRentalDiscountType] = React.useState<OrderDiscountType>("NONE");
  const [rentalDiscountPercent, setRentalDiscountPercent] = React.useState<OrderDiscountValue>("");
  const [rentalDiscountAmount, setRentalDiscountAmount] = React.useState<OrderDiscountValue>("");
  const [clientPaymentMethod, setClientPaymentMethod] =
    React.useState<OrderServicePaymentMethod>("NON_CASH");

  const [orderType, setOrderType] = React.useState<"greenwich" | "external">("external");
  const [greenwichUsers, setGreenwichUsers] = React.useState<GreenwichUser[]>([]);
  const [greenwichUserId, setGreenwichUserId] = React.useState("");
  const { data: myBonus } = useJsonResource<MyBonusSnapshot>(authRole === "GREENWICH" ? "/api/greenwich/bonuses" : null, "Не удалось загрузить бонусы");
  const [selectedMonthlyBonusId, setSelectedMonthlyBonusId] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const mounted = useClientReady();

  React.useEffect(() => {
    if (!quickParentId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${quickParentId}/quick-supplement/parent`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as
          | {
              parentId?: string;
              readyByDate?: string;
              startDate?: string;
              endDate?: string;
              rentalStartPartOfDay?: RentalPartOfDay;
              rentalEndPartOfDay?: RentalPartOfDay;
              eventName?: string;
              comment?: string;
            }
          | null;
        if (!res.ok || !data) throw new Error(data ? "Parent fetch failed" : "Parent fetch failed");

        if (cancelled) return;
        setStartDate(data.startDate ?? null);
        setEndDate(data.endDate ?? null);
        setReadyByDate(data.readyByDate ?? null);
        setRentalStartPartOfDay(data.rentalStartPartOfDay ?? "MORNING");
        setRentalEndPartOfDay(data.rentalEndPartOfDay ?? "MORNING");
        setEventName(data.eventName ?? "");
        setComment(data.comment ?? "");

        // При смене родительской заявки сбрасываем локальный блок услуг и цен.
        setDeliveryEnabled(false);
        setMontageEnabled(false);
        setDemontageEnabled(false);
        setDeliveryComment("");
        setMontageComment("");
        setDemontageComment("");
        setDeliveryPrice("");
        setDeliveryInternalCost("");
        setMontagePrice("");
        setMontageInternalCost("");
        setDemontagePrice("");
        setDemontageInternalCost("");

        // Для расчётов итоговой суммы в quick режиме используем Greenwich-коэффициент.
        setOrderType("greenwich");

        // Заказчик в quick режиме берём с родительской заявки.
        setCustomerInput("");
        setCustomerId("");
        setCustomerDropdownOpen(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Не удалось загрузить родительскую заявку");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quickParentId]);

  React.useEffect(() => {
    if (!projectId || quickParentId) {
      return;
    }
    if (authRole !== "WOWSTORG") {
      return;
    }
    let cancelled = false;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then(
        (data: {
          project?: {
            id: string;
            title: string;
            customer: { id: string; name: string };
            eventStartDate?: string | null;
            eventEndDate?: string | null;
            eventDateConfirmed?: boolean;
            draftOrder?: {
              id: string;
              title: string | null;
              linesCount: number;
              estimateVersionId: string | null;
            } | null;
          };
          error?: { message?: string };
        } | null) => {
          if (cancelled) return;
          if (!data?.project) {
            setProjectCartError(data?.error?.message ?? "Проект не найден");
            return;
          }
          const p = data.project;
          if (!isProjectDemoCart && p.eventDateConfirmed && p.eventStartDate && p.eventEndDate) {
            setStartDate(current => current ?? p.eventStartDate ?? null);
            setEndDate(current => current ?? p.eventEndDate ?? null);
            setReadyByDate(current => current ?? p.eventStartDate ?? null);
          }
          setProjectContext({
            id: p.id,
            title: p.title,
            customerId: p.customer.id,
            customerName: p.customer.name,
            eventStartDate: p.eventStartDate ?? null,
            eventEndDate: p.eventEndDate ?? null,
            eventDateConfirmed: p.eventDateConfirmed ?? false,
            draftOrder: p.draftOrder ?? null,
          });
          setCustomerInput(p.customer.name);
          setCustomerId(p.customer.id);
          setOrderType("external");
          setEventName((prev) => (prev.trim() ? prev : p.title));
        },
      )
      .catch(() => {
        if (!cancelled) {
          setProjectContext(null);
          setProjectCartError("Не удалось загрузить проект");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authRole, projectId, quickParentId, isProjectDemoCart]);


  /**
   * Синхронизируем черновик поля ввода с корзиной, но не затираем:
   * - пустую строку (пользователь стирает количество до blur);
   * - промежуточный ввод, пока число в поле совпадает с qty в корзине.
   * Раньше использовалось prev ?? String(qty) — при нажатии «+» qty росло, а черновик оставался старым.
   */
  const [qtySource, setQtySource] = React.useState(cart);
  if (qtySource !== cart) {
    setQtySource(cart);
    setQtyDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const l of cart) {
        const p = prev[l.itemId];
        if (p === "") {
          next[l.itemId] = "";
        } else if (p !== undefined && p !== "") {
          const n = Number.parseInt(p, 10);
          next[l.itemId] = Number.isFinite(n) && n === l.qty ? p : String(l.qty);
        } else {
          next[l.itemId] = String(l.qty);
        }
      }
      return next;
    });
  }

  React.useEffect(() => {
    if (!initialDates) return;
    localStorage.setItem("catalog_readyByDate", initialDates.readyByDate);
    localStorage.setItem("catalog_startDate", initialDates.startDate);
    localStorage.setItem("catalog_endDate", initialDates.endDate);
    localStorage.setItem("catalog_rentalStartPart", initialDates.rentalStartPartOfDay);
    localStorage.setItem("catalog_rentalEndPart", initialDates.rentalEndPartOfDay);
  }, [initialDates]);

  React.useEffect(() => {
    if (isQuickSupplement || isProjectDemoCart) return;
    if (typeof window === "undefined" || !startDate || !endDate) return;
    localStorage.setItem("catalog_rentalStartPart", rentalStartPartOfDay);
    localStorage.setItem("catalog_rentalEndPart", rentalEndPartOfDay);
  }, [rentalStartPartOfDay, rentalEndPartOfDay, startDate, endDate, isProjectDemoCart, isQuickSupplement]);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/customers", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((data: { customers?: Customer[] } | null) => {
        if (!cancelled) setCustomers(data?.customers ?? []);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!customerDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const el = e.target as Node;
      if (
        customerInputRef.current?.contains(el)
      )
        return;
      setCustomerDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [customerDropdownOpen]);

  React.useEffect(() => {
    if (authRole !== "WOWSTORG") return;
    let cancelled = false;
    fetch("/api/users/greenwich", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((data: { users?: GreenwichUser[] } | null) => {
        if (!cancelled) setGreenwichUsers(data?.users ?? []);
      })
      .catch(() => {
        if (!cancelled) setGreenwichUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authRole]);

  const [bonusOwner, setBonusOwner] = React.useState(greenwichUserId);
  if (bonusOwner !== greenwichUserId) { setBonusOwner(greenwichUserId); setSelectedMonthlyBonusId(""); }

  const cartItemIdsKey = React.useMemo(() => cart.map((l) => l.itemId).sort().join(","), [cart]);

  React.useEffect(() => {
    if (!isProjectDemoCart || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/draft-order`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as DraftOrderResponse | null;
        if (!res.ok || !data || cancelled) return;
        const metaByItemId = Object.fromEntries(
          (data.draftOrder?.lines ?? []).map((line) => [
            line.itemId,
            {
              id: line.id,
              plannedDays: Math.max(1, line.plannedDays ?? 1),
              comment: line.comment ?? null,
              periodGroup: line.periodGroup ?? null,
            },
          ]),
        );
        setDraftLineMetaByItemId(metaByItemId);
        const next = (data.draftOrder?.lines ?? []).map((line) => ({
          itemId: line.itemId,
          qty: line.qty,
          pricePerDay: line.pricePerDaySnapshot ?? undefined,
        }));
        const localCart = loadCart(cartScope);
        if (localCart.length === 0 && next.length > 0) {
          saveCart(next, cartScope);
          setCart(next);
        }
        if (data.draftOrder?.estimateVersionId) {
          setEstimateVersionId(data.draftOrder.estimateVersionId);
        }
        setComment(data.draftOrder?.comment ?? "");
        setEventName((prev) => prev.trim() || data.draftOrder?.title?.trim() || "");
      } catch {
        // ignore: empty draft is normal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartScope, isProjectDemoCart, projectId, setCart]);

  const itemParams = new URLSearchParams({ ids: cartItemIdsKey });
  if (!isProjectDemoCart && startDate && endDate) {
    itemParams.set("startDate", startDate); itemParams.set("endDate", endDate);
    itemParams.set("rentalStartPartOfDay", rentalStartPartOfDay); itemParams.set("rentalEndPartOfDay", rentalEndPartOfDay);
  }
  if (quickParentId) itemParams.set("excludeOrderId", quickParentId);
  const itemsUrl = `/api/catalog/items?${itemParams}`;
  const readItems = React.useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(itemsUrl, { cache: "no-store", signal });
    const payload = (await response.json().catch(() => null)) as { items?: CatalogItem[] } | null;
    if (!response.ok) throw new Error("Не удалось загрузить позиции корзины");
    const loaded = payload?.items ?? EMPTY_ITEMS;
    if (!signal?.aborted && loaded.length > 0) {
      // Apply stock caps only from this acknowledged response, never from stale items.
      dispatchCart({ type: "stock", items: loaded, demo: isProjectDemoCart });
    }
    return loaded;
  }, [itemsUrl, isProjectDemoCart]);
  const itemsRead = useReadResource(cartItemIdsKey ? itemsUrl : null, readItems, "Не удалось загрузить позиции корзины");
  const items = itemsRead.data ?? EMPTY_ITEMS;
  const loading = itemsRead.loading;


  function maxQtyForItem(itemId: string): number | null {
    const inv = items.find((i) => i.id === itemId);
    if (!inv) return null;
    if (isProjectDemoCart) {
      return Math.max(0, inv.availability.availableNow);
    }
    const max = inv.availability.availableForDates ?? inv.availability.availableNow;
    return Math.max(0, max);
  }

  const setQty = React.useCallback((itemId: string, qty: number) => {
    const item = items.find(entry => entry.id === itemId);
    const cap = !item ? null : Math.max(0, isProjectDemoCart ? item.availability.availableNow : item.availability.availableForDates ?? item.availability.availableNow);
    const clamped =
      cap === null ? Math.max(0, qty) : cap <= 0 ? 0 : Math.max(0, Math.min(qty, cap));
    const next = cart
      .map((l) => (l.itemId === itemId ? { ...l, qty: clamped } : l))
      .filter((l) => l.qty > 0);
    if (!next.some((l) => l.itemId === itemId) && clamped > 0) {
      next.push({ itemId, qty: clamped });
    }
    setCart(next);
    saveCart(next, cartScope);
  }, [items, isProjectDemoCart, cart, cartScope, setCart]);


  function remove(itemId: string) {
    setCart(cart.filter((l) => l.itemId !== itemId));
    saveCart(cart.filter((l) => l.itemId !== itemId), cartScope);
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function commitQtyDraft(itemId: string) {
    const raw = qtyDrafts[itemId] ?? "";
    if (raw.trim() === "") {
      setQty(itemId, 0);
      setQtyDrafts((prev) => ({ ...prev, [itemId]: "" }));
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setQty(itemId, 0);
      setQtyDrafts((prev) => ({ ...prev, [itemId]: "" }));
      return;
    }
    setQty(itemId, parsed);
  }

  const isGreenwich = authRole === "GREENWICH";
  const isWarehouse = authRole === "WOWSTORG";

  const customerInputTrim = customerInput.trim();
  const matchedCustomer =
    customerInputTrim &&
    customers.find((c) => c.name.localeCompare(customerInputTrim, undefined, { sensitivity: "accent" }) === 0);
  const canSubmitCustomer = isQuickSupplement
    ? true
    : isProjectCart
      ? Boolean(projectContext?.customerId && !projectCartError)
      : Boolean(customerInputTrim);
  const customerFiltered =
    !customerInputTrim
      ? customers
      : customers.filter((c) =>
          c.name.toLowerCase().includes(customerInputTrim.toLowerCase())
        );

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const lines = cart
    .map((l) => ({ line: l, item: itemMap.get(l.itemId) }))
    .filter((x): x is { line: CartLine; item: CatalogItem } => x.item != null);

  // У склада при выборе «выдача Greenwich» корзина считается со скидкой; для 3-х лиц — полная цена.
  // Greenwich получает из каталога уже цены со скидкой, поэтому multiplier для них не применяем.
  const selectedGreenwichUser = greenwichUsers.find((user) => user.id === greenwichUserId);
  const activeCheckoutBonuses = isGreenwich
    ? myBonus?.activeBonuses ?? []
    : isWarehouse && orderType === "greenwich"
      ? selectedGreenwichUser?.activeBonuses ?? []
      : [];
  const selectedMonthlyBonus = activeCheckoutBonuses.find((bonus) => bonus.id === selectedMonthlyBonusId) ?? null;
  const activeTierDiscount = isGreenwich
    ? myBonus?.rating.tierDiscountPercent ?? 0
    : selectedGreenwichUser?.discountPercent ?? 0;
  const canApplyMonthlyBonus =
    !isQuickSupplement && !isProjectCart && activeCheckoutBonuses.length > 0 &&
    (isGreenwich || (isWarehouse && orderType === "greenwich" && selectedGreenwichUser));
  const canUseManualOrderDiscount = isWarehouse && orderType === "external" && !isQuickSupplement;
  const displayMultiplier =
    isWarehouse && orderType === "greenwich" ? (selectedGreenwichUser?.payMultiplier ?? 1) : 1;
  const getDisplayPrice = (item: CatalogItem) => {
    const catalogPrice = Number(item.pricePerDay) || 0;
    if (isGreenwich) {
      if (!selectedMonthlyBonus || !canApplyMonthlyBonus) return catalogPrice;
      const basePrice = Number(item.basePricePerDay ?? catalogPrice) || 0;
      const currentDiscount = item.loyalty?.discountPercent ?? activeTierDiscount;
      const finalDiscount = Math.max(
        currentDiscount,
        Math.min(100, activeTierDiscount + selectedMonthlyBonus.discountPercent),
      );
      return basePrice * (1 - finalDiscount / 100);
    }
    if (!isWarehouse || orderType !== "greenwich" || !selectedGreenwichUser) return catalogPrice;
    const personalDiscount = selectedGreenwichUser.activeOffers
      .filter((offer) => offer.itemIds.includes(item.id))
      .reduce((maximum, offer) => Math.max(maximum, offer.discountPercent), 0);
    const ratingDiscount = selectedMonthlyBonus && canApplyMonthlyBonus
      ? Math.min(100, selectedGreenwichUser.discountPercent + selectedMonthlyBonus.discountPercent)
      : selectedGreenwichUser.discountPercent;
    const bestDiscount = Math.max(personalDiscount, ratingDiscount);
    return catalogPrice * (1 - bestDiscount / 100);
  };

  const totalPerDay = lines.reduce((sum, { line, item }) => {
    const price = getDisplayPrice(item);
    return sum + price * line.qty;
  }, 0);
  const rentalDays =
    !isProjectDemoCart && startDate && endDate
      ? billableRentalDaysFromDateOnly({
          startDate,
          endDate,
          rentalStartPartOfDay,
          rentalEndPartOfDay,
        })
      : isProjectDemoCart
        ? 1
        : 0;
  const totalForPeriod = totalPerDay * (rentalDays || 1);
  const requestedRentalDiscount =
    rentalDiscountType === "PERCENT"
      ? totalForPeriod * (Number(rentalDiscountPercent || 0) / 100)
      : rentalDiscountType === "AMOUNT"
        ? Number(rentalDiscountAmount || 0)
        : 0;
  const rentalDiscountValue = canUseManualOrderDiscount
    ? Math.min(totalForPeriod, Math.max(0, Number.isFinite(requestedRentalDiscount) ? requestedRentalDiscount : 0))
    : 0;
  const totalForPeriodAfterDiscount = Math.max(0, totalForPeriod - rentalDiscountValue);

  const deliveryPriceNum =
    deliveryEnabled && deliveryPrice.trim()
      ? Number(deliveryPrice.replace(",", ".")) || 0
      : 0;
  const montagePriceNum =
    montageEnabled && montagePrice.trim()
      ? Number(montagePrice.replace(",", ".")) || 0
      : 0;
  const demontagePriceNum =
    demontageEnabled && demontagePrice.trim()
      ? Number(demontagePrice.replace(",", ".")) || 0
      : 0;
  const totalWithServices =
    totalForPeriodAfterDiscount + deliveryPriceNum + montagePriceNum + demontagePriceNum;
  const activeServicesCount = [deliveryEnabled, montageEnabled, demontageEnabled].filter(Boolean).length;
  const clientTaxRate = isWarehouse && clientPaymentMethod === "CASH" ? 0 : ORDER_TAX_RATE;
  const taxAmount = Math.round(totalWithServices * clientTaxRate);
  const totalWithTax = Math.round(totalWithServices + taxAmount);
  const checkoutReadyByDate =
    readyByDate ?? (isWarehouse && startDate
      ? (() => {
          const warehouseReadyByDate = addDays(startDate, -1);
          const min = todayDateOnly();
          return warehouseReadyByDate >= min ? warehouseReadyByDate : min;
        })()
      : null);

  const canCheckoutGreenwich =
    isGreenwich && cart.length > 0 && canSubmitCustomer;
  const canCheckoutWarehouse =
    isWarehouse &&
    cart.length > 0 &&
    canSubmitCustomer &&
    (isProjectCart || orderType !== "greenwich" || Boolean(greenwichUserId));
  const canCheckout = isProjectDemoCart
    ? cart.length > 0 && Boolean(projectContext)
    : isQuickSupplement
      ? cart.length > 0 && Boolean(startDate && endDate && readyByDate)
      : (canCheckoutGreenwich || canCheckoutWarehouse) && Boolean(startDate && endDate && checkoutReadyByDate);

  async function submit() {
    if (isProjectDemoCart && projectContext) {
      setError(null);
      setSubmitting(true);
      try {
        const res = await fetch(`/api/projects/${projectContext.id}/draft-order`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            estimateVersionId: estimateVersionId ?? undefined,
            title: eventName.trim() || projectContext.title,
            comment: comment.trim() || null,
            lines: cart.map((l, index) => {
              const item = itemMap.get(l.itemId);
              const meta = draftLineMetaByItemId[l.itemId];
              return {
                ...(meta?.id ? { id: meta.id } : {}),
                itemId: l.itemId,
                itemName: item?.name ?? l.itemId,
                qty: l.qty,
                plannedDays: Math.max(1, meta?.plannedDays ?? 1),
                comment: meta?.comment ?? null,
                periodGroup: meta?.periodGroup ?? null,
                pricePerDaySnapshot:
                  l.pricePerDay ?? (item ? Number(item.pricePerDay) : null),
                sortOrder: index,
              };
            }),
          }),
        });
        const data = (await res.json().catch(() => null)) as DraftOrderResponse | null;
        if (!res.ok) {
          setError(data?.error?.message ?? "Не удалось сохранить demo-черновик");
          return;
        }
        router.replace(`/projects/${projectContext.id}`);
        return;
      } catch (e) {
        console.error("project demo save failed", e);
        setError(e instanceof Error ? e.message : "Не удалось сохранить demo-черновик");
        return;
      } finally {
        setSubmitting(false);
      }
    }
    if (!startDate || !endDate || !checkoutReadyByDate) return;
    if (isProjectCart && !projectContext) {
      setError("Не загружены данные проекта");
      return;
    }
    if (!isQuickSupplement && !isProjectCart && !customerInputTrim) return;
    if (canUseManualOrderDiscount) {
      const discountError = getOrderDiscountError({
        type: rentalDiscountType,
        percent: rentalDiscountPercent,
        amount: rentalDiscountAmount,
        rentalSubtotal: totalForPeriod,
      });
      if (discountError) {
        setError(discountError);
        return;
      }
    }
    const match = customers.find((c) => c.name.localeCompare(customerInputTrim, undefined, { sensitivity: "accent" }) === 0);
    setError(null);
    setSubmitting(true);
    try {
      if (isQuickSupplement && quickParentId) {
        const endpoint =
          state.status === "authenticated" && state.user.role === "WOWSTORG"
            ? `/api/orders/${quickParentId}/quick-supplement/warehouse`
            : `/api/orders/${quickParentId}/quick-supplement/greenwich`;

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty })),
            deliveryEnabled,
            deliveryComment: deliveryEnabled ? deliveryComment.trim() || undefined : undefined,
            montageEnabled,
            montageComment: montageEnabled ? montageComment.trim() || undefined : undefined,
            demontageEnabled,
            demontageComment: demontageEnabled ? demontageComment.trim() || undefined : undefined,
            ...(isWarehouse
              ? {
                  deliveryPrice:
                    deliveryEnabled && deliveryPrice.trim()
                      ? Number(deliveryPrice.replace(",", "."))
                      : undefined,
                  deliveryInternalCost:
                    deliveryEnabled && deliveryInternalCost.trim()
                      ? Number(deliveryInternalCost.replace(",", "."))
                      : deliveryEnabled
                        ? null
                        : undefined,
                  deliveryInternalPaymentMethod: deliveryEnabled
                    ? deliveryInternalPaymentMethod
                    : undefined,
                  montagePrice:
                    montageEnabled && montagePrice.trim()
                      ? Number(montagePrice.replace(",", "."))
                      : undefined,
                  montageInternalCost:
                    montageEnabled && montageInternalCost.trim()
                      ? Number(montageInternalCost.replace(",", "."))
                      : montageEnabled
                        ? null
                        : undefined,
                  montageInternalPaymentMethod: montageEnabled
                    ? montageInternalPaymentMethod
                    : undefined,
                  demontagePrice:
                    demontageEnabled && demontagePrice.trim()
                      ? Number(demontagePrice.replace(",", "."))
                      : undefined,
                  demontageInternalCost:
                    demontageEnabled && demontageInternalCost.trim()
                      ? Number(demontageInternalCost.replace(",", "."))
                      : demontageEnabled
                        ? null
                        : undefined,
                  demontageInternalPaymentMethod: demontageEnabled
                    ? demontageInternalPaymentMethod
                    : undefined,
                }
              : {}),
          }),
        });

        const data = (await res.json().catch(() => null)) as
          | { orderId?: string; error?: { message?: string } }
          | null;
        if (!res.ok) {
          setError(data?.error?.message ?? "Не удалось создать быструю доп.-выдачу");
          return;
        }

        clearCart(cartScope);
        setCart([]);
        router.replace(`/orders/${data?.orderId ?? ""}`);
        return;
      }

      const payload: Record<string, unknown> = isProjectCart && projectContext
        ? {
            customerId: projectContext.customerId,
            projectId: projectContext.id,
            targetEstimateVersionId: estimateVersionId ?? undefined,
            readyByDate: checkoutReadyByDate,
            startDate,
            endDate,
            rentalStartPartOfDay,
            rentalEndPartOfDay,
            eventName: eventName.trim() || undefined,
            comment: comment.trim() || undefined,
            deliveryEnabled,
            deliveryComment: deliveryEnabled ? deliveryComment.trim() || undefined : undefined,
            montageEnabled,
            montageComment: montageEnabled ? montageComment.trim() || undefined : undefined,
            demontageEnabled,
            demontageComment: demontageEnabled ? demontageComment.trim() || undefined : undefined,
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty })),
          }
        : {
            ...(match ? { customerId: match.id } : { customerName: customerInputTrim }),
            readyByDate: checkoutReadyByDate,
            startDate,
            endDate,
            rentalStartPartOfDay,
            rentalEndPartOfDay,
            eventName: eventName.trim() || undefined,
            comment: comment.trim() || undefined,
            deliveryEnabled,
            deliveryComment: deliveryEnabled ? deliveryComment.trim() || undefined : undefined,
            montageEnabled,
            montageComment: montageEnabled ? montageComment.trim() || undefined : undefined,
            demontageEnabled,
            demontageComment: demontageEnabled ? demontageComment.trim() || undefined : undefined,
            lines: cart.map((l) => ({ itemId: l.itemId, qty: l.qty })),
          };
      if (isWarehouse && !isProjectCart) {
        const dp = deliveryPrice.trim() ? Number(deliveryPrice.replace(",", ".")) : undefined;
        const mp = montagePrice.trim() ? Number(montagePrice.replace(",", ".")) : undefined;
        const dmp = demontagePrice.trim() ? Number(demontagePrice.replace(",", ".")) : undefined;
        if (dp != null && !Number.isNaN(dp)) payload.deliveryPrice = dp;
        if (mp != null && !Number.isNaN(mp)) payload.montagePrice = mp;
        if (dmp != null && !Number.isNaN(dmp)) payload.demontagePrice = dmp;
        const di = deliveryInternalCost.trim() ? Number(deliveryInternalCost.replace(",", ".")) : undefined;
        const mi = montageInternalCost.trim() ? Number(montageInternalCost.replace(",", ".")) : undefined;
        const dmi = demontageInternalCost.trim() ? Number(demontageInternalCost.replace(",", ".")) : undefined;
        if (di != null && !Number.isNaN(di)) payload.deliveryInternalCost = di;
        if (deliveryEnabled) payload.deliveryInternalPaymentMethod = deliveryInternalPaymentMethod;
        if (mi != null && !Number.isNaN(mi)) payload.montageInternalCost = mi;
        if (montageEnabled) payload.montageInternalPaymentMethod = montageInternalPaymentMethod;
        if (dmi != null && !Number.isNaN(dmi)) payload.demontageInternalCost = dmi;
        if (demontageEnabled) payload.demontageInternalPaymentMethod = demontageInternalPaymentMethod;
        payload.source = orderType === "greenwich" ? "GREENWICH_INTERNAL" : "WOWSTORG_EXTERNAL";
        if (orderType === "greenwich" && greenwichUserId)
          payload.greenwichUserId = greenwichUserId;
      }
      if (isWarehouse && isProjectCart) {
        const dp = deliveryPrice.trim() ? Number(deliveryPrice.replace(",", ".")) : undefined;
        const mp = montagePrice.trim() ? Number(montagePrice.replace(",", ".")) : undefined;
        const dmp = demontagePrice.trim() ? Number(demontagePrice.replace(",", ".")) : undefined;
        if (dp != null && !Number.isNaN(dp)) payload.deliveryPrice = dp;
        if (mp != null && !Number.isNaN(mp)) payload.montagePrice = mp;
        if (dmp != null && !Number.isNaN(dmp)) payload.demontagePrice = dmp;
        const di = deliveryInternalCost.trim() ? Number(deliveryInternalCost.replace(",", ".")) : undefined;
        const mi = montageInternalCost.trim() ? Number(montageInternalCost.replace(",", ".")) : undefined;
        const dmi = demontageInternalCost.trim() ? Number(demontageInternalCost.replace(",", ".")) : undefined;
        if (di != null && !Number.isNaN(di)) payload.deliveryInternalCost = di;
        if (deliveryEnabled) payload.deliveryInternalPaymentMethod = deliveryInternalPaymentMethod;
        if (mi != null && !Number.isNaN(mi)) payload.montageInternalCost = mi;
        if (montageEnabled) payload.montageInternalPaymentMethod = montageInternalPaymentMethod;
        if (dmi != null && !Number.isNaN(dmi)) payload.demontageInternalCost = dmi;
        if (demontageEnabled) payload.demontageInternalPaymentMethod = demontageInternalPaymentMethod;
      }
      if (isWarehouse) {
        payload.clientPaymentMethod = clientPaymentMethod;
        payload.rentalDiscountType = canUseManualOrderDiscount ? rentalDiscountType : "NONE";
        payload.rentalDiscountPercent =
          canUseManualOrderDiscount && rentalDiscountType === "PERCENT" && rentalDiscountPercent !== ""
            ? Number(rentalDiscountPercent)
            : null;
        payload.rentalDiscountAmount =
          canUseManualOrderDiscount && rentalDiscountType === "AMOUNT" && rentalDiscountAmount !== ""
            ? Number(rentalDiscountAmount)
            : null;
      }
      if (selectedMonthlyBonus && canApplyMonthlyBonus) {
        payload.greenwichMonthlyBonusId = selectedMonthlyBonus.id;
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            orderId?: string;
            notification?: { queued?: boolean; sent?: boolean; message?: string };
            error?: { message?: string };
          }
        | null;
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось создать заявку");
        return;
      }
      const n = data?.notification;
      if (n && !n.queued && "sent" in n && n.sent === false && n.message) {
        alert(`Заявка создана.\n\n⚠️ ${n.message}`);
      }
      clearCart(cartScope);
      setCart([]);
      const createdOrderId = data?.orderId ?? "";
      router.replace(
        isProjectCart && projectId
          ? `/orders/${createdOrderId}?from=project&returnTo=${encodeURIComponent(returnTo ?? `/projects/${projectId}`)}`
          : `/orders/${createdOrderId}`,
      );
    } catch (e) {
      console.error("cart submit failed", e);
      setError(e instanceof Error ? e.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Корзина" backHref={isProjectCart && projectId ? (returnTo ?? `/projects/${projectId}`) : undefined}>
      <section className="cart-section">
        <div className="cart-head">
          <div className="cart-eyebrow">Оформление в одном окне</div>
          <h1 className="cart-title">Ваша подборка</h1>
          <p className="cart-subtitle">
            Проверьте реквизит, добавьте детали и отправьте заявку — без переходов между лишними страницами.
          </p>
          <nav className="cart-flowSteps" aria-label="Этапы оформления">
            <a href="#cart-composition" className="cart-flowStep is-complete">
              <span>01</span><strong>Состав</strong><small>{lines.length > 0 ? `${lines.length} поз.` : "Выбор"}</small>
            </a>
            <a href="#checkout-details" className="cart-flowStep">
              <span>02</span><strong>Детали</strong><small>Заказчик и услуги</small>
            </a>
            <span className={["cart-flowStep", canCheckout ? "is-ready" : ""].join(" ")}>
              <span>03</span><strong>Отправка</strong><small>{canCheckout ? "Всё готово" : "После заполнения"}</small>
            </span>
          </nav>
        </div>

        {loading ? (
          <ListSkeleton rows={4} />
        ) : lines.length === 0 ? (
          <div className="cart-empty">
            <p className="cart-muted">Корзина пуста.</p>
          </div>
        ) : (
          <>
            <section id="cart-composition" className="cart-flowPanel" aria-labelledby="cart-composition-title">
              <div className="cart-flowPanelHead">
                <div>
                  <span>Шаг 1</span>
                  <h2 id="cart-composition-title">Состав подборки</h2>
                </div>
                <strong>{lines.length} поз.</strong>
              </div>
            <div className="cart-list-head">
              <button
                type="button"
                className="cart-clearAll"
                onClick={() => {
                  clearCart(cartScope);
                  setCart([]);
                }}
                aria-label="Очистить корзину"
              >
                Удалить все
              </button>
            </div>
            <ul className="cart-list">
              {lines.map(({ line, item }) => {
                const price = getDisplayPrice(item);
                const lineTotalPerDay = price * line.qty;
                const lineTotalForPeriod = lineTotalPerDay * (rentalDays || 0);
                const maxAvail = item.availability.availableForDates ?? item.availability.availableNow;
                const canInc = maxAvail > 0 && line.qty < maxAvail;
                return (
                  <li key={item.id} className="cart-row">
                    <button
                      type="button"
                      className="cart-row-main cart-rowProduct"
                      onClick={() => setSelectedItemId(item.id)}
                      aria-label={`Открыть карточку: ${item.name}`}
                    >
                      <div className="cart-thumbWrap" aria-hidden="true">
                        {item.photo1Key ? (
                          <img
                            src={`/api/inventory/positions/${item.id}/photo?w=120`}
                            alt=""
                            className="cart-thumb"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="cart-thumbPlaceholder">
                            <span>WOW</span>
                          </div>
                        )}
                      </div>
                      <div className="cart-rowText">
                        <span className="cart-name">{item.name}</span>
                        <span className="cart-meta">
                          <strong>{price.toFixed(0)}</strong>{" "}
                          <span className="cart-unit">р/сут</span> × {line.qty}
                          {rentalDays > 0 ? (
                            <>
                              {" "}× {rentalDays} дн. ={" "}
                              <strong>{lineTotalForPeriod.toFixed(0)}</strong>{" "}
                              <span className="cart-unit">р</span>
                            </>
                          ) : (
                            <>
                              {" "}={" "}
                              <strong>{lineTotalPerDay.toFixed(0)}</strong>{" "}
                              <span className="cart-unit">р/сут</span>
                            </>
                          )}
                        </span>
                      </div>
                    </button>
                    <div className="cart-row-actions">
                      <div className="cart-qty" aria-label="Количество">
                        <button
                          type="button"
                          onClick={() => setQty(item.id, line.qty - 1)}
                          aria-label="Уменьшить"
                        >
                          −
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={qtyDrafts[item.id] ?? String(line.qty)}
                          onChange={(e) => {
                            let next = e.target.value.replace(/\D+/g, "");
                            if (next !== "" && maxAvail > 0) {
                              const n = Number.parseInt(next, 10);
                              if (Number.isFinite(n) && n > maxAvail) next = String(maxAvail);
                            }
                            setQtyDrafts((prev) => ({ ...prev, [item.id]: next }));
                          }}
                          onBlur={() => commitQtyDraft(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              commitQtyDraft(item.id);
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          aria-label="Количество"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(item.id, line.qty + 1)}
                          aria-label="Увеличить"
                          disabled={!canInc}
                          title={!canInc ? "Достигнут максимум по складу на выбранные даты" : undefined}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="cart-remove"
                        onClick={() => remove(item.id)}
                        aria-label="Удалить"
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <CartRelatedSuggestions
              cartScope={cartScope}
              itemIds={cart.map((l) => l.itemId)}
              qtys={cart.map((l) => l.qty)}
              startDate={startDate}
              endDate={endDate}
              rentalStartPartOfDay={rentalStartPartOfDay}
              rentalEndPartOfDay={rentalEndPartOfDay}
              excludeOrderId={quickParentId}
              disabled={isProjectDemoCart}
              displayMultiplier={displayMultiplier}
              onAdd={(itemId, qty, _pricePerDay, maxAvail) => {
                const existing = cart.find((l) => l.itemId === itemId);
                const cap = maxQtyForItem(itemId);
                const max = cap !== null && cap > 0 ? cap : maxAvail;
                const nextQty =
                  max <= 0 ? 0 : Math.min((existing?.qty ?? 0) + qty, max);
                setQty(itemId, nextQty);
              }}
            />

            {(isGreenwich || isWarehouse) ? (
              <a className="cart-continueBtn" href="#checkout-details">
                Продолжить оформление <span aria-hidden="true">↓</span>
              </a>
            ) : null}
            </section>

            {(isGreenwich || isWarehouse) ? (
              <section id="checkout-details" className="cart-flowPanel cart-flowPanel--checkout" aria-labelledby="checkout-details-title">
                <div className="co-head">
                  <div className="cart-flowPanelHead cart-flowPanelHead--checkout">
                    <div className="cart-checkoutHeading">
                      <div className="cart-checkoutKicker">
                        <span>Оформление заявки</span>
                        <span aria-label="Шаг 2 из 2">02 / 02</span>
                      </div>
                      <h2 id="checkout-details-title" className="co-title">Детали заявки</h2>
                    </div>
                  </div>
                  <p className="co-subtitle">
                    {isQuickSupplement
                      ? "Быстрая доп.-выдача: используем даты и заказчика из родительской заявки, при необходимости можно добавить доп. услуги."
                      : isProjectDemoCart
                        ? "Demo-черновик проекта: сохраняет корзину без дат и без создания реальной заявки."
                      : isProjectCart
                        ? "Заявка реквизита в рамках проекта: полная цена, заказчик из карточки проекта."
                        : isWarehouse
                          ? "Даты выбраны в каталоге. Укажи, на кого заявка, заказчика и доп. услуги."
                          : "Даты выбраны в каталоге. Заполни заказчика и при необходимости доп. услуги."}
                  </p>
                </div>

                <div className="cart-checkoutLayout">
                  <div className="cart-checkoutMain">

                {checkoutReadyByDate && startDate && endDate && !isProjectDemoCart ? (
                  <div className="co-dates cart-dateContext">
                    <div className="cart-dateContextHead">
                      <span>Даты заявки</span>
                      <small>Выбраны в каталоге</small>
                    </div>
                    <div className="cart-dateContextGrid">
                      <div className="cart-dateCell">
                        <span className="cart-dateCellLabel">Готовность</span>
                        <strong>{formatDateRu(checkoutReadyByDate)}</strong>
                      </div>
                      <div className="cart-dateCell cart-dateCell--period">
                        <span className="cart-dateCellLabel">Период аренды</span>
                        <span className="cart-dateRange">
                          <strong>{formatDateRu(startDate)}</strong>
                          <span aria-hidden="true">→</span>
                          <strong>{formatDateRu(endDate)}</strong>
                        </span>
                      </div>
                      {!isQuickSupplement ? (
                        <Link
                          href={
                            isProjectCart && projectId
                              ? `/catalog?projectId=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(returnTo ?? `/projects/${projectId}`)}`
                              : "/catalog"
                          }
                          className="co-link cart-dateEdit"
                        >
                          <span>Изменить</span>
                          <span aria-hidden="true">↗</span>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {isProjectDemoCart ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
                    <div className="font-semibold">Demo-заявка без дат</div>
                    <div className="mt-1 text-red-900/80">
                      Эта корзина не создаёт реальную складскую заявку и не резервирует остатки, пока ты не перейдёшь в
                      режим с датами из карточки проекта.
                    </div>
                  </div>
                ) : null}

                {isProjectCart && projectCartError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    {projectCartError}
                  </div>
                ) : null}

                {isProjectCart && projectContext ? (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-sm text-zinc-800">
                    <span className="font-semibold text-violet-900">Проект: </span>
                    {projectContext.title}
                    <div className="mt-1 text-zinc-600">
                      Заказчик: <strong>{projectContext.customerName}</strong>
                    </div>
                  </div>
                ) : null}

                {!isQuickSupplement && isWarehouse && !isProjectCart ? (
                  <div className="co-field cart-orderTypeField" style={{ marginBottom: "1rem" }}>
                    <div className="co-label">Тип заявки</div>
                    <div className="co-flipSwitchContainer">
                      <div className="co-flipSwitch" role="radiogroup" aria-label="Тип заявки">
                        <input
                          type="radio"
                          id="co-orderType-greenwich"
                          name="co-orderType"
                          checked={orderType === "greenwich"}
                          onChange={() => setOrderType("greenwich")}
                        />
                        <input
                          type="radio"
                          id="co-orderType-external"
                          name="co-orderType"
                          checked={orderType === "external"}
                          onChange={() => setOrderType("external")}
                        />

                        <label htmlFor="co-orderType-greenwich" className="co-switchButton">
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
                          </svg>
                          <span>Grinvich</span>
                          <span className="co-switchSub">на сотрудника</span>
                        </label>

                        <label htmlFor="co-orderType-external" className="co-switchButton">
                          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z"></path>
                          </svg>
                          <span>3-и лица</span>
                          <span className="co-switchSub">сторонний заказчик</span>
                        </label>

                        <div className="co-switchCard" aria-hidden="true">
                          <div className="co-cardFace co-cardFront" />
                          <div className="co-cardFace co-cardBack" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeCheckoutBonuses.length > 0 && !isProjectCart ? (
                  <div className="cart-bonusChoice cart-bonusChoice--list" data-selected={selectedMonthlyBonus ? "true" : undefined}>
                    <div className="cart-bonusChoice__copy">
                      <span>Бонусы лидера · {activeCheckoutBonuses.length}</span>
                      <strong>{isQuickSupplement ? "Сохраним для новой заявки" : "Выберите один бонус для этой заявки"}</strong>
                      <small>{isQuickSupplement ? "Допвыдача продолжает родительскую заявку и не расходует персональный бонус." : "Бонус не включён по умолчанию. Персональная цена останется, если она выгоднее."}</small>
                    </div>
                    {isQuickSupplement ? (
                      <Link href="/bonuses">Подробнее</Link>
                    ) : (
                      <div className="cart-bonusOptions" role="radiogroup" aria-label="Месячный бонус">
                        {activeCheckoutBonuses.map((bonus) => {
                          const selected = selectedMonthlyBonusId === bonus.id;
                          return (
                            <button
                              key={bonus.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={selected ? "is-selected" : ""}
                              onClick={() => setSelectedMonthlyBonusId(selected ? "" : bonus.id)}
                            >
                              <strong>+{bonus.discountPercent}%</strong>
                              <span>{bonus.code}</span>
                              <small>Итого уровня до {Math.min(100, activeTierDiscount + bonus.discountPercent)}%</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="cart-formSectionTitle">
                  <span>О заявке</span>
                  <small>Заполни поля по порядку — без лишних переходов</small>
                </div>
                <div className="co-grid cart-detailsGrid">
                  {!isQuickSupplement && isWarehouse && !isProjectCart && orderType === "greenwich" ? (
                    <label className="co-field co-field--customer">
                      <div className="co-label">Сотрудник Grinvich *</div>
                      <select
                        value={greenwichUserId}
                        onChange={(e) => setGreenwichUserId(e.target.value)}
                        className="co-input"
                      >
                        <option value="">Выберите сотрудника</option>
                        {greenwichUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} · {u.ratingScore} б. · скидка {u.discountPercent}%{u.activeBonuses.length ? ` · бонусов ${u.activeBonuses.length}` : ""}
                          </option>
                        ))}
                      </select>
                      {greenwichUsers.length === 0 ? (
                        <div className="co-help">Нет активных сотрудников Grinvich.</div>
                      ) : selectedGreenwichUser ? (
                        <div className="co-help">
                          Уровень «{selectedGreenwichUser.tierName}»: цены каталога снижены на {selectedGreenwichUser.discountPercent}%.
                          {selectedGreenwichUser.activeBonuses.length ? " Бонус лидера можно выбрать отдельно." : ""}
                        </div>
                      ) : null}
                    </label>
                  ) : null}
                  {!isQuickSupplement ? (
                    <>
                      <div className="co-field co-field--customer">
                        <div className="co-label">Заказчик *</div>
                        <div className="co-combobox" ref={customerInputRef}>
                          <input
                            type="text"
                            value={customerInput}
                            readOnly={isProjectCart}
                            onChange={(e) => {
                              if (isProjectCart) return;
                              const v = e.target.value;
                              setCustomerInput(v);
                              const t = v.trim();
                              const match =
                                t &&
                                customers.find(
                                  (c) =>
                                    c.name.localeCompare(t, undefined, { sensitivity: "accent" }) === 0,
                                );
                              setCustomerId(match ? match.id : "");
                              setCustomerDropdownOpen(true);
                            }}
                            onFocus={() => {
                              if (!isProjectCart) setCustomerDropdownOpen(true);
                            }}
                            onBlur={() => {
                              setTimeout(() => setCustomerDropdownOpen(false), 180);
                            }}
                            className="co-input"
                            placeholder="Выберите из списка или введите название заказчика"
                            autoComplete="off"
                            aria-expanded={customerDropdownOpen}
                            aria-haspopup="listbox"
                            aria-autocomplete="list"
                          />
                          {customerDropdownOpen ? (
                            <div className="co-combobox-dropdown" role="listbox">
                              {customerFiltered.length === 0 ? (
                                <div className="co-combobox-empty">
                                  {customerInputTrim
                                    ? "Нет совпадений — будет создан новый заказчик"
                                    : "Нет заказчиков в списке"}
                                </div>
                              ) : (
                                customerFiltered.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    role="option"
                                    className="co-combobox-option"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setCustomerInput(c.name);
                                      setCustomerId(c.id);
                                      setCustomerDropdownOpen(false);
                                    }}
                                  >
                                    {c.name}
                                  </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>
                        {isProjectCart ? (
                          <div className="co-combobox-hint">Фиксировано из проекта.</div>
                        ) : customerInputTrim && !matchedCustomer ? (
                          <div className="co-combobox-hint">
                            Будет создан новый заказчик «{customerInputTrim}»
                          </div>
                        ) : null}
                      </div>

                      <label className="co-field co-field--event">
                        <div className="co-label">Название мероприятия или проекта</div>
                        <input
                          value={eventName}
                          onChange={(e) => setEventName(e.target.value)}
                          className="co-input"
                          placeholder="Например, летний корпоратив"
                        />
                      </label>
                    </>
                  ) : null}

                {!isQuickSupplement ? (
                  <label className="co-field co-field--comment">
                    <div className="co-label">Что ещё важно учесть?</div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="co-textarea"
                      placeholder="Площадка, задача или важные детали — необязательно"
                    />
                  </label>
                ) : null}

                {!isProjectDemoCart ? (
                  <details
                    className="co-services co-servicesDisclosure co-services--checkout"
                    open={servicesOpen}
                    onToggle={(event) => setServicesOpen(event.currentTarget.open)}
                  >
                  <summary className="co-servicesSummary">
                    <span>
                      <strong>Дополнительные услуги</strong>
                      <small>Доставка, монтаж и демонтаж — только если нужны</small>
                    </span>
                    <span>{activeServicesCount > 0 ? `${activeServicesCount} выбрано` : "Добавить"}</span>
                  </summary>
                  <div className="co-servicesBody">
                  <div className="co-serviceRow">
                    <Toggle checked={deliveryEnabled} onChange={setDeliveryEnabled} label="Доставка" />
                    {deliveryEnabled ? (
                      <>
                        {isGreenwich ? (
                          <textarea
                            value={deliveryComment}
                            onChange={(e) => setDeliveryComment(e.target.value)}
                            className="co-textarea co-textarea--compact"
                            placeholder="Комментарий к доставке…"
                          />
                        ) : (
                          <div className="co-priceRowGroup">
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Стоимость, р</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={deliveryPrice}
                                onChange={(e) => setDeliveryPrice(e.target.value)}
                                className="co-input co-input--price"
                                placeholder="0"
                              />
                            </label>
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Внутр., р</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={deliveryInternalCost}
                                onChange={(e) => setDeliveryInternalCost(e.target.value)}
                                className="co-input co-input--price"
                                placeholder="необяз."
                              />
                            </label>
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Оплата</span>
                              <select
                                value={deliveryInternalPaymentMethod}
                                onChange={(e) => setDeliveryInternalPaymentMethod(e.target.value as OrderServicePaymentMethod)}
                                className="co-input co-input--price"
                              >
                                <option value="NON_CASH">Безнал</option>
                                <option value="CASH">Наличка</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                  <div className="co-serviceRow">
                    <Toggle checked={montageEnabled} onChange={setMontageEnabled} label="Монтаж" />
                    {montageEnabled ? (
                      <>
                        {isGreenwich ? (
                          <textarea
                            value={montageComment}
                            onChange={(e) => setMontageComment(e.target.value)}
                            className="co-textarea co-textarea--compact"
                            placeholder="Комментарий к монтажу…"
                          />
                        ) : (
                          <div className="co-priceRowGroup">
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Стоимость, р</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={montagePrice}
                                onChange={(e) => setMontagePrice(e.target.value)}
                                className="co-input co-input--price"
                                placeholder="0"
                              />
                            </label>
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Внутр., р</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={montageInternalCost}
                                onChange={(e) => setMontageInternalCost(e.target.value)}
                                className="co-input co-input--price"
                                placeholder="необяз."
                              />
                            </label>
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Оплата</span>
                              <select
                                value={montageInternalPaymentMethod}
                                onChange={(e) => setMontageInternalPaymentMethod(e.target.value as OrderServicePaymentMethod)}
                                className="co-input co-input--price"
                              >
                                <option value="NON_CASH">Безнал</option>
                                <option value="CASH">Наличка</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                  <div className="co-serviceRow">
                    <Toggle checked={demontageEnabled} onChange={setDemontageEnabled} label="Демонтаж" />
                    {demontageEnabled ? (
                      <>
                        {isGreenwich ? (
                          <textarea
                            value={demontageComment}
                            onChange={(e) => setDemontageComment(e.target.value)}
                            className="co-textarea co-textarea--compact"
                            placeholder="Комментарий к демонтажу…"
                          />
                        ) : (
                          <div className="co-priceRowGroup">
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Стоимость, р</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={demontagePrice}
                                onChange={(e) => setDemontagePrice(e.target.value)}
                                className="co-input co-input--price"
                                placeholder="0"
                              />
                            </label>
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Внутр., р</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={demontageInternalCost}
                                onChange={(e) => setDemontageInternalCost(e.target.value)}
                                className="co-input co-input--price"
                                placeholder="необяз."
                              />
                            </label>
                            <label className="co-priceRow">
                              <span className="co-priceLabel">Оплата</span>
                              <select
                                value={demontageInternalPaymentMethod}
                                onChange={(e) => setDemontageInternalPaymentMethod(e.target.value as OrderServicePaymentMethod)}
                                className="co-input co-input--price"
                              >
                                <option value="NON_CASH">Безнал</option>
                                <option value="CASH">Наличка</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                  </div>
                </details>
                ) : null}

              </div>

              {error ? <div className="co-error">{error}</div> : null}

                  </div>

                <aside className="cart-summaryRail" aria-label="Итог заявки">
                <div className="cart-footer">
                  <div className="cart-summaryEyebrow">Итог заявки</div>
                  {isWarehouse && !isQuickSupplement && !isProjectDemoCart ? (
                    <div className="checkout-financeControls">
                      <fieldset className="checkout-paymentMethod">
                        <legend>Оплата</legend>
                        <div role="radiogroup" aria-label="Способ оплаты клиентом">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={clientPaymentMethod === "NON_CASH"}
                            className={clientPaymentMethod === "NON_CASH" ? "is-active" : ""}
                            onClick={() => setClientPaymentMethod("NON_CASH")}
                          >
                            Безнал
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={clientPaymentMethod === "CASH"}
                            className={clientPaymentMethod === "CASH" ? "is-active" : ""}
                            onClick={() => setClientPaymentMethod("CASH")}
                          >
                            Наличные
                          </button>
                        </div>
                      </fieldset>
                      {canUseManualOrderDiscount ? (
                        <CompactOrderDiscountControl
                          type={rentalDiscountType}
                          percent={rentalDiscountPercent}
                          amount={rentalDiscountAmount}
                          rentalSubtotal={totalForPeriod}
                          rentalDays={rentalDays}
                          onTypeChange={setRentalDiscountType}
                          onPercentChange={setRentalDiscountPercent}
                          onAmountChange={setRentalDiscountAmount}
                          disabled={submitting}
                        />
                      ) : (
                        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
                          Для Greenwich применяется одна лучшая скидка по каждой позиции: уровень или персональное предложение.
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className="cart-total" style={{ fontSize: "1.35rem" }}>
                    {isWarehouse && (deliveryPriceNum > 0 || montagePriceNum > 0 || demontagePriceNum > 0) ? (
                      <>
                        <span className="cart-totalLabel">Итого</span>
                        <strong className="cart-totalValue">{formatMoneyRub(totalWithTax)}</strong>
                        <span className="cart-total-detail">
                          {isWarehouse && clientPaymentMethod === "CASH"
                            ? "Наличные · налог не начисляется"
                            : `До налога ${formatMoneyRub(totalWithServices)} · налог ${formatMoneyRub(taxAmount)}`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="cart-totalLabel">Итого за период</span>
                        <strong className="cart-totalValue">{formatMoneyRub(totalWithTax)}</strong>
                        <span className="cart-total-detail">
                          {isWarehouse && clientPaymentMethod === "CASH"
                            ? "Наличные · налог не начисляется"
                            : `До налога ${formatMoneyRub(totalWithServices)} · налог ${formatMoneyRub(taxAmount)}`}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="cart-muted cart-note">
                    Точная смета и доступность подтверждаются складом после создания заявки.
                  </p>
                  <button
                    type="button"
                    disabled={!canCheckout || submitting}
                    onClick={submit}
                    className="co-btn co-btn--primary"
                  >
                    {submitting
                      ? isProjectDemoCart
                        ? "Сохраняем demo…"
                        : "Создаём заявку…"
                      : isProjectDemoCart
                        ? "Сохранить demo-черновик"
                        : isQuickSupplement
                          ? "Оформить доп.-заявку"
                          : "Создать заявку"}
                  </button>
                </div>
                </aside>
                </div>
              </section>
            ) : (
              <div className="cart-footer" style={{ marginTop: "1rem" }}>
                <div className="cart-total">
                  {rentalDays > 0 ? (
                    <>
                      Итого за период: <strong>{totalWithTax.toFixed(0)}</strong>{" "}
                      <span className="cart-unit">р</span>
                      <span className="cart-total-detail">
                        {" "}(до налога {totalWithServices.toFixed(0)} + налог {taxAmount} р)
                      </span>
                    </>
                  ) : (
                    <>
                      Итого в день: <strong>{(totalPerDay + Math.round(totalPerDay * ORDER_TAX_RATE)).toFixed(0)}</strong>{" "}
                      <span className="cart-unit">р/сут</span>
                    </>
                  )}
                </div>
                <p className="cart-muted cart-note">
                  Оформление заявки доступно только для Grinvich. Перейди в каталог, чтобы продолжить.
                </p>
              </div>
            )}
          </>
          )}

        {selectedItemId ? (() => {
          const selectedItem = items.find((item) => item.id === selectedItemId);
          const selectedLine = cart.find((line) => line.itemId === selectedItemId);
          if (!selectedItem) return null;
          return (
            <ItemModal
              item={selectedItem}
              qtyInCart={selectedLine?.qty ?? 0}
              availableForDates={selectedItem.availability.availableForDates}
              onClose={() => setSelectedItemId(null)}
              onAdd={() => setQty(selectedItem.id, 1)}
              onInc={() => setQty(selectedItem.id, (selectedLine?.qty ?? 0) + 1)}
              onDec={() => setQty(selectedItem.id, (selectedLine?.qty ?? 0) - 1)}
              onSetQty={(qty) => setQty(selectedItem.id, qty)}
            />
          );
        })() : null}

        {mounted &&
          typeof document !== "undefined" &&
          createPortal(
            <BackLink
              href={
                isQuickSupplement
                  ? `/catalog?quickParentId=${quickParentId}`
                  : isProjectCart && projectId
                    ? (() => {
                        const params = new URLSearchParams();
                        params.set("projectId", projectId);
                        if (projectMode === "demo") params.set("projectMode", "demo");
                        if (estimateVersionId?.trim()) params.set("estimateVersionId", estimateVersionId.trim());
                        if (returnTo?.trim()) params.set("returnTo", returnTo.trim());
                        return `/catalog?${params.toString()}`;
                      })()
                    : "/catalog"
              }
              className="cart-returnToCatalog"
            >
              Каталог
            </BackLink>,
            document.body
          )}
      </section>
    </AppShell>
  );
}
