"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";
import { formatRentalPeriodRangeRu, type RentalPartOfDay } from "@/lib/rental-days";

type QueueOrder = {
  id: string;
  parentOrderId?: string | null;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  rentalStartPartOfDay?: RentalPartOfDay | null;
  rentalEndPartOfDay?: RentalPartOfDay | null;
  createdAt: string;
  customer: { id: string; name: string };
  greenwichUser: { id: string; displayName: string; ratingScore?: number } | null;
  warehouseInternalNote?: string | null;
  totalAmount?: number;
  profitEstimate?: number;
  taxAmount?: number;
  discount?: { type: "PERCENT" | "AMOUNT" | "NONE"; percent: number | null; amount: number } | null;
  project?: { id: string; title: string } | null;
};

const QUEUE_STATUS_OPTIONS = [
  { value: "SUBMITTED", label: "Новая" },
  { value: "ESTIMATE_SENT", label: "Смета отправлена" },
  { value: "CHANGES_REQUESTED", label: "Запрошены изменения" },
  { value: "APPROVED_BY_GREENWICH", label: "Согласовано Grinvich" },
  { value: "PICKING", label: "Сборка" },
  { value: "ISSUED", label: "Выдано" },
  { value: "RETURN_DECLARED", label: "Возврат заявлен" },
] as const;

const SORT_OPTIONS = [
  { value: "smart", label: "По приоритету (важное сверху)" },
  { value: "readyBy_asc", label: "Готовность: раньше → позже" },
  { value: "readyBy_desc", label: "Готовность: позже → раньше" },
  { value: "startDate_asc", label: "Начало периода ↑" },
  { value: "startDate_desc", label: "Начало периода ↓" },
  { value: "created_desc", label: "Создание: новые сверху" },
  { value: "created_asc", label: "Создание: старые сверху" },
] as const;

const SOURCE_OPTIONS = [
  { value: "all", label: "Все источники" },
  { value: "GREENWICH_INTERNAL", label: "От Grinvich" },
  { value: "WOWSTORG_EXTERNAL", label: "Склад (внешние)" },
] as const;

const DEFAULT_SORT = "readyBy_asc";
const ARCHIVE_DEFAULT_SORT = "updated_desc";

