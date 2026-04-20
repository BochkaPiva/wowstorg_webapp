"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { readJsonSafe } from "@/lib/fetchJson";

type CleanupOrderRow = {
  id: string;
  parentOrderId: string | null;
  projectId: string | null;
  projectTitle: string | null;
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
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  customerName: string;
  eventName: string | null;
  greenwichUserName: string | null;
  totalAmount: number;
  hasEstimateFile: boolean;
};

type CleanupPreview = {
  selectedOrderIds: string[];
  missingOrderIds: string[];
  totalOrdersToDelete: number;
  rootOrdersToDelete: number;
  quickSupplementsToDelete: number;
  autoIncludedQuickSupplementCount: number;
  linesCount: number;
  returnSplitsCount: number;
  incidentsCount: number;
  remindersCount: number;
  lossRecordsAffectedCount: number;
  projectEstimateSectionsAffectedCount: number;
  projectEstimateLinesAffectedCount: number;
  blockingProjectLinkedOrders: Array<{
    id: string;
    projectId: string;
    projectTitle: string | null;
    customerName: string;
  }>;
};

const STATUS_OPTIONS = [
  { value: "SUBMITTED", label: "Новая" },
  { value: "ESTIMATE_SENT", label: "Смета" },
  { value: "CHANGES_REQUESTED", label: "Правки" },
  { value: "APPROVED_BY_GREENWICH", label: "Согласовано" },
  { value: "PICKING", label: "Сборка" },
  { value: "ISSUED", label: "Выдано" },
  { value: "RETURN_DECLARED", label: "Приёмка" },
  { value: "CLOSED", label: "Закрыто" },
  { value: "CANCELLED", label: "Отменено" },
] as const;

const SORT_OPTIONS = [
  { value: "smart", label: "По приоритету" },
  { value: "readyBy_asc", label: "Готовность ↑" },
  { value: "readyBy_desc", label: "Готовность ↓" },
  { value: "startDate_asc", label: "Начало периода ↑" },
  { value: "startDate_desc", label: "Начало периода ↓" },
  { value: "created_desc", label: "Создание: новые" },
  { value: "created_asc", label: "Создание: старые" },
] as const;

const SOURCE_OPTIONS = [
  { value: "all", label: "Все источники" },
  { value: "GREENWICH_INTERNAL", label: "Grinvich" },
  { value: "WOWSTORG_EXTERNAL", label: "Внешние" },
] as const;

const STATUS_LABEL: Record<CleanupOrderRow["status"], string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета",
  CHANGES_REQUESTED: "Правки",
  APPROVED_BY_GREENWICH: "Согласовано",
  PICKING: "Сборка",
  ISSUED: "Выдано",
  RETURN_DECLARED: "Приёмка",
  CLOSED: "Закрыто",
  CANCELLED: "Отменено",
};

