"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { loadCart, saveCart, clearCart, type CartLine } from "@/lib/cart";
import { catalogDatesFromStorage } from "@/lib/catalogDates";
import { PAY_MULTIPLIER_GREENWICH } from "@/lib/constants";
import "./cart.css";
import "../checkout/checkout.css";

type CatalogItem = {
  id: string;
  name: string;
  type: string;
  pricePerDay: string;
  availability: { availableNow: number; availableForDates?: number };
};

function formatDateRu(dateOnly: string) {
  const [y, m, d] = dateOnly.split("-").map((v) => Number(v));
  if (!y || !m || !d) return dateOnly;
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

function daysBetweenDateOnly(start: string, end: string) {
  const a = new Date(start + "T12:00:00");
  const b = new Date(end + "T12:00:00");
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return 0;
  const days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  return days === 0 ? 1 : days;
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
type GreenwichUser = { id: string; displayName: string };
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
      comment: string | null;
      periodGroup: string | null;
      pricePerDaySnapshot: number | null;
    }>;
  } | null;
  error?: { message?: string };
};

export default function CartPage() {
  const router = useRouter();
  const { state } = useAuth();
  const [quickParentId, setQuickParentId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("quickParentId");
  });
  const [projectId, setProjectId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("projectId");
  });
  const [projectMode, setProjectMode] = React.useState<"dated" | "demo">(() => {
    if (typeof window === "undefined") return "dated";
    return new URLSearchParams(window.location.search).get("projectMode") === "demo" ? "demo" : "dated";
  });
  const [estimateVersionId, setEstimateVersionId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("estimateVersionId");
  });
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
  const [projectCartError, setProjectCartError] = React.useState<string | null>(null);

  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [qtyDrafts, setQtyDrafts] = React.useState<Record<string, string>>({});
  const [items, setItems] = React.useState<CatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [startDate, setStartDate] = React.useState<string | null>(null);
  const [endDate, setEndDate] = React.useState<string | null>(null);
  const [readyByDate, setReadyByDate] = React.useState<string | null>(null);

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
  const [montageEnabled, setMontageEnabled] = React.useState(false);
  const [montageComment, setMontageComment] = React.useState("");
  const [montagePrice, setMontagePrice] = React.useState("");
  const [demontageEnabled, setDemontageEnabled] = React.useState(false);
  const [demontageComment, setDemontageComment] = React.useState("");
  const [demontagePrice, setDemontagePrice] = React.useState("");

  const [orderType, setOrderType] = React.useState<"greenwich" | "external">("external");
  const [greenwichUsers, setGreenwichUsers] = React.useState<GreenwichUser[]>([]);
  const [greenwichUserId, setGreenwichUserId] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setQuickParentId(params.get("quickParentId"));
    setProjectId(params.get("projectId"));
    setProjectMode(params.get("projectMode") === "demo" ? "demo" : "dated");
    setEstimateVersionId(params.get("estimateVersionId"));
  }, []);

  React.useEffect(() => {
    if (!quickParentId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${quickParentId}/quick-supplement/parent`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as
          | { parentId?: string; readyByDate?: string; startDate?: string; endDate?: string; eventName?: string; comment?: string }
          | null;
        if (!res.ok || !data) throw new Error(data ? "Parent fetch failed" : "Parent fetch failed");

        if (cancelled) return;
        setStartDate(data.startDate ?? null);
        setEndDate(data.endDate ?? null);
        setReadyByDate(data.readyByDate ?? null);
        setEventName(data.eventName ?? "");
        setComment(data.comment ?? "");

        // Quick supplement всегда без доп. услуг.
        setDeliveryEnabled(false);
        setMontageEnabled(false);
        setDemontageEnabled(false);
        setDeliveryComment("");
        setMontageComment("");
        setDemontageComment("");
        setDeliveryPrice("");
        setMontagePrice("");
        setDemontagePrice("");

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
      setProjectContext(null);
      setProjectCartError(null);
      return;
    }
    const role = state.status === "authenticated" ? state.user.role : null;
    if (role !== "WOWSTORG") {
      setProjectContext(null);
      setProjectCartError("Корзина проекта доступна только со склада (Wowstorg).");
      return;
    }
    let cancelled = false;
    setProjectCartError(null);
    setProjectContext(null);
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
  }, [projectId, quickParentId, state.status]);

  React.useEffect(() => {
    setCart(loadCart(cartScope));
  }, [cartScope]);

  /**
   * Синхронизируем черновик поля ввода с корзиной, но не затираем:
   * - пустую строку (пользователь стирает количество до blur);
   * - промежуточный ввод, пока число в поле совпадает с qty в корзине.
   * Раньше использовалось prev ?? String(qty) — при нажатии «+» qty росло, а черновик оставался старым.
   */
  React.useEffect(() => {
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
  }, [cart]);

  React.useEffect(() => {
    if (isQuickSupplement || isProjectDemoCart) return;
    if (typeof window === "undefined") return;
    const n = catalogDatesFromStorage();
    setStartDate(n.startDate);
    setEndDate(n.endDate);
    setReadyByDate(n.readyByDate);
    localStorage.setItem("catalog_readyByDate", n.readyByDate);
    localStorage.setItem("catalog_startDate", n.startDate);
    localStorage.setItem("catalog_endDate", n.endDate);
  }, [isProjectDemoCart, isQuickSupplement]);

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
    const role = state.status === "authenticated" ? state.user.role : null;
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
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
  }, [state.status]);

  const cartItemIdsKey = React.useMemo(() => cart.map((l) => l.itemId).sort().join(","), [cart]);

  React.useEffect(() => {
    if (!isProjectDemoCart || !projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/draft-order`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as DraftOrderResponse | null;
        if (!res.ok || !data || cancelled) return;
        const next = (data.draftOrder?.lines ?? []).map((line) => ({
          itemId: line.itemId,
          qty: line.qty,
          pricePerDay: line.pricePerDaySnapshot ?? undefined,
        }));
        if (next.length > 0) {
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
  }, [cartScope, isProjectDemoCart, projectId]);

  React.useEffect(() => {
    if (!isProjectCart || !projectContext || isProjectDemoCart) return;
    if (!projectContext.eventDateConfirmed) return;
    if (!projectContext.eventStartDate || !projectContext.eventEndDate) return;
    setStartDate((prev) => prev ?? projectContext.eventStartDate ?? null);
    setEndDate((prev) => prev ?? projectContext.eventEndDate ?? null);
    setReadyByDate((prev) => prev ?? projectContext.eventStartDate ?? null);
  }, [isProjectCart, isProjectDemoCart, projectContext]);

  React.useEffect(() => {
    if (cart.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ids = cart.map((l) => l.itemId).join(",");

    const params = new URLSearchParams();
    params.set("ids", ids);
    if (!isProjectDemoCart && startDate && endDate) {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    if (quickParentId) {
      params.set("excludeOrderId", quickParentId);
    }

    async function loadItems() {
      setLoading(true);
      try {
        const res = await fetch(`/api/catalog/items?${params.toString()}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as { items?: CatalogItem[] } | null;
        if (!cancelled) setItems(data?.items ?? []);
      } catch (e) {
        console.error("[cart] load catalog items failed", e);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadItems();
    return () => {
      cancelled = true;
    };
  }, [cartItemIdsKey, startDate, endDate, quickParentId, isProjectDemoCart]);

  function maxQtyForItem(itemId: string): number | null {
    const inv = items.find((i) => i.id === itemId);
    if (!inv) return null;
    const max = inv.availability.availableForDates ?? inv.availability.availableNow;
    return Math.max(0, max);
  }

  function setQty(itemId: string, qty: number) {
    const cap = maxQtyForItem(itemId);
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
  }

  /** После загрузки каталога с датами — подрезаем qty, если в корзине было больше доступного. */
  React.useEffect(() => {
    if (items.length === 0) return;
    setCart((prev) => {
      let changed = false;
      const next = prev
        .map((l) => {
          const inv = items.find((i) => i.id === l.itemId);
          if (!inv) return l;
          const cap = inv.availability.availableForDates ?? inv.availability.availableNow;
          const max = Math.max(0, cap);
          const clamped = max <= 0 ? 0 : Math.min(l.qty, max);
          if (clamped !== l.qty) changed = true;
          return { ...l, qty: clamped };
        })
        .filter((l) => l.qty > 0);
      if (!changed) return prev;
      saveCart(next, cartScope);
      return next;
    });
  }, [items, cartScope]);

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

  const isGreenwich = state.status === "authenticated" && state.user.role === "GREENWICH";
  const isWarehouse = state.status === "authenticated" && state.user.role === "WOWSTORG";

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
  const displayMultiplier =
    isWarehouse && orderType === "greenwich" ? PAY_MULTIPLIER_GREENWICH : 1;

  const totalPerDay = lines.reduce((sum, { line, item }) => {
    const basePrice = Number(item.pricePerDay) || 0;
    const price = basePrice * displayMultiplier;
    return sum + price * line.qty;
  }, 0);
  const rentalDays = startDate && endDate ? daysBetweenDateOnly(startDate, endDate) : 0;
  const totalForPeriod = totalPerDay * (rentalDays || 1);

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
    totalForPeriod + deliveryPriceNum + montagePriceNum + demontagePriceNum;

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
      : (canCheckoutGreenwich || canCheckoutWarehouse) && Boolean(startDate && endDate && readyByDate);

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
              return {
                itemId: l.itemId,
                itemName: item?.name ?? l.itemId,
                qty: l.qty,
                comment: null,
                periodGroup: null,
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
    if (!startDate || !endDate || !readyByDate) return;
    if (isProjectCart && !projectContext) {
      setError("Не загружены данные проекта");
      return;
    }
    if (!isQuickSupplement && !isProjectCart && !customerInputTrim) return;
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
            readyByDate,
            startDate,
            endDate,
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
            readyByDate,
            startDate,
            endDate,
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
      router.replace(`/orders/${data?.orderId ?? ""}`);
    } catch (e) {
      console.error("cart submit failed", e);
      setError(e instanceof Error ? e.message : "Не удалось отправить заявку");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Корзина">
      <section className="cart-section">
        <div className="cart-head">
          <h1 className="cart-title">Корзина</h1>
          <p className="cart-subtitle">
            Проверь состав, измени количество или перейди к оформлению заявки.
          </p>
        </div>

        {loading ? (
          <p className="cart-muted">Загрузка…</p>
        ) : lines.length === 0 ? (
          <div className="cart-empty">
            <p className="cart-muted">Корзина пуста.</p>
          </div>
        ) : (
          <>
            {startDate && endDate && rentalDays > 0 ? (
              <p className="cart-muted" style={{ marginBottom: "0.75rem" }}>
                Период: <strong>{formatDateRu(startDate)}</strong> —{" "}
                <strong>{formatDateRu(endDate)}</strong> · {rentalDays} дн.
              </p>
            ) : (
              <p className="cart-muted" style={{ marginBottom: "0.75rem" }}>
                Укажи даты в каталоге, чтобы посчитать итог за период.
              </p>
            )}
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
                const basePrice = Number(item.pricePerDay) || 0;
                const price = basePrice * displayMultiplier;
                const lineTotalPerDay = price * line.qty;
                const lineTotalForPeriod = lineTotalPerDay * (rentalDays || 0);
                const maxAvail = item.availability.availableForDates ?? item.availability.availableNow;
                const canInc = maxAvail > 0 && line.qty < maxAvail;
                return (
                  <li key={item.id} className="cart-row">
                    <div className="cart-row-main">
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

            {(isGreenwich || isWarehouse) ? (
              <>
                <div className="co-head" style={{ marginTop: "1.5rem" }}>
                  <div className="co-title">Оформление заявки</div>
                  <div className="co-subtitle">
                    {isQuickSupplement
                      ? "Быстрая доп.-выдача: используем даты и заказчика из родительской заявки."
                      : isProjectDemoCart
                        ? "Demo-черновик проекта: сохраняет корзину без дат и без создания реальной заявки."
                      : isProjectCart
                        ? "Заявка реквизита в рамках проекта: полная цена, заказчик из карточки проекта."
                        : isWarehouse
                          ? "Даты выбраны в каталоге. Укажи, на кого заявка, заказчика и доп. услуги."
                          : "Даты выбраны в каталоге. Заполни заказчика и при необходимости доп. услуги."}
                  </div>
                </div>

                {readyByDate && startDate && endDate && !isProjectDemoCart ? (
                  <div className="co-dates">
                    <div className="co-datePill">
                      Готовность: <strong>{formatDateRu(readyByDate)}</strong>
                    </div>
                    <div className="co-datePill">
                      Период: <strong>{formatDateRu(startDate)}</strong> —{" "}
                      <strong>{formatDateRu(endDate)}</strong>
                    </div>
                    {!isQuickSupplement ? (
                      <Link
                        href={
                          isProjectCart && projectId
                            ? `/catalog?projectId=${encodeURIComponent(projectId)}`
                            : "/catalog"
                        }
                        className="co-link"
                      >
                        Изменить даты →
                      </Link>
                    ) : null}
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
                    <Link
                      href={`/projects/${projectContext.id}`}
                      className="mt-2 inline-block font-medium text-violet-700 hover:text-violet-900"
                    >
                      ← К карточке проекта
                    </Link>
                  </div>
                ) : null}

                {!isQuickSupplement && isWarehouse && !isProjectCart ? (
                  <div className="co-field" style={{ marginBottom: "1rem" }}>
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

                <div className="co-grid">
                  {!isQuickSupplement && isWarehouse && !isProjectCart && orderType === "greenwich" ? (
                    <label className="co-field">
                      <div className="co-label">Сотрудник Grinvich *</div>
                      <select
                        value={greenwichUserId}
                        onChange={(e) => setGreenwichUserId(e.target.value)}
                        className="co-input"
                      >
                        <option value="">Выберите сотрудника</option>
                        {greenwichUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName}
                          </option>
                        ))}
                      </select>
                      {greenwichUsers.length === 0 ? (
                        <div className="co-help">Нет активных сотрудников Grinvich.</div>
                      ) : null}
                    </label>
                  ) : null}
                  {!isQuickSupplement ? (
                    <>
                      <div className="co-field">
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

                      <label className="co-field">
                        <div className="co-label">Название мероприятия</div>
                        <input
                          value={eventName}
                          onChange={(e) => setEventName(e.target.value)}
                          className="co-input"
                          placeholder="Название мероприятия"
                        />
                      </label>
                    </>
                  ) : null}

                {!isQuickSupplement ? (
                  <label className="co-field">
                    <div className="co-label">Комментарий</div>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="co-textarea"
                      placeholder="Комментарий к заявке…"
                    />
                  </label>
                ) : null}

                {!isQuickSupplement && !isProjectDemoCart ? (
                  <div className="co-services">
                  <div className="co-servicesTitle">Доп. услуги</div>
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
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
                ) : null}

              </div>

              {error ? <div className="co-error">{error}</div> : null}

                <div className="cart-footer" style={{ marginTop: "1.5rem" }}>
                  <div className="cart-total" style={{ fontSize: "1.35rem" }}>
                    {isWarehouse && (deliveryPriceNum > 0 || montagePriceNum > 0 || demontagePriceNum > 0) ? (
                      <>
                        Итого: <strong>{totalWithServices.toFixed(0)}</strong>{" "}
                        <span className="cart-unit">р</span>
                        <span className="cart-total-detail">
                          {" "}(аренда {totalForPeriod.toFixed(0)} + доп. услуги {deliveryPriceNum + montagePriceNum + demontagePriceNum} р)
                        </span>
                      </>
                    ) : (
                      <>
                        Итого за период: <strong>{totalForPeriod.toFixed(0)}</strong>{" "}
                        <span className="cart-unit">р</span>
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
              </>
            ) : (
              <div className="cart-footer" style={{ marginTop: "1rem" }}>
                <div className="cart-total">
                  {rentalDays > 0 ? (
                    <>
                      Итого за период: <strong>{totalForPeriod.toFixed(0)}</strong>{" "}
                      <span className="cart-unit">р</span>
                    </>
                  ) : (
                    <>
                      Итого в день: <strong>{totalPerDay.toFixed(0)}</strong>{" "}
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

        {mounted &&
          typeof document !== "undefined" &&
          createPortal(
            <Link
              href={
                isQuickSupplement
                  ? `/catalog?quickParentId=${quickParentId}`
                  : isProjectCart && projectId
                    ? (() => {
                        const params = new URLSearchParams();
                        params.set("projectId", projectId);
                        if (projectMode === "demo") params.set("projectMode", "demo");
                        if (estimateVersionId?.trim()) params.set("estimateVersionId", estimateVersionId.trim());
                        return `/catalog?${params.toString()}`;
                      })()
                    : "/catalog"
              }
              className="cart-floatCatalog"
              aria-label="В каталог"
            >
              ← В каталог
            </Link>,
            document.body
          )}
      </section>
    </AppShell>
  );
}
