"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";

import { formatRentalPeriodRangeRu, type RentalPartOfDay } from "@/lib/rental-days";

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
    ? "bg-zinc-100/90 text-zinc-500"
    : status === "CLOSED"
      ? "bg-violet-50/80 text-violet-900"
      : "bg-white/80";
}

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
    const isCancelled = o.status === "CANCELLED";
    const isCancelledArchive = scopeFilter === "DONE" && isCancelled;
    const isArchive = scopeFilter === "DONE";
    const isSupplement = Boolean(o.parentOrderId);
    const discountLabel = o.discount
      ? o.discount.type === "PERCENT" && o.discount.percent != null
        ? `${o.discount.percent}%`
        : formatMoney(o.discount.amount)
      : null;
    return (
      <div
        key={o.id}
        className={[
          "overflow-hidden rounded-[1.75rem] border p-0 shadow-[0_18px_52px_rgba(24,24,27,0.08)] transition hover:-translate-y-0.5",
          isCancelledArchive
            ? "border-zinc-200/90 bg-[linear-gradient(135deg,rgba(244,244,245,0.96),rgba(250,250,250,0.82))] opacity-80 hover:border-zinc-300 hover:opacity-100"
            : isSupplement
              ? "border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.8))] hover:border-amber-300"
              : "border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,250,255,0.86))] hover:border-violet-200 hover:shadow-[0_24px_70px_rgba(109,40,217,0.16)]",
          kind === "child" ? "ml-8" : "",
        ].join(" ")}
      >
        <div className={["px-4 py-5", statusHeaderClass(o.status)].join(" ")}>
          <OrderStatusStepper status={o.status} source={o.source} />
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div
                className={[
                  "text-xl font-black leading-tight",
                  isCancelledArchive ? "text-zinc-500" : "text-zinc-950",
                ].join(" ")}
              >
                {o.customer.name}
              </div>
              {o.eventName ? (
                <div className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-500">{o.eventName}</div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span
                  className={[
                    "rounded-full border px-2.5 py-1 font-bold",
                    isSupplement
                      ? "border-amber-200 bg-amber-50/85 text-amber-900"
                      : "border-violet-200 bg-violet-50/85 text-violet-800",
                  ].join(" ")}
                >
                  {isSupplement ? `Доп. к ${o.parentOrderId?.slice(0, 8)}` : "Основная"}
                </span>
                {isCancelledArchive ? (
                  <span className="rounded-full border border-zinc-300 bg-white/70 px-2.5 py-1 font-bold text-zinc-500">
                    Не учитывается
                  </span>
                ) : null}
                <span className="rounded-full border border-zinc-200 bg-white/75 px-2.5 py-1 font-bold text-zinc-600">
                  Готовность {fmtDate(o.readyByDate)}
                </span>
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-zinc-200/70 bg-white/70 px-3 py-1.5 text-xs font-bold text-zinc-500">
              Создана {fmtDate(o.createdAt)}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-zinc-200 bg-white/75 px-2.5 py-1 font-bold text-zinc-600">
              {periodLineOrders(o)}
            </span>
            {isArchive ? (
              <span className="rounded-full border border-zinc-200 bg-white/75 px-2.5 py-1 font-bold text-zinc-600">
                Закрытая/архивная
              </span>
            ) : null}
          </div>

          {o.totalAmount != null || o.taxAmount != null || o.discount ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div
                className={[
                  "rounded-2xl border px-4 py-3",
                  isCancelledArchive
                    ? "border-zinc-200/90 bg-white/60"
                    : "border-violet-200/80 bg-[linear-gradient(135deg,rgba(245,243,255,0.95),rgba(255,255,255,0.78))]",
                ].join(" ")}
              >
                <div
                  className={[
                    "text-[10px] font-black uppercase tracking-[0.16em]",
                    isCancelledArchive ? "text-zinc-400" : "text-violet-600",
                  ].join(" ")}
                >
                  Сумма
                </div>
                <div
                  className={[
                    "mt-1 text-lg font-black",
                    isCancelledArchive ? "text-zinc-500" : "text-violet-950",
                  ].join(" ")}
                >
                  {o.totalAmount != null ? formatMoney(o.totalAmount) : "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(250,250,250,0.95),rgba(255,255,255,0.76))] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Налог</div>
                <div className={["mt-1 text-lg font-black", isCancelledArchive ? "text-zinc-500" : "text-zinc-950"].join(" ")}>
                  {o.taxAmount != null ? formatMoney(o.taxAmount) : "—"}
                </div>
              </div>

              <div
                className={[
                  "rounded-2xl border px-4 py-3",
                  o.discount && !isCancelledArchive
                    ? "border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(255,255,255,0.78))]"
                    : "border-zinc-200/80 bg-[linear-gradient(135deg,rgba(250,250,250,0.95),rgba(255,255,255,0.76))]",
                ].join(" ")}
              >
                <div
                  className={[
                    "text-[10px] font-black uppercase tracking-[0.16em]",
                    o.discount && !isCancelledArchive ? "text-emerald-700" : "text-zinc-500",
                  ].join(" ")}
                >
                  Скидка
                </div>
                <div
                  className={[
                    "mt-1 text-lg font-black",
                    o.discount && !isCancelledArchive ? "text-emerald-950" : "text-zinc-500",
                  ].join(" ")}
                >
                  {discountLabel ?? "—"}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full border border-zinc-200 bg-white/75 px-2.5 py-1 text-zinc-600">
              ID {o.id.slice(0, 8)}
            </span>
            {isCancelled && !isCancelledArchive ? (
              <span className="rounded-full border border-zinc-300 bg-white/70 px-2.5 py-1 text-zinc-500">
                Отменена
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/orders/${o.id}`}
              className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-black text-violet-800 transition hover:bg-violet-100"
            >
              Открыть заявку
            </Link>
            {o.status === "ISSUED" && !o.parentOrderId ? (
              <Link
                href={`/catalog?quickParentId=${o.id}`}
                className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-black text-amber-900 transition hover:bg-amber-100"
              >
                Быстрая доп.-выдача
              </Link>
            ) : null}
            {CANCELLABLE.includes(o.status) && (
              <button
                type="button"
                disabled={cancellingId === o.id}
                onClick={() => cancelOrder(o.id)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-black text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
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
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.22),transparent_34%),radial-gradient(circle_at_92%_18%,rgba(250,204,21,0.2),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,243,255,0.9))] p-5 shadow-[0_24px_80px_rgba(109,40,217,0.14)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.26em] text-violet-700">Рабочий центр</div>
                <h1 className="mt-2 text-4xl font-black leading-none text-zinc-950 sm:text-5xl">Заявки</h1>
              </div>
              <div
                className="inline-flex shrink-0 items-center rounded-2xl border border-white/80 bg-white/65 p-1 shadow-sm"
                role="group"
                aria-label="Область заявок"
              >
                {(["ACTIVE", "ALL", "DONE"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScopeFilter(key)}
                    className={[
                      "rounded-xl px-4 py-3 text-sm font-black transition",
                      scopeFilter === key
                        ? "bg-violet-700 text-white shadow-violet-200"
                        : "text-zinc-700 hover:bg-white/80 hover:text-zinc-950",
                    ].join(" ")}
                  >
                    {key === "ACTIVE" ? "Активные" : key === "ALL" ? "Все" : "Архив"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/70 bg-white/60 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur">
              <div className="grid gap-2 xl:grid-cols-[minmax(22rem,1fr)_minmax(15rem,20rem)_minmax(12rem,16rem)]">
                <div className="relative min-w-0">
                  <svg
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
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
                    placeholder="Найти заявку"
                    className="h-12 w-full rounded-[1.15rem] border border-transparent bg-white/90 pl-11 pr-4 text-sm font-bold text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  />
                </div>

                <div
                  className="inline-flex h-12 min-w-0 items-center rounded-[1.15rem] bg-white/90 p-1 shadow-sm"
                  role="group"
                  aria-label="Тип заявки"
                >
                  {(["ALL", "MAIN", "SUPPLEMENT"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setKindFilter(key)}
                      className={[
                        "h-10 flex-1 rounded-xl px-3 text-sm font-black transition",
                        kindFilter === key
                          ? "bg-violet-700 text-white shadow-sm"
                          : "text-zinc-600 hover:bg-violet-50 hover:text-violet-900",
                      ].join(" ")}
                    >
                      {key === "ALL" ? "Все типы" : key === "MAIN" ? "Основные" : "Доп."}
                    </button>
                  ))}
                </div>

                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="h-12 min-w-0 cursor-pointer rounded-[1.15rem] border border-transparent bg-white/90 px-4 text-sm font-bold text-zinc-900 shadow-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  aria-label="Сортировка"
                >
                  {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
                    <option key={m} value={m}>
                      {SORT_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-bold tabular-nums text-zinc-500">
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
                className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-white hover:text-violet-950"
              >
                Сбросить
              </button>
            </div>
          </section>

          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-600">
              Нет заявок по текущим фильтрам. Попробуйте изменить поиск или статус.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="rounded-[2rem] border border-white/70 bg-white/35 p-2 shadow-[0_18px_52px_rgba(24,24,27,0.06)]">
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
