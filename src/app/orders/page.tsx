"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { OrderStatusStepper, orderStatusLabelRu } from "@/app/_ui/OrderStatusStepper";
import { OrderFeedbackEditor, type ServiceFeedback } from "@/app/_ui/OrderServiceFeedback";
import { WorkEntityIcon } from "@/app/_ui/WorkEntityIcon";

import { formatRentalPeriodRangeRu, type RentalPartOfDay } from "@/lib/rental-days";
import "./orders.css";

type OrderCard = {
  id: string;
  parentOrderId?: string | null;
  status:
    | "SUBMITTED"
    | "ESTIMATE_SENT"
    | "CHANGES_REQUESTED"
    | "APPROVED_BY_GREENWICH"
    | "PICKING"
    | "ISSUED"
    | "RETURN_DECLARED"
    | "CLOSED"
    | "CANCELLED";
  source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  eventName?: string | null;
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay | null;
  rentalEndPartOfDay?: RentalPartOfDay | null;
  createdAt: string;
  customer: { id: string; name: string; logoUrl?: string | null };
  totalAmount?: number;
  taxAmount?: number;
  discount?: { type: "PERCENT" | "AMOUNT" | "NONE"; percent: number | null; amount: number } | null;
  serviceFeedback?: ServiceFeedback | null;
};

type OrderPreview = {
  id: string;
  eventName?: string | null;
  greenwichComment?: string | null;
  deliveryEnabled?: boolean;
  montageEnabled?: boolean;
  demontageEnabled?: boolean;
  lines: Array<{
    id: string;
    requestedQty: number;
    approvedQty?: number | null;
    issuedQty?: number | null;
    item: { name: string };
  }>;
};

const CANCELLABLE: OrderCard["status"][] = ["SUBMITTED", "ESTIMATE_SENT", "CHANGES_REQUESTED"];

/** Чем меньше — тем выше в списке при «умной» сортировке (сначала то, что требует внимания). */
const STATUS_PRIORITY: Record<OrderCard["status"], number> = {
  ISSUED: 0,
  RETURN_DECLARED: 1,
  PICKING: 2,
  APPROVED_BY_GREENWICH: 3,
  CHANGES_REQUESTED: 4,
  ESTIMATE_SENT: 5,
  SUBMITTED: 6,
  CLOSED: 7,
  CANCELLED: 8,
};

type SortMode =
  | "SMART"
  | "READY_ASC"
  | "READY_DESC"
  | "END_ASC"
  | "END_DESC"
  | "CREATED_DESC"
  | "CREATED_ASC";

const SORT_LABEL: Record<SortMode, string> = {
  SMART: "По приоритету",
  READY_ASC: "Готовность ↑",
  READY_DESC: "Готовность ↓",
  END_ASC: "Конец периода ↑",
  END_DESC: "Конец периода ↓",
  CREATED_DESC: "Создание: новые",
  CREATED_ASC: "Создание: старые",
};

/** Область: без отдельных статусов — только активные / всё / архив */
type ScopeFilter = "ALL" | "ACTIVE" | "DONE";

