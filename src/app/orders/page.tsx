"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";

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
  createdAt: string;
  customer: { id: string; name: string };
  totalAmount?: number;
  taxAmount?: number;
  discount?: { type: "PERCENT" | "AMOUNT" | "NONE"; percent: number | null; amount: number } | null;
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

function statusHeaderClass(status: OrderCard["status"]): string {
  return status === "CANCELLED"
    ? "bg-[#5b0b17]/10 text-[#5b0b17]"
    : status === "CLOSED"
      ? "bg-violet-50 text-violet-900"
      : "bg-white";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
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

  function renderOrderCard(o: OrderCard, kind: "root" | "child") {
    return (
      <div
        key={o.id}
        className={[
          "rounded-2xl border overflow-hidden shadow-sm transition",
          o.status === "CANCELLED"
            ? "border-[#5b0b17]/25 bg-[#5b0b17]/[0.03] hover:border-[#5b0b17]/40"
            : o.parentOrderId
              ? "border-amber-300 bg-amber-50/30 hover:border-amber-400"
              : "border-zinc-200 bg-white hover:border-violet-200",
          kind === "child" ? "ml-8" : "",
        ].join(" ")}
      >
        <div className={["px-4 py-5", statusHeaderClass(o.status)].join(" ")}>
          <OrderStatusStepper status={o.status} source={o.source} />
        </div>
        <div className="p-4">
          <div className="text-sm font-semibold text-zinc-900">{o.customer.name}</div>
          {o.eventName ? (
            <div className="mt-1 text-xs text-zinc-600 line-clamp-2">{o.eventName}</div>
          ) : null}
          {o.parentOrderId ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Доп. заявка к №{o.parentOrderId.slice(0, 8)}
            </div>
          ) : (
            <div className="mt-1 inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
              Основная заявка
            </div>
          )}
          <div className="mt-2 text-sm text-zinc-600">
            Готовность к: <span className="font-semibold">{fmtDate(o.readyByDate)}</span>
            {" · "}
            Период: <span className="font-semibold">{fmtDate(o.startDate)}</span> —{" "}
            <span className="font-semibold">{fmtDate(o.endDate)}</span>
            {o.totalAmount != null ? (
              <span className="ml-2 inline-flex items-baseline gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-bold text-violet-800">
                {o.totalAmount.toLocaleString("ru-RU")} ₽
              </span>
            ) : null}
            {o.taxAmount != null ? (
              <span className="ml-2 rounded-md bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700">
                налог {o.taxAmount.toLocaleString("ru-RU")} ₽
              </span>
            ) : null}
            {o.discount ? (
              <span className="ml-2 rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                скидка{" "}
                {o.discount.type === "PERCENT" && o.discount.percent != null
                  ? `${o.discount.percent}%`
                  : `${Math.round(o.discount.amount).toLocaleString("ru-RU")} ₽`}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/orders/${o.id}`}
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
            >
              Открыть заявку
            </Link>
            {o.status === "ISSUED" && !o.parentOrderId ? (
              <Link
                href={`/catalog?quickParentId=${o.id}`}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                Быстрая доп.-выдача
              </Link>
            ) : null}
            {CANCELLABLE.includes(o.status) && (
              <button
                type="button"
                disabled={cancellingId === o.id}
                onClick={() => cancelOrder(o.id)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {cancellingId === o.id ? "…" : "Отменить заявку"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell title="Мои заявки">
      {loading ? (
        <div className="text-sm text-zinc-600">Загрузка…</div>
      ) : orders.length === 0 ? (
        <div className="text-sm text-zinc-600">Пока нет заявок.</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-white to-violet-50/40 px-3 py-2.5 shadow-sm">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              <div className="relative min-w-0 flex-1 sm:min-w-[200px] sm:max-w-md">
                <svg
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск: заказчик, №, мероприятие"
                  className="h-9 w-full rounded-lg border border-zinc-200/90 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>

              <div
                className="inline-flex min-h-9 items-center rounded-lg border border-zinc-200/90 bg-zinc-100/70 p-0.5 shadow-inner"
                role="group"
                aria-label="Область заявок"
              >
                {(["ACTIVE", "ALL", "DONE"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScopeFilter(key)}
                    className={[
                      "rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                      scopeFilter === key
                        ? "bg-white text-violet-900 shadow-sm ring-1 ring-violet-200/80"
                        : "text-zinc-600 hover:text-zinc-900",
                    ].join(" ")}
                  >
                    {key === "ACTIVE" ? "Активные" : key === "ALL" ? "Все" : "Архив"}
                  </button>
                ))}
              </div>

              <div
                className="inline-flex min-h-9 items-center rounded-lg border border-zinc-200/90 bg-zinc-100/70 p-0.5 shadow-inner"
                role="group"
                aria-label="Тип заявки"
              >
                {(["ALL", "MAIN", "SUPPLEMENT"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setKindFilter(key)}
                    className={[
                      "rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                      kindFilter === key
                        ? "bg-white text-violet-900 shadow-sm ring-1 ring-violet-200/80"
                        : "text-zinc-600 hover:text-zinc-900",
                    ].join(" ")}
                  >
                    {key === "ALL" ? "Все типы" : key === "MAIN" ? "Основные" : "Доп."}
                  </button>
                ))}
              </div>

              <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 sm:flex-initial sm:shrink-0">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-9 min-w-0 flex-1 cursor-pointer rounded-lg border border-zinc-200/90 bg-white px-2.5 text-xs font-medium text-zinc-800 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 sm:max-w-[200px] sm:flex-initial"
                  aria-label="Сортировка"
                >
                  {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
                    <option key={m} value={m}>
                      {SORT_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 sm:ml-auto">
                <span className="tabular-nums text-xs text-zinc-500">
                  {filteredCount}/{totalLoaded}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                    setScopeFilter("ACTIVE");
                    setKindFilter("ALL");
                    setSortMode("SMART");
                  }}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100/80 hover:text-violet-900"
                >
                  Сброс
                </button>
              </div>
            </div>
          </div>

          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-600">
              Нет заявок по текущим фильтрам. Попробуйте изменить поиск или статус.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="rounded-3xl border border-zinc-200/80 bg-white/40 p-2">
                  {renderOrderCard(root, "root")}
                  {children.length > 0 ? (
                    <div className="mt-2 space-y-2 border-l-2 border-amber-300/70 pl-2">
                      {children.map((c) => renderOrderCard(c, "child"))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