function fmtDateRu(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}.${mm}.${yy}`;
}

function periodLineQueue(o: QueueOrder): string {
  const startIso = o.startDate.slice(0, 10);
  const endIso = o.endDate.slice(0, 10);
  return formatRentalPeriodRangeRu({
    startDateIso: startIso,
    endDateIso: endIso,
    startDateFormatted: fmtDateRu(o.startDate),
    endDateFormatted: fmtDateRu(o.endDate),
    rentalStartPartOfDay: o.rentalStartPartOfDay ?? undefined,
    rentalEndPartOfDay: o.rentalEndPartOfDay ?? undefined,
  });
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function statusHeaderClass(status: string): string {
  return status === "CANCELLED"
    ? "bg-zinc-100/90 text-zinc-500"
    : status === "CLOSED"
      ? "bg-violet-50/80 text-violet-900"
      : "bg-white/80";
}

function parseStatusSetFromUrl(raw: string | null): Set<string> {
  const all = new Set(QUEUE_STATUS_OPTIONS.map((o) => o.value));
  if (!raw?.trim()) return all;
  const picked = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return picked.size > 0 ? picked : all;
}

function buildQueueQuery(args: {
  sort: string;
  q: string;
  source: string;
  statusSet: Set<string>;
}): string {
  const params = new URLSearchParams();
  if (args.sort && args.sort !== DEFAULT_SORT) params.set("sort", args.sort);
  const q = args.q.trim();
  if (q) params.set("q", q);
  if (args.source !== "all") params.set("source", args.source);
  const allStatuses = new Set(QUEUE_STATUS_OPTIONS.map((o) => o.value));
  const allSelected =
    args.statusSet.size === allStatuses.size && [...allStatuses].every((s) => args.statusSet.has(s));
  if (!allSelected && args.statusSet.size > 0) {
    params.set("status", [...args.statusSet].sort().join(","));
  }
  return params.toString();
}

function buildArchiveQuery(args: {
  sort: string;
  q: string;
  source: string;
  status: string;
}): string {
  const params = new URLSearchParams();
  if (args.sort && args.sort !== ARCHIVE_DEFAULT_SORT) params.set("sort", args.sort);
  const q = args.q.trim();
  if (q) params.set("q", q);
  if (args.source !== "all") params.set("source", args.source);
  if (args.status !== "all") params.set("status", args.status);
  return params.toString();
}

function WarehouseQueueContent() {
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden = state.status === "authenticated" && role !== "WOWSTORG";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = React.useState<"active" | "archive">(
    () => (searchParams.get("tab") === "archive" ? "archive" : "active"),
  );
  const [orders, setOrders] = React.useState<QueueOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editingNoteOrderId, setEditingNoteOrderId] = React.useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = React.useState("");
  const [noteSaveBusy, setNoteSaveBusy] = React.useState(false);

  const [sort, setSort] = React.useState(
    () => searchParams.get("sort") || (searchParams.get("tab") === "archive" ? ARCHIVE_DEFAULT_SORT : DEFAULT_SORT),
  );
  const [qInput, setQInput] = React.useState(() => searchParams.get("q") ?? "");
  const [qDebounced, setQDebounced] = React.useState(() => searchParams.get("q") ?? "");
  const [source, setSource] = React.useState(() => searchParams.get("source") || "all");
  const [statusSet, setStatusSet] = React.useState(() => parseStatusSetFromUrl(searchParams.get("status")));
  const [archiveStatus, setArchiveStatus] = React.useState(() => searchParams.get("status") || "all");

  const [filtersOpen, setFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    const nextTab = searchParams.get("tab") === "archive" ? "archive" : "active";
    setTab(nextTab);
    const t = window.setTimeout(() => setQDebounced(qInput), 320);
    return () => window.clearTimeout(t);
  }, [qInput, searchParams]);

  const loadOrders = React.useCallback(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    const qs =
      tab === "archive"
        ? buildArchiveQuery({ sort, q: qDebounced, source, status: archiveStatus })
        : buildQueueQuery({ sort, q: qDebounced, source, statusSet });
    fetch(`/api/warehouse/${tab === "archive" ? "archive" : "queue"}${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: QueueOrder[] } | null) => setOrders(data?.orders ?? []))
      .catch(() => setOrders([]));
  }, [state.status, role, sort, qDebounced, source, statusSet, archiveStatus, tab]);

  React.useEffect(() => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    let cancelled = false;
    const qs =
      tab === "archive"
        ? buildArchiveQuery({ sort, q: qDebounced, source, status: archiveStatus })
        : buildQueueQuery({ sort, q: qDebounced, source, statusSet });
    const tabQs = new URLSearchParams(qs);
    if (tab === "archive") tabQs.set("tab", "archive");
    router.replace(tabQs.toString() ? `${pathname}?${tabQs.toString()}` : pathname, { scroll: false });
    setLoading(true);
    fetch(`/api/warehouse/${tab === "archive" ? "archive" : "queue"}${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { orders?: QueueOrder[] } | null) => {
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
  }, [state.status, role, sort, qDebounced, source, statusSet, archiveStatus, tab, pathname, router]);

  async function saveInternalNote(orderId: string) {
    setNoteSaveBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/internal-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: editingNoteValue.trim() || null }),
      });
      if (res.ok) {
        setEditingNoteOrderId(null);
        loadOrders();
      }
    } finally {
      setNoteSaveBusy(false);
    }
  }

  function toggleStatus(value: string) {
    setStatusSet((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size <= 1) return next;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function selectAllStatuses() {
    setStatusSet(new Set(QUEUE_STATUS_OPTIONS.map((o) => o.value)));
  }

  const grouped = React.useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const childrenByParent = new Map<string, QueueOrder[]>();
    for (const o of orders) {
      if (!o.parentOrderId) continue;
      const arr = childrenByParent.get(o.parentOrderId) ?? [];
      arr.push(o);
      childrenByParent.set(o.parentOrderId, arr);
    }
    const roots = orders.filter((o) => !o.parentOrderId || !byId.has(o.parentOrderId));
    return roots.map((root) => ({
      root,
      children: childrenByParent.get(root.id) ?? [],
    }));
  }, [orders]);

  function renderQueueCard(o: QueueOrder, kind: "root" | "child") {
    const isCancelled = o.status === "CANCELLED";
    const isCancelledArchive = tab === "archive" && isCancelled;
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
            : o.project
              ? "border-violet-200/80 bg-[linear-gradient(135deg,rgba(245,243,255,0.95),rgba(255,255,255,0.82))] hover:border-violet-300 hover:shadow-[0_24px_70px_rgba(109,40,217,0.14)]"
              : isSupplement
                ? "border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(255,255,255,0.8))] hover:border-amber-300"
                : "border-white/75 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,250,255,0.86))] hover:border-violet-200 hover:shadow-[0_24px_70px_rgba(109,40,217,0.16)]",
          kind === "child" ? "ml-8" : "",
        ].join(" ")}
      >
        <div className={["px-4 py-5", statusHeaderClass(o.status)].join(" ")}>
          <OrderStatusStepper status={o.status as OrderStatus} source={o.source as "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL"} />
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
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold text-zinc-500">
                {o.greenwichUser ? (
                  <span>
                    {o.greenwichUser.displayName}
                    {o.greenwichUser.ratingScore != null ? ` · рейтинг ${o.greenwichUser.ratingScore}` : ""}
                  </span>
                ) : null}
                {o.project ? <span>Проект: {o.project.title}</span> : null}
              </div>
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
                {o.project ? (
                  <span className="rounded-full border border-violet-200 bg-white/75 px-2.5 py-1 font-bold text-violet-800">
                    Проект
                  </span>
                ) : null}
                {isCancelledArchive ? (
                  <span className="rounded-full border border-zinc-300 bg-white/70 px-2.5 py-1 font-bold text-zinc-500">
                    Не учитывается
                  </span>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-zinc-200/70 bg-white/70 px-3 py-1.5 text-xs font-bold text-zinc-500">
              Создана {fmtDateRu(o.createdAt)}
            </div>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(9rem,0.75fr)_minmax(16rem,1.35fr)_minmax(9rem,0.9fr)]">
            <div className="rounded-2xl border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(250,250,250,0.95),rgba(255,255,255,0.76))] px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Готовность</div>
              <div className={["mt-1 text-lg font-black", isCancelledArchive ? "text-zinc-500" : "text-zinc-950"].join(" ")}>
                {fmtDateRu(o.readyByDate)}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-[linear-gradient(135deg,rgba(250,250,250,0.95),rgba(255,255,255,0.76))] px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Период</div>
              <div className={["mt-1 text-base font-black", isCancelledArchive ? "text-zinc-500" : "text-zinc-950"].join(" ")}>
                {periodLineQueue(o)}
              </div>
            </div>

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
              <div className={["mt-1 text-lg font-black", isCancelledArchive ? "text-zinc-500" : "text-violet-950"].join(" ")}>
                {o.totalAmount != null ? formatMoney(o.totalAmount) : "—"}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full border border-zinc-200 bg-white/70 px-2.5 py-1 text-zinc-500">ID {o.id.slice(0, 8)}</span>
            {tab === "archive" ? (
              <span className="rounded-full border border-zinc-200 bg-white/70 px-2.5 py-1 text-zinc-500">Архив</span>
            ) : null}
            {isCancelled && !isCancelledArchive ? (
              <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-zinc-600">Отменена</span>
            ) : null}
            {o.taxAmount != null ? (
              <span className="rounded-full border border-zinc-200 bg-white/70 px-2.5 py-1 text-zinc-600">
                Налог {formatMoney(o.taxAmount)}
              </span>
            ) : null}
            {discountLabel ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-emerald-800">
                Скидка {discountLabel}
              </span>
            ) : null}
            {o.profitEstimate != null ? (
              <span
                className={[
                  "rounded-full border px-2.5 py-1",
                  o.profitEstimate < 0
                    ? "border-red-200 bg-red-50/85 text-red-800"
                    : "border-emerald-200 bg-emerald-50/85 text-emerald-800",
                ].join(" ")}
              >
                Прибыль {formatMoney(o.profitEstimate)}
              </span>
            ) : null}
          </div>

          {o.warehouseInternalNote ? (
            <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
              <span className="font-black text-amber-900">Комментарий склада:</span>{" "}
              <span className="whitespace-pre-wrap">{o.warehouseInternalNote}</span>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {o.status === "ISSUED" && o.greenwichUser && !o.parentOrderId ? (
              <Link
                href={`/catalog?quickParentId=${o.id}`}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900 hover:bg-amber-100"
              >
                Быстрая доп.-выдача
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setEditingNoteOrderId(o.id);
                setEditingNoteValue(o.warehouseInternalNote ?? "");
              }}
              className="rounded-2xl border border-zinc-200 bg-white/75 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-white"
            >
              Комментарий
            </button>
            <Link
              href={`/orders/${o.id}?from=warehouse-queue`}
              className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-black text-violet-800 hover:bg-violet-100"
            >
              Открыть заявку
            </Link>
          </div>
          {editingNoteOrderId === o.id ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-white/70 p-4">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                Внутренний комментарий
              </label>
              <textarea
                value={editingNoteValue}
                onChange={(e) => setEditingNoteValue(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold shadow-inner outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                placeholder="Заметка для сотрудников склада…"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={noteSaveBusy}
                  onClick={() => saveInternalNote(o.id)}
                  className="rounded-2xl border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {noteSaveBusy ? "…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  disabled={noteSaveBusy}
                  onClick={() => {
                    setEditingNoteOrderId(null);
                    setEditingNoteValue("");
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <AppShell title="Очередь склада">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.22),transparent_34%),radial-gradient(circle_at_92%_18%,rgba(250,204,21,0.2),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,243,255,0.9))] p-5 shadow-[0_24px_80px_rgba(109,40,217,0.14)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.26em] text-violet-700">Склад</div>
                <h1 className="mt-2 text-4xl font-black leading-none text-zinc-950 sm:text-5xl">Очередь заявок</h1>
              </div>
              <div
                className="inline-flex shrink-0 items-center rounded-2xl border border-white/80 bg-white/65 p-1 shadow-sm"
                role="group"
                aria-label="Область заявок"
              >
              <button
                type="button"
                onClick={() => {
                  setTab("active");
                  setSort(DEFAULT_SORT);
                }}
                className={[
                  "rounded-xl px-4 py-3 text-sm font-black transition",
                  tab === "active"
                    ? "bg-violet-700 text-white"
                    : "text-zinc-700 hover:bg-white/80 hover:text-zinc-950",
                ].join(" ")}
              >
                Активные
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("archive");
                  setSort(ARCHIVE_DEFAULT_SORT);
                }}
                className={[
                  "rounded-xl px-4 py-3 text-sm font-black transition",
                  tab === "archive"
                    ? "bg-violet-700 text-white"
                    : "text-zinc-700 hover:bg-white/80 hover:text-zinc-950",
                ].join(" ")}
              >
                Архив
              </button>
            </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/70 bg-white/60 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_18px_45px_rgba(24,24,27,0.08)] backdrop-blur">
              <div className={["grid gap-2", tab === "archive" ? "xl:grid-cols-[minmax(22rem,1fr)_minmax(12rem,16rem)_minmax(10rem,14rem)_minmax(10rem,14rem)]" : "xl:grid-cols-[minmax(22rem,1fr)_minmax(12rem,16rem)_minmax(10rem,14rem)]"].join(" ")}>
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Найти заявку"
                  className="h-12 rounded-[1.15rem] border border-transparent bg-white/90 px-4 text-sm font-bold text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  aria-label="Найти заявку"
                />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="h-12 rounded-[1.15rem] border border-transparent bg-white/90 px-4 text-sm font-bold text-zinc-900 shadow-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  aria-label="Сортировка"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="h-12 rounded-[1.15rem] border border-transparent bg-white/90 px-4 text-sm font-bold text-zinc-900 shadow-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  aria-label="Источник"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {tab === "archive" ? (
                  <select
                    value={archiveStatus}
                    onChange={(e) => setArchiveStatus(e.target.value)}
                    className="h-12 rounded-[1.15rem] border border-transparent bg-white/90 px-4 text-sm font-bold text-zinc-900 shadow-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    aria-label="Статус"
                  >
                    <option value="all">Все</option>
                    <option value="CLOSED">Завершена</option>
                    <option value="CANCELLED">Отменена</option>
                  </select>
                ) : null}
              </div>
            </div>

            {tab === "active" ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-white hover:text-violet-950"
                >
                  {filtersOpen ? "Скрыть статусы" : "Статусы"}
                </button>
                {filtersOpen ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllStatuses}
                      className="rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-black text-zinc-600 hover:bg-white"
                    >
                      Все статусы
                    </button>
                    {QUEUE_STATUS_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-violet-50"
                      >
                        <input
                          type="checkbox"
                          checked={statusSet.has(opt.value)}
                          onChange={() => toggleStatus(opt.value)}
                          className="rounded border-zinc-300 accent-violet-700"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-zinc-600">Нет заявок по текущим фильтрам.</div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="rounded-[2rem] border border-white/70 bg-white/35 p-2 shadow-[0_18px_52px_rgba(24,24,27,0.06)]">
                  {renderQueueCard(root, "root")}
                  {children.length > 0 ? (
                    <div className="mt-2 space-y-2 border-l-2 border-amber-300/70 pl-2">
                      {children.map((c) => renderQueueCard(c, "child"))}
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

export default function WarehouseQueuePage() {
  return (
    <React.Suspense
      fallback={
        <AppShell title="Очередь склада">
          <div className="text-sm text-zinc-600">Загрузка…</div>
        </AppShell>
      }
    >
      <WarehouseQueueContent />
    </React.Suspense>
  );
}