function formatDateRu(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function buildQuery(args: {
  q: string;
  source: string;
  sort: string;
  statusSet: Set<string>;
  selectedIds: string[];
}) {
  const params = new URLSearchParams();
  const q = args.q.trim();
  if (q) params.set("q", q);
  if (args.source !== "all") params.set("source", args.source);
  if (args.sort !== "readyBy_asc") params.set("sort", args.sort);
  const allStatuses = STATUS_OPTIONS.map((status) => status.value);
  const selectedAllStatuses =
    args.statusSet.size === allStatuses.length &&
    allStatuses.every((status) => args.statusSet.has(status));
  if (!selectedAllStatuses) {
    params.set("status", [...args.statusSet].sort().join(","));
  }
  if (args.selectedIds.length > 0) {
    params.set("selected", args.selectedIds.join(","));
  }
  return params.toString();
}

export default function AdminOrderCleanupPage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";

  const [orders, setOrders] = React.useState<CleanupOrderRow[]>([]);
  const [preview, setPreview] = React.useState<CleanupPreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const [qInput, setQInput] = React.useState("");
  const [qDebounced, setQDebounced] = React.useState("");
  const [source, setSource] = React.useState("all");
  const [sort, setSort] = React.useState("readyBy_asc");
  const [statusSet, setStatusSet] = React.useState<Set<string>>(
    new Set(STATUS_OPTIONS.map((status) => status.value)),
  );
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQDebounced(qInput), 250);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const selectedIdsArray = React.useMemo(() => [...selectedIds].sort(), [selectedIds]);
  const selectedIdsKey = React.useMemo(() => selectedIdsArray.join(","), [selectedIdsArray]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        q: qDebounced,
        source,
        sort,
        statusSet,
        selectedIds: selectedIdsArray,
      });
      const res = await fetch(`/api/admin/order-cleanup${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await readJsonSafe<{
        orders?: CleanupOrderRow[];
        preview?: CleanupPreview | null;
        error?: { message?: string };
      }>(res);
      if (!res.ok) {
        setError(data?.error?.message ?? "Не удалось загрузить данные для очистки");
        setOrders([]);
        setPreview(null);
        return;
      }
      setOrders(data?.orders ?? []);
      setPreview(data?.preview ?? null);
    } catch {
      setError("Ошибка сети или сервера");
      setOrders([]);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [qDebounced, selectedIdsArray, sort, source, statusSet]);

  React.useEffect(() => {
    if (!forbidden) {
      void load();
    }
  }, [forbidden, load, selectedIdsKey]);

  const grouped = React.useMemo(() => {
    const byId = new Map(orders.map((order) => [order.id, order]));
    const childrenByParent = new Map<string, CleanupOrderRow[]>();
    for (const order of orders) {
      if (!order.parentOrderId) continue;
      const list = childrenByParent.get(order.parentOrderId) ?? [];
      list.push(order);
      childrenByParent.set(order.parentOrderId, list);
    }
    const roots = orders.filter((order) => !order.parentOrderId || !byId.has(order.parentOrderId));
    return roots.map((root) => ({
      root,
      children: childrenByParent.get(root.id) ?? [],
    }));
  }, [orders]);

  const previewBlocked = Boolean(preview && preview.blockingProjectLinkedOrders.length > 0);
  const canDelete =
    selectedIds.size > 0 && confirmation === "DELETE" && !previewBlocked && !deleteBusy;

  function toggleStatus(value: string) {
    setStatusSet((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size === 1) return next;
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function toggleOrder(orderId: string) {
    setDeleteError(null);
    setSuccess(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function selectAllVisible() {
    setDeleteError(null);
    setSuccess(null);
    setSelectedIds(new Set(orders.map((order) => order.id)));
  }

  function clearSelection() {
    setDeleteError(null);
    setSuccess(null);
    setSelectedIds(new Set());
    setConfirmation("");
  }

  async function deleteSelected() {
    if (!canDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/order-cleanup/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedIdsArray,
          confirmation,
        }),
      });
      const data = await readJsonSafe<{
        deletedOrderCount?: number;
        deletedRootOrdersCount?: number;
        deletedQuickSupplementsCount?: number;
        error?: { message?: string };
      }>(res);
      if (!res.ok) {
        setDeleteError(data?.error?.message ?? "Не удалось удалить заявки");
        return;
      }
      setSuccess(
        `Удалено заявок: ${data?.deletedOrderCount ?? 0} (основных ${data?.deletedRootOrdersCount ?? 0}, доп. ${data?.deletedQuickSupplementsCount ?? 0}).`,
      );
      setSelectedIds(new Set());
      setConfirmation("");
      await load();
    } catch {
      setDeleteError("Ошибка сети или сервера");
    } finally {
      setDeleteBusy(false);
    }
  }

  function renderCard(order: CleanupOrderRow, kind: "root" | "child") {
    const checked = selectedIds.has(order.id);
    return (
      <div
        key={order.id}
        className={[
          "rounded-2xl border bg-white shadow-sm",
          checked ? "border-red-300 ring-1 ring-red-200" : "border-zinc-200",
          kind === "child" ? "ml-8" : "",
        ].join(" ")}
      >
        <div className="flex items-start gap-3 p-4">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleOrder(order.id)}
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-400"
            aria-label={`Выбрать заявку ${order.id}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-zinc-900">{order.customerName}</div>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700">
                {STATUS_LABEL[order.status]}
              </span>
              <span
                className={[
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  order.source === "GREENWICH_INTERNAL"
                    ? "border-violet-200 bg-violet-50 text-violet-800"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700",
                ].join(" ")}
              >
                {order.source === "GREENWICH_INTERNAL" ? "Grinvich" : "Внешняя"}
              </span>
              {order.parentOrderId ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                  Quick supplement
                </span>
              ) : null}
              {order.projectId ? (
                <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                  Project-linked
                </span>
              ) : null}
              {order.hasEstimateFile ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Есть смета
                </span>
              ) : null}
            </div>

            <div className="mt-2 text-sm text-zinc-600">
              Готовность: <span className="font-semibold">{formatDateRu(order.readyByDate)}</span> · Период:{" "}
              <span className="font-semibold">{formatDateRu(order.startDate)}</span> —{" "}
              <span className="font-semibold">{formatDateRu(order.endDate)}</span>
            </div>

            <div className="mt-1 text-sm text-zinc-600">
              Сумма: <span className="font-semibold">{order.totalAmount.toLocaleString("ru-RU")} ₽</span>
              {order.greenwichUserName ? <> · сотрудник: <span className="font-semibold">{order.greenwichUserName}</span></> : null}
            </div>

            {order.eventName ? (
              <div className="mt-1 text-sm text-zinc-600">
                Мероприятие: <span className="font-semibold">{order.eventName}</span>
              </div>
            ) : null}
            {order.projectTitle ? (
              <div className="mt-1 text-sm text-red-700">
                Проект: <span className="font-semibold">{order.projectTitle}</span>
              </div>
            ) : null}

            <div className="mt-3">
              <Link
                href={`/orders/${order.id}?from=warehouse-queue`}
                className="text-sm font-medium text-violet-700 hover:text-violet-900"
              >
                Открыть заявку
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell title="Админка · Очистка заявок">
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              ← Админка
            </Link>
            <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
              Опасная операция: hard delete тестовых заявок
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
            <div className="text-sm text-zinc-700">
              Инструмент полностью удаляет выбранные заявки из БД вместе с quick supplements и зависимостями.
              Заявки, привязанные к проектам, в этой версии только показываются и блокируют удаление.
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Поиск</span>
                <input
                  type="search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Заказчик, ID, мероприятие, сотрудник"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex min-w-[180px] flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Источник</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[190px] flex-col gap-1">
                <span className="text-xs font-semibold text-zinc-500">Сортировка</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setFiltersOpen((value) => !value)}
                className="text-sm font-medium text-violet-800 hover:text-violet-950"
              >
                {filtersOpen ? "▼ Скрыть фильтр по статусам" : "► Фильтр по статусам"}
              </button>
              {filtersOpen ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <label
                      key={status.value}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-1.5 text-xs hover:bg-red-50"
                    >
                      <input
                        type="checkbox"
                        checked={statusSet.has(status.value)}
                        onChange={() => toggleStatus(status.value)}
                        className="rounded border-zinc-300"
                      />
                      {status.label}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Выбор заявок</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Загружено {orders.length} заявок. Можно выбрать основную заявку, и её quick supplements подтянутся в удаление автоматически.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Выбрать все видимые
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Сбросить выбор
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-zinc-600">Загрузка…</div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-sm text-zinc-600">Нет заявок по текущим фильтрам.</div>
            ) : (
              <div className="space-y-4">
                {grouped.map(({ root, children }) => (
                  <div key={root.id} className="rounded-3xl border border-zinc-200/80 bg-zinc-50/40 p-2">
                    {renderCard(root, "root")}
                    {children.length > 0 ? (
                      <div className="mt-2 space-y-2 border-l-2 border-amber-300/70 pl-2">
                        {children.map((child) => renderCard(child, "child"))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-red-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(254,242,242,0.96))] p-4 shadow-sm space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Предпросмотр удаления</div>
              <div className="mt-1 text-xs text-zinc-600">
                Выбрано вручную: {selectedIds.size}. В удаление пойдут и все автоматически подхваченные quick supplements.
              </div>
            </div>

            {preview ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Всего заявок</div>
                  <div className="text-lg font-bold text-zinc-900">{preview.totalOrdersToDelete}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Основных / доп.</div>
                  <div className="text-lg font-bold text-zinc-900">
                    {preview.rootOrdersToDelete} / {preview.quickSupplementsToDelete}
                  </div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Автоподхвачено доп.</div>
                  <div className="text-lg font-bold text-zinc-900">{preview.autoIncludedQuickSupplementCount}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Строк заявки</div>
                  <div className="text-lg font-bold text-zinc-900">{preview.linesCount}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Return splits</div>
                  <div className="text-lg font-bold text-zinc-900">{preview.returnSplitsCount}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Инциденты</div>
                  <div className="text-lg font-bold text-zinc-900">{preview.incidentsCount}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Напоминания</div>
                  <div className="text-lg font-bold text-zinc-900">{preview.remindersCount}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-white px-3 py-2">
                  <div className="text-xs text-zinc-500">Loss records / сметные ссылки</div>
                  <div className="text-sm font-bold text-zinc-900">
                    {preview.lossRecordsAffectedCount} / {preview.projectEstimateSectionsAffectedCount + preview.projectEstimateLinesAffectedCount}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-600">Выбери одну или несколько заявок, чтобы увидеть точный объём удаления.</div>
            )}

            {preview?.missingOrderIds.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Некоторые выбранные ID уже не существуют: {preview.missingOrderIds.join(", ")}
              </div>
            ) : null}

            {previewBlocked ? (
              <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
                Удаление заблокировано: среди выбора есть project-linked заявки.
                <div className="mt-2 space-y-1">
                  {preview?.blockingProjectLinkedOrders.map((order) => (
                    <div key={order.id}>
                      {order.customerName} · {order.id.slice(0, 8)} · {order.projectTitle ?? order.projectId}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {success}
              </div>
            ) : null}
            {deleteError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {deleteError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-red-100 pt-4 md:flex-row md:items-end md:justify-between">
              <label className="flex min-w-[260px] flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  Для подтверждения введи DELETE
                </span>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm"
                  placeholder="DELETE"
                />
              </label>
              <button
                type="button"
                disabled={!canDelete}
                onClick={() => void deleteSelected()}
                className="rounded-xl border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? "Удаляем…" : "Удалить выбранные заявки"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