type KindFilter = "ALL" | "MAIN" | "SUPPLEMENT";

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function periodLineOrders(o: OrderCard): string {
  return formatRentalPeriodRangeRu({
    startDateIso: o.startDate.slice(0, 10),
    endDateIso: o.endDate.slice(0, 10),
    startDateFormatted: fmtDate(o.startDate),
    endDateFormatted: fmtDate(o.endDate),
    rentalStartPartOfDay: o.rentalStartPartOfDay ?? undefined,
    rentalEndPartOfDay: o.rentalEndPartOfDay ?? undefined,
  });
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function orderMatchesSearch(o: OrderCard, q: string): boolean {
  if (!q) return true;
  const n = norm(q);
  if (o.id.toLowerCase().includes(n)) return true;
  if (o.customer.name.toLowerCase().includes(n)) return true;
  if (o.eventName && o.eventName.toLowerCase().includes(n)) return true;
  return false;
}

function orderMatchesScope(o: OrderCard, f: ScopeFilter): boolean {
  if (f === "ALL") return true;
  if (f === "ACTIVE") return o.status !== "CLOSED" && o.status !== "CANCELLED";
  return o.status === "CLOSED" || o.status === "CANCELLED";
}

function orderMatchesKindFilter(o: OrderCard, k: KindFilter): boolean {
  if (k === "ALL") return true;
  if (k === "MAIN") return !o.parentOrderId;
  return Boolean(o.parentOrderId);
}

type OrderPredicate = (o: OrderCard) => boolean;

/**
 * Дерево: если совпал ребёнок — показываем родителя; если совпал родитель — только детей,
 * которые тоже проходят фильтр (не подтягиваем «лишние» доп. заявки).
 */
function expandForTree(orders: OrderCard[], matchedIds: Set<string>, pred: OrderPredicate): OrderCard[] {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const childrenByParent = new Map<string, OrderCard[]>();
  for (const o of orders) {
    if (!o.parentOrderId) continue;
    const arr = childrenByParent.get(o.parentOrderId) ?? [];
    arr.push(o);
    childrenByParent.set(o.parentOrderId, arr);
  }
  const out = new Set(matchedIds);
  for (const id of matchedIds) {
    const o = byId.get(id);
    if (o?.parentOrderId) out.add(o.parentOrderId);
  }
  for (const id of [...out]) {
    const o = byId.get(id);
    if (o && !o.parentOrderId) {
      for (const c of childrenByParent.get(id) ?? []) {
        if (pred(c)) out.add(c.id);
      }
    }
  }
  return orders.filter((o) => out.has(o.id));
}

function applyFilters(orders: OrderCard[], search: string, scope: ScopeFilter, kindF: KindFilter): OrderCard[] {
  const pred: OrderPredicate = (o) =>
    orderMatchesSearch(o, search) && orderMatchesScope(o, scope) && orderMatchesKindFilter(o, kindF);
  const matched = new Set(orders.filter(pred).map((o) => o.id));
  return expandForTree(orders, matched, pred);
}

function compareOrders(a: OrderCard, b: OrderCard, mode: SortMode): number {
  if (mode === "SMART") {
    const pa = STATUS_PRIORITY[a.status];
    const pb = STATUS_PRIORITY[b.status];
    if (pa !== pb) return pa - pb;
    const r = a.readyByDate.localeCompare(b.readyByDate);
    if (r !== 0) return r;
    const e = a.endDate.localeCompare(b.endDate);
    if (e !== 0) return e;
    return b.createdAt.localeCompare(a.createdAt);
  }
  if (mode === "READY_ASC") return a.readyByDate.localeCompare(b.readyByDate);
  if (mode === "READY_DESC") return b.readyByDate.localeCompare(a.readyByDate);
  if (mode === "END_ASC") return a.endDate.localeCompare(b.endDate);
  if (mode === "END_DESC") return b.endDate.localeCompare(a.endDate);
  if (mode === "CREATED_DESC") return b.createdAt.localeCompare(a.createdAt);
  return a.createdAt.localeCompare(b.createdAt);
}

function sortOrderList(list: OrderCard[], mode: SortMode): OrderCard[] {
  return [...list].sort((a, b) => compareOrders(a, b, mode));
}

export default function OrdersPage() {
  const [orders, setOrders] = React.useState<OrderCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set());
  const [previews, setPreviews] = React.useState<Record<string, OrderPreview | null>>({});
  const [previewLoading, setPreviewLoading] = React.useState<Set<string>>(() => new Set());

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [scopeFilter, setScopeFilter] = React.useState<ScopeFilter>("ACTIVE");
  const [kindFilter, setKindFilter] = React.useState<KindFilter>("ALL");
  const [sortMode, setSortMode] = React.useState<SortMode>("SMART");

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadOrders = React.useCallback(() => {
    fetch("/api/orders/my", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: OrderCard[] } | null) => setOrders(data?.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/orders/my", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: OrderCard[] } | null) => {
        if (!cancelled) setOrders(data?.orders ?? []);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function cancelOrder(orderId: string) {
    if (!confirm("Отменить заявку? Она попадёт в архив.")) return;
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        notification?: { queued?: boolean; sent?: boolean; message?: string };
        error?: { message?: string };
      };
      if (res.ok) {
        const n = data?.notification;
        if (n && !n.queued && "sent" in n && n.sent === false && n.message) {
          alert(`Заявка отменена.\n\n⚠️ ${n.message}`);
        }
        loadOrders();
      } else {
        alert(data?.error?.message ?? "Не удалось отменить заявку");
      }
    } finally {
      setCancellingId(null);
    }
  }

  async function advanceOrder(o: OrderCard) {
    const approve = o.status === "ESTIMATE_SENT" || o.status === "CHANGES_REQUESTED";
    const returnOrder = o.status === "ISSUED";
    if (!approve && !returnOrder) return;
    if (returnOrder && !confirm("Весь реквизит возвращается в нормальном состоянии? Заявка будет отправлена на приёмку.")) return;

    setActingId(o.id);
    setNotice(null);
    setActionError(null);
    try {
      const response = await fetch(
        approve ? `/api/orders/${o.id}/approve` : `/api/orders/${o.id}/return-declared`,
        approve
          ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
          : { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "Не удалось обновить заявку");
      setNotice(approve ? "Смета согласована — заявка передана Wowstorg." : "Заявка отправлена на приёмку.");
      loadOrders();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось обновить заявку");
    } finally {
      setActingId(null);
    }
  }

  async function toggleSummary(orderId: string) {
    const opening = !expandedIds.has(orderId);
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
    if (!opening || Object.prototype.hasOwnProperty.call(previews, orderId)) return;

    setPreviewLoading((current) => new Set(current).add(orderId));
    try {
      const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { order?: OrderPreview } | null;
      setPreviews((current) => ({ ...current, [orderId]: response.ok ? payload?.order ?? null : null }));
    } finally {
      setPreviewLoading((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
    }
  }

  const filteredSorted = React.useMemo(() => {
    const f = applyFilters(orders, debouncedSearch, scopeFilter, kindFilter);
    return sortOrderList(f, sortMode);
  }, [orders, debouncedSearch, scopeFilter, kindFilter, sortMode]);

  const grouped = React.useMemo(() => {
    const byId = new Map(filteredSorted.map((o) => [o.id, o]));
    const childrenByParent = new Map<string, OrderCard[]>();
    for (const o of filteredSorted) {
      if (!o.parentOrderId) continue;
      const arr = childrenByParent.get(o.parentOrderId) ?? [];
      arr.push(o);
      childrenByParent.set(o.parentOrderId, arr);
    }
    const roots = filteredSorted.filter((o) => !o.parentOrderId || !byId.has(o.parentOrderId));
    return roots.map((root) => ({
      root,
      children: sortOrderList(childrenByParent.get(root.id) ?? [], sortMode),
    }));
  }, [filteredSorted, sortMode]);

  const totalLoaded = orders.length;
  const filteredCount = filteredSorted.length;
  const activeCount = orders.filter((order) => order.status !== "CLOSED" && order.status !== "CANCELLED").length;
  const actionCount = orders.filter((order) =>
    order.status === "ESTIMATE_SENT" || order.status === "CHANGES_REQUESTED" || order.status === "ISSUED",
  ).length;

  function renderOrderCard(o: OrderCard, kind: "root" | "child") {
    const isCancelled = o.status === "CANCELLED";
    const isSupplement = Boolean(o.parentOrderId);
    const canApprove = o.status === "ESTIMATE_SENT" || o.status === "CHANGES_REQUESTED";
    const canReturn = o.status === "ISSUED";
    const isExpanded = expandedIds.has(o.id);
    const preview = previews[o.id];
    return (
      <article
        key={o.id}
        className="my-order"
        data-child={kind === "child"}
        data-cancelled={isCancelled}
        data-status={o.status}
        data-expanded={isExpanded || undefined}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("a, button, input, select, textarea, summary")) return;
          void toggleSummary(o.id);
        }}
      >
        <div className="my-order__main">
          <div className="my-order__identity">
            <div className="my-order__logo" aria-hidden="true">
              {o.customer.logoUrl ? (
                <Image src={o.customer.logoUrl} alt="" width={96} height={96} unoptimized />
              ) : <WorkEntityIcon kind="ORDER" />}
            </div>
            <div className="min-w-0">
              <span className="my-order__overline">
                {isSupplement ? "Дополнительная заявка" : "Заявка"} · {orderStatusLabelRu[o.status]}
              </span>
              <strong>{o.eventName || o.customer.name}</strong>
              <small>
                {o.customer.name} · создана {fmtDate(o.createdAt)}
              </small>
            </div>
          </div>

          <div className="my-order__date">
            <small>Готовность</small>
            <strong>{fmtDate(o.readyByDate)}</strong>
          </div>

          <div className="my-order__period">
            <small>Период аренды</small>
            <strong>{periodLineOrders(o)}</strong>
          </div>

          <div className="my-order__amount">
            <small>Итого</small>
            <strong>{o.totalAmount != null ? formatMoney(o.totalAmount) : "—"}</strong>
          </div>

          <div className="my-order__actions">
            {canApprove || canReturn ? (
              <button
                type="button"
                className="my-order__button my-order__button--primary"
                disabled={actingId === o.id}
                onClick={() => advanceOrder(o)}
              >
                {actingId === o.id ? "Сохраняем…" : canApprove ? "Согласовать смету" : "На приёмку"}
              </button>
            ) : null}
            <Link href={`/orders/${o.id}`} className="my-order__button my-order__button--dark">
              Открыть
            </Link>
            {o.status === "ISSUED" && !o.parentOrderId ? (
              <Link href={`/catalog?quickParentId=${o.id}`} className="my-order__button">
                Доп.-выдача
              </Link>
            ) : null}
            {CANCELLABLE.includes(o.status) ? (
              <button
                type="button"
                className="my-order__button my-order__button--danger-quiet"
                disabled={cancellingId === o.id}
                onClick={() => cancelOrder(o.id)}
              >
                {cancellingId === o.id ? "…" : "Отменить"}
              </button>
            ) : null}
            <button
              type="button"
              className="my-order__summaryButton"
              aria-expanded={isExpanded}
              onClick={() => void toggleSummary(o.id)}
            >
              <span>{isExpanded ? "Свернуть" : "Сводка"}</span>
              <span className="my-order__summaryIcon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        <div className="my-order__progress">
          <OrderStatusStepper
            status={o.status}
            source={o.source}
            showSummary={false}
            density="compact"
            compactWindow={8}
          />
        </div>

        <div className="my-order__reveal" aria-hidden={!isExpanded}>
          <div className="my-order__revealInner" onClick={(event) => event.stopPropagation()}>
            <section className="my-order__contents">
              <header>
                <div>
                  <span>Состав заявки</span>
                  <strong>{preview?.lines.length ?? 0} {preview?.lines.length === 1 ? "позиция" : "позиций"}</strong>
                </div>
                <Link href={`/orders/${o.id}`}>Открыть полностью →</Link>
              </header>
              {previewLoading.has(o.id) ? (
                <div className="my-order__previewLoading">Загружаем состав…</div>
              ) : preview?.lines.length ? (
                <ul>
                  {preview.lines.map((line) => (
                    <li key={line.id}>
                      <span>{line.item.name}</span>
                      <strong>× {line.issuedQty ?? line.approvedQty ?? line.requestedQty}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="my-order__previewLoading">Состав заявки пока не заполнен.</div>
              )}
            </section>
            <aside className="my-order__facts">
              <div><span>Готовность</span><strong>{fmtDate(o.readyByDate)}</strong></div>
              <div><span>Аренда</span><strong>{periodLineOrders(o)}</strong></div>
              <div><span>Создана</span><strong>{fmtDate(o.createdAt)}</strong></div>
              <div><span>Итого</span><strong>{o.totalAmount != null ? formatMoney(o.totalAmount) : "—"}</strong></div>
              {preview ? (
                <p>
                  {[preview.deliveryEnabled && "доставка", preview.montageEnabled && "монтаж", preview.demontageEnabled && "демонтаж"].filter(Boolean).join(" · ") || "Без дополнительных услуг"}
                </p>
              ) : null}
            </aside>
          </div>
        </div>

        {o.status === "CLOSED" && !o.parentOrderId ? (
          <div className="my-order__feedback">
            <OrderFeedbackEditor
              orderId={o.id}
              feedback={o.serviceFeedback}
              onSaved={(feedback) => setOrders((current) => current.map((order) =>
                order.id === o.id ? { ...order, serviceFeedback: feedback } : order,
              ))}
            />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <AppShell title="Мои заявки">
      <div className="my-orders">
        <section className="my-orders__hero">
          <div className="my-orders__heroArt" aria-hidden="true">
            <Image src="/brand/dino-orders-hero.png" alt="" fill sizes="(max-width: 800px) 55vw, 640px" priority />
          </div>
          <div className="my-orders__heroContent">
            <span className="my-orders__eyebrow">Рабочий центр Grinvich</span>
            <h1>Мои заявки</h1>
            <p>Согласуйте смету, следите за подготовкой и отправляйте реквизит на приёмку без лишних переходов.</p>
            <div className="my-orders__heroMeta" aria-label="Сводка по заявкам">
              <span><strong>{activeCount}</strong> в работе</span>
              <span><strong>{actionCount}</strong> ждут вашего действия</span>
            </div>
            <div className="my-orders__tabs" role="tablist" aria-label="Область заявок">
              {(["ACTIVE", "ALL", "DONE"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={scopeFilter === key}
                  onClick={() => setScopeFilter(key)}
                >
                  {key === "ACTIVE" ? "Активные" : key === "ALL" ? "Все" : "Архив"}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="my-orders__toolbar" aria-label="Поиск и фильтры">
          <div className="my-orders__filters">
            <label className="my-orders__search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.2-3.2" />
              </svg>
              <span className="sr-only">Найти заявку</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти заявку" />
            </label>
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)} aria-label="Тип заявки">
              <option value="ALL">Все типы</option>
              <option value="MAIN">Основные заявки</option>
              <option value="SUPPLEMENT">Дополнительные заявки</option>
            </select>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Сортировка">
              {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>{SORT_LABEL[mode]}</option>
              ))}
            </select>
            <button
              type="button"
              className="my-orders__reset"
              onClick={() => {
                setSearch("");
                setDebouncedSearch("");
                setScopeFilter("ACTIVE");
                setKindFilter("ALL");
                setSortMode("SMART");
              }}
            >
              Сбросить · {filteredCount}/{totalLoaded}
            </button>
          </div>
        </section>

        {notice ? <div className="my-orders__notice" role="status">{notice}</div> : null}
        {actionError ? <div className="my-orders__error" role="alert">{actionError}</div> : null}

        {loading ? (
          <ListSkeleton rows={6} />
        ) : orders.length === 0 ? (
          <div className="my-orders__empty">Пока нет заявок.</div>
        ) : grouped.length === 0 ? (
          <div className="my-orders__empty">Нет заявок по текущим фильтрам.</div>
        ) : (
          <div className="my-orders__list">
            {grouped.map(({ root, children }) => (
              <div key={root.id} className="my-orders__family">
                {renderOrderCard(root, "root")}
                {children.length > 0 ? (
                  <div className="my-orders__children">
                    {children.map((child) => renderOrderCard(child, "child"))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
