"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper } from "@/app/_ui/OrderStatusStepper";
import type { OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

type QueueOrder = {
  id: string;
  parentOrderId?: string | null;
  status: string;
  source: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  customer: { id: string; name: string };
  greenwichUser: { id: string; displayName: string; ratingScore?: number } | null;
  warehouseInternalNote?: string | null;
  totalAmount?: number;
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

function statusHeaderClass(status: string): string {
  return status === "CANCELLED"
    ? "bg-[#5b0b17]/10 text-[#5b0b17]"
    : status === "CLOSED"
      ? "bg-violet-50 text-violet-900"
      : "bg-white";
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
    return (
      <div
        key={o.id}
        className={[
          "rounded-2xl border overflow-hidden shadow-sm transition",
          o.status === "CANCELLED"
            ? "border-[#5b0b17]/25 bg-[#5b0b17]/[0.03] hover:border-[#5b0b17]/40"
            : o.project
              ? "border-violet-300 bg-violet-50/40 hover:border-violet-400"
            : o.parentOrderId
              ? "border-amber-300 bg-amber-50/30 hover:border-amber-400"
              : "border-zinc-200 bg-white hover:border-violet-200",
          kind === "child" ? "ml-8" : "",
        ].join(" ")}
      >
        <div className={["px-4 py-5", statusHeaderClass(o.status)].join(" ")}>
          <OrderStatusStepper status={o.status as OrderStatus} source={o.source as "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL"} />
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-zinc-900">
              {o.customer.name}
              {o.greenwichUser
                ? ` · ${o.greenwichUser.displayName}${
                    o.greenwichUser.ratingScore != null
                      ? ` · рейтинг ${o.greenwichUser.ratingScore}`
                      : ""
                  }`
                : ""}
            </div>
          </div>
          {o.parentOrderId ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Доп. заявка к №{o.parentOrderId.slice(0, 8)}
            </div>
          ) : (
            <div className="mt-1 inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
              Основная заявка
            </div>
          )}
          {o.project ? (
            <div className="mt-1 inline-flex items-center rounded-full border border-violet-300 bg-white px-2 py-0.5 text-xs font-semibold text-violet-800">
              Проект: {o.project.title}
            </div>
          ) : null}
          <div className="mt-2 text-sm text-zinc-600">
            Готовность: <span className="font-semibold">{fmtDateRu(o.readyByDate)}</span> · Период:{" "}
            <span className="font-semibold">{fmtDateRu(o.startDate)}</span> —{" "}
            <span className="font-semibold">{fmtDateRu(o.endDate)}</span>
            {o.totalAmount != null ? (
              <span className="ml-2 rounded-md bg-violet-100 px-1.5 py-0.5 font-bold text-violet-800">
                · {o.totalAmount.toLocaleString("ru-RU")} ₽
              </span>
            ) : null}
            {o.discount ? (
              <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">
                Скидка{" "}
                {o.discount.type === "PERCENT" && o.discount.percent != null
                  ? `${o.discount.percent}%`
                  : `${Math.round(o.discount.amount).toLocaleString("ru-RU")} ₽`}
              </span>
            ) : null}
          </div>
          {o.warehouseInternalNote ? (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              <span className="font-semibold text-amber-800">Внутр. комментарий:</span>{" "}
              <span className="whitespace-pre-wrap">{o.warehouseInternalNote}</span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {o.status === "ISSUED" && o.greenwichUser && !o.parentOrderId ? (
              <Link
                href={`/catalog?quickParentId=${o.id}`}
                className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
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
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Комментарий
            </button>
            <Link
              href={`/orders/${o.id}?from=warehouse-queue`}
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-100"
            >
              Открыть заявку
            </Link>
          </div>
          {editingNoteOrderId === o.id ? (
            <div className="mt-3 pt-3 border-t border-zinc-200">
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Внутренний комментарий (только для склада)
              </label>
              <textarea
                value={editingNoteValue}
                onChange={(e) => setEditingNoteValue(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Заметка для сотрудников склада…"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={noteSaveBusy}
                  onClick={() => saveInternalNote(o.id)}
                  className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
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
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-zinc-600">
              {tab === "archive"
                ? "Завершённые и отменённые заявки. До 500 записей с учётом фильтров."
                : "Актуальные заявки (не завершённые и не отменённые). До 500 записей с учётом фильтров."}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTab("active");
                  setSort(DEFAULT_SORT);
                }}
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  tab === "active"
                    ? "bg-violet-700 text-white"
                    : "border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
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
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  tab === "archive"
                    ? "bg-violet-700 text-white"
                    : "border border-zinc-200 bg-white text-zinc-800 hover:bg-violet-50",
                ].join(" ")}
              >
                Архив
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 min-w-[200px] flex-1">
                <span className="text-xs font-semibold text-zinc-500">Поиск</span>
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Заказчик, Grinvich, ID заявки…"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm w-full"
                />
              </label>
              <label className="flex flex-col gap-1 min-w-[200px]">
                <span className="text-xs font-semibold text-zinc-500">Сортировка</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 min-w-[180px]">
                <span className="text-xs font-semibold text-zinc-500">Источник</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {tab === "archive" ? (
                <label className="flex flex-col gap-1 min-w-[160px]">
                  <span className="text-xs font-semibold text-zinc-500">Статус</span>
                  <select
                    value={archiveStatus}
                    onChange={(e) => setArchiveStatus(e.target.value)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="all">Все</option>
                    <option value="CLOSED">Завершена</option>
                    <option value="CANCELLED">Отменена</option>
                  </select>
                </label>
              ) : null}
            </div>

            {tab === "active" ? (
              <div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="text-sm font-medium text-violet-800 hover:text-violet-950"
                >
                  {filtersOpen ? "▼ Скрыть статусы" : "► Фильтр по статусам"}
                </button>
                {filtersOpen ? (
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={selectAllStatuses}
                      className="text-xs rounded-md border border-zinc-200 px-2 py-1 text-zinc-700 hover:bg-zinc-50"
                    >
                      Все статусы
                    </button>
                    {QUEUE_STATUS_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 text-xs cursor-pointer hover:bg-violet-50"
                      >
                        <input
                          type="checkbox"
                          checked={statusSet.has(opt.value)}
                          onChange={() => toggleStatus(opt.value)}
                          className="rounded border-zinc-300"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="text-sm text-zinc-600">Загрузка…</div>
          ) : orders.length === 0 ? (
            <div className="text-sm text-zinc-600">Нет заявок по текущим фильтрам.</div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="rounded-3xl border border-zinc-200/80 bg-white/40 p-2">
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
