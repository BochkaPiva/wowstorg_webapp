"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";
import { formatRentalPeriodRangeRu, type RentalPartOfDay } from "@/lib/rental-days";

import "./queue.css";

type QueueLine = {
  id: string;
  itemId: string;
  itemName: string;
  requestedQty: number;
  approvedQty: number | null;
  issuedQty: number | null;
};

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
  taxAmount?: number;
  discount?: { type: "PERCENT" | "AMOUNT" | "NONE"; percent: number | null; amount: number } | null;
  project?: { id: string; title: string } | null;
  lines?: QueueLine[];
  services?: Array<{ label: string; amount: number }>;
};

const STATUS_OPTIONS = [
  { value: "SUBMITTED", label: "Новые" },
  { value: "ESTIMATE_SENT", label: "Смета отправлена" },
  { value: "CHANGES_REQUESTED", label: "Нужны изменения" },
  { value: "APPROVED_BY_GREENWICH", label: "Согласованы" },
  { value: "PICKING", label: "На сборке" },
  { value: "ISSUED", label: "Выданы" },
  { value: "RETURN_DECLARED", label: "На приёмке" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Новая",
  ESTIMATE_SENT: "Смета отправлена",
  CHANGES_REQUESTED: "Нужны изменения",
  APPROVED_BY_GREENWICH: "Согласована",
  PICKING: "Сборка",
  ISSUED: "Выдана",
  RETURN_DECLARED: "Приёмка",
  CLOSED: "Закрыта",
  CANCELLED: "Отменена",
};

const ACTIVE_SORT_OPTIONS = [
  { value: "smart", label: "Сначала требующие действия" },
  { value: "readyBy_asc", label: "Срок готовности: сначала ближайшие" },
  { value: "readyBy_desc", label: "Срок готовности: сначала дальние" },
  { value: "startDate_asc", label: "Дата аренды: сначала ближайшие" },
  { value: "startDate_desc", label: "Дата аренды: сначала дальние" },
  { value: "created_desc", label: "Сначала новые" },
  { value: "created_asc", label: "Сначала старые" },
] as const;

const ARCHIVE_SORT_OPTIONS = [
  { value: "updated_desc", label: "Сначала недавно закрытые" },
  { value: "updated_asc", label: "Сначала давно закрытые" },
] as const;

const SOURCE_OPTIONS = [
  { value: "all", label: "Все источники" },
  { value: "GREENWICH_INTERNAL", label: "Greenwich" },
  { value: "WOWSTORG_EXTERNAL", label: "Внешние" },
] as const;

const DEFAULT_SORT = "smart";
const ARCHIVE_DEFAULT_SORT = "updated_desc";

function fmtDateRu(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function periodLine(order: QueueOrder): string {
  return formatRentalPeriodRangeRu({
    startDateIso: order.startDate.slice(0, 10),
    endDateIso: order.endDate.slice(0, 10),
    startDateFormatted: fmtDateRu(order.startDate),
    endDateFormatted: fmtDateRu(order.endDate),
    rentalStartPartOfDay: order.rentalStartPartOfDay ?? undefined,
    rentalEndPartOfDay: order.rentalEndPartOfDay ?? undefined,
  });
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function parseStatusSet(raw: string | null): Set<string> {
  const all = new Set(STATUS_OPTIONS.map((option) => option.value));
  if (!raw?.trim()) return all;
  const selected = new Set(raw.split(",").map((value) => value.trim()).filter(Boolean));
  return selected.size ? selected : all;
}

function buildQueueQuery(args: { sort: string; q: string; source: string; statusSet: Set<string> }) {
  const params = new URLSearchParams();
  if (args.sort !== DEFAULT_SORT) params.set("sort", args.sort);
  if (args.q.trim()) params.set("q", args.q.trim());
  if (args.source !== "all") params.set("source", args.source);
  if (args.statusSet.size !== STATUS_OPTIONS.length) {
    params.set("status", [...args.statusSet].sort().join(","));
  }
  return params.toString();
}

function buildArchiveQuery(args: { sort: string; q: string; source: string; status: string }) {
  const params = new URLSearchParams();
  if (args.sort !== ARCHIVE_DEFAULT_SORT) params.set("sort", args.sort);
  if (args.q.trim()) params.set("q", args.q.trim());
  if (args.source !== "all") params.set("source", args.source);
  if (args.status !== "all") params.set("status", args.status);
  return params.toString();
}

type QuickAction = { endpoint: string; label: string; confirm: string };

function quickActionFor(order: QueueOrder): QuickAction | null {
  if (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED") {
    return { endpoint: "send-estimate", label: "Отправить смету", confirm: "Сформировать и отправить смету?" };
  }
  if (order.status === "APPROVED_BY_GREENWICH") {
    return { endpoint: "start-picking", label: "Начать сборку", confirm: "Перевести заявку на сборку?" };
  }
  if (order.status === "PICKING") {
    return { endpoint: "issue", label: "Выдать", confirm: "Подтвердить выдачу всех позиций?" };
  }
  if (order.status === "ISSUED" && !order.greenwichUser) {
    return { endpoint: "return-declared", label: "На приёмку", confirm: "Отправить заявку на приёмку?" };
  }
  return null;
}

async function responseError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? `Ошибка ${response.status}`;
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
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [actionConfirmId, setActionConfirmId] = React.useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [noteValue, setNoteValue] = React.useState("");
  const [noteBusy, setNoteBusy] = React.useState(false);
  const [sort, setSort] = React.useState(
    () => searchParams.get("sort") || (searchParams.get("tab") === "archive" ? ARCHIVE_DEFAULT_SORT : DEFAULT_SORT),
  );
  const [qInput, setQInput] = React.useState(() => searchParams.get("q") ?? "");
  const [qDebounced, setQDebounced] = React.useState(() => searchParams.get("q") ?? "");
  const [source, setSource] = React.useState(() => searchParams.get("source") || "all");
  const [statusSet, setStatusSet] = React.useState(() => parseStatusSet(searchParams.get("status")));
  const [archiveStatus, setArchiveStatus] = React.useState(() => searchParams.get("status") || "all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQDebounced(qInput), 240);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const loadOrders = React.useCallback(async (showLoading = true) => {
    if (state.status !== "authenticated" || role !== "WOWSTORG") return;
    const query = tab === "archive"
      ? buildArchiveQuery({ sort, q: qDebounced, source, status: archiveStatus })
      : buildQueueQuery({ sort, q: qDebounced, source, statusSet });
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/warehouse/${tab === "archive" ? "archive" : "queue"}${query ? `?${query}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const data = (await response.json()) as { orders?: QueueOrder[] };
      setOrders(data.orders ?? []);
    } catch (error) {
      setOrders([]);
      setLoadError(error instanceof Error ? error.message : "Не удалось загрузить очередь");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [state.status, role, tab, sort, qDebounced, source, archiveStatus, statusSet]);

  React.useEffect(() => {
    void loadOrders();
    const query = tab === "archive"
      ? buildArchiveQuery({ sort, q: qDebounced, source, status: archiveStatus })
      : buildQueueQuery({ sort, q: qDebounced, source, statusSet });
    const pageQuery = new URLSearchParams(query);
    if (tab === "archive") pageQuery.set("tab", "archive");
    router.replace(pageQuery.size ? `${pathname}?${pageQuery}` : pathname, { scroll: false });
  }, [loadOrders, tab, sort, qDebounced, source, archiveStatus, statusSet, pathname, router]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function runQuickAction(order: QueueOrder, action: QuickAction) {
    setActionBusyId(order.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/${action.endpoint}`, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      setActionConfirmId(null);
      setNotice(`${order.customer.name}: ${action.label.toLowerCase()} — готово`);
      await loadOrders(false);
    } catch (error) {
      setActionError({ id: order.id, message: error instanceof Error ? error.message : "Действие не выполнено" });
    } finally {
      setActionBusyId(null);
    }
  }

  async function saveNote(orderId: string) {
    setNoteBusy(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/internal-note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteValue.trim() || null }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setEditingNoteId(null);
      setNotice("Комментарий сохранён");
      await loadOrders(false);
    } catch (error) {
      setActionError({ id: orderId, message: error instanceof Error ? error.message : "Комментарий не сохранён" });
    } finally {
      setNoteBusy(false);
    }
  }

  function toggleStatus(value: string) {
    setStatusSet((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        if (next.size > 1) next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  const grouped = React.useMemo(() => {
    const byId = new Map(orders.map((order) => [order.id, order]));
    const children = new Map<string, QueueOrder[]>();
    for (const order of orders) {
      if (!order.parentOrderId) continue;
      children.set(order.parentOrderId, [...(children.get(order.parentOrderId) ?? []), order]);
    }
    return orders
      .filter((order) => !order.parentOrderId || !byId.has(order.parentOrderId))
      .map((root) => ({ root, children: children.get(root.id) ?? [] }));
  }, [orders]);

  function renderOrder(order: QueueOrder, child = false) {
    const expanded = expandedId === order.id;
    const action = tab === "active" ? quickActionFor(order) : null;
    const confirming = actionConfirmId === order.id;
    const lineCount = order.lines?.length ?? 0;
    const sourceLabel = order.source === "WOWSTORG_EXTERNAL" ? "Внешняя" : "Greenwich";

    return (
      <article key={order.id} className="queue-order" data-expanded={expanded || undefined} data-child={child || undefined}>
        <div className="queue-order__summary">
          <button
            type="button"
            className="queue-order__toggle"
            onClick={() => {
              setExpandedId(expanded ? null : order.id);
              setActionConfirmId(null);
              setActionError(null);
            }}
            aria-expanded={expanded}
            aria-controls={`queue-preview-${order.id}`}
          >
            <span className="queue-order__chevron" aria-hidden="true">⌄</span>
            <span className="queue-order__identity">
              <strong>{order.customer.name}</strong>
              <span>{sourceLabel}{order.project ? ` · ${order.project.title}` : ""}</span>
            </span>
            <span className="queue-status" data-status={order.status}>{STATUS_LABEL[order.status] ?? order.status}</span>
            <span className="queue-order__date">
              <small>Готовность</small>
              <strong>{fmtDateRu(order.readyByDate)}</strong>
            </span>
            <span className="queue-order__period">
              <small>Аренда</small>
              <strong>{periodLine(order)}</strong>
            </span>
            <span className="queue-order__amount">{order.totalAmount != null ? formatMoney(order.totalAmount) : "—"}</span>
          </button>

          <div className="queue-order__actions">
            {action ? (
              <button type="button" className="queue-button queue-button--primary" onClick={() => setActionConfirmId(confirming ? null : order.id)}>
                {action.label}
              </button>
            ) : null}
            <Link href={`/orders/${order.id}?from=warehouse-queue`} className="queue-button queue-button--quiet">Открыть</Link>
          </div>
        </div>

        {confirming && action ? (
          <div className="queue-confirm" role="group" aria-label="Подтверждение действия">
            <span>{action.confirm}</span>
            <button type="button" disabled={actionBusyId === order.id} onClick={() => void runQuickAction(order, action)}>
              {actionBusyId === order.id ? "Выполняю…" : "Подтвердить"}
            </button>
            <button type="button" className="queue-confirm__cancel" onClick={() => setActionConfirmId(null)}>Отмена</button>
          </div>
        ) : null}

        {actionError?.id === order.id ? <div className="queue-inlineError" role="alert">{actionError.message}</div> : null}

        <div id={`queue-preview-${order.id}`} className="queue-order__reveal" aria-hidden={!expanded}>
          <div className="queue-order__revealInner">
            <div className="queue-preview">
              <section className="queue-preview__main">
                <div className="queue-preview__heading">
                  <div>
                    <h3>Состав заявки</h3>
                    <p>{lineCount ? `${lineCount} позиций` : "Состав доступен в полной карточке"}</p>
                  </div>
                  <span>ID {order.id.slice(0, 8)}</span>
                </div>
                {lineCount ? (
                  <div className="queue-lines">
                    {order.lines!.slice(0, 7).map((line) => (
                      <div key={line.id} className="queue-line">
                        <span>{line.itemName}</span>
                        <strong>× {line.issuedQty ?? line.approvedQty ?? line.requestedQty}</strong>
                      </div>
                    ))}
                    {lineCount > 7 ? <div className="queue-lines__more">Ещё {lineCount - 7} — в полной карточке</div> : null}
                  </div>
                ) : null}
              </section>

              <aside className="queue-preview__aside">
                <dl className="queue-facts">
                  <div><dt>Ответственный</dt><dd>{order.greenwichUser?.displayName ?? "Склад"}</dd></div>
                  <div><dt>Создана</dt><dd>{fmtDateRu(order.createdAt)}</dd></div>
                  {order.services?.length ? (
                    <div><dt>Услуги</dt><dd>{order.services.map((service) => service.label).join(", ")}</dd></div>
                  ) : null}
                  {order.discount?.amount ? <div><dt>Скидка</dt><dd>{formatMoney(order.discount.amount)}</dd></div> : null}
                  {order.taxAmount ? <div><dt>Налог</dt><dd>{formatMoney(order.taxAmount)}</dd></div> : null}
                </dl>

                {order.warehouseInternalNote ? (
                  <div className="queue-note"><strong>Комментарий</strong><span>{order.warehouseInternalNote}</span></div>
                ) : null}

                <div className="queue-preview__links">
                  <button
                    type="button"
                    className="queue-textButton"
                    onClick={() => {
                      setEditingNoteId(editingNoteId === order.id ? null : order.id);
                      setNoteValue(order.warehouseInternalNote ?? "");
                    }}
                  >
                    {order.warehouseInternalNote ? "Изменить комментарий" : "Добавить комментарий"}
                  </button>
                  {order.status === "RETURN_DECLARED" ? (
                    <Link href={`/orders/${order.id}?from=warehouse-queue#check-in`} className="queue-textButton">Открыть приёмку →</Link>
                  ) : null}
                </div>
              </aside>
            </div>

            {editingNoteId === order.id ? (
              <div className="queue-noteEditor">
                <label htmlFor={`note-${order.id}`}>Внутренний комментарий</label>
                <textarea id={`note-${order.id}`} value={noteValue} onChange={(event) => setNoteValue(event.target.value)} rows={3} autoFocus />
                <div>
                  <button type="button" disabled={noteBusy} onClick={() => void saveNote(order.id)}>{noteBusy ? "Сохраняю…" : "Сохранить"}</button>
                  <button type="button" className="queue-noteEditor__cancel" onClick={() => setEditingNoteId(null)}>Отмена</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <AppShell title="Очередь заявок">
      {forbidden ? (
        <div className="queue-empty">Этот раздел доступен только сотрудникам Wowstorg.</div>
      ) : (
        <div className="queue-page">
          <header className="queue-toolbar">
            <div className="queue-toolbar__top">
              <div>
                <h2>Очередь заявок</h2>
                <p>{loading ? "Обновляем…" : `${orders.length} ${orders.length === 1 ? "заявка" : "заявок"}`}</p>
              </div>
              <div className="queue-tabs" role="tablist" aria-label="Область заявок">
                <button type="button" role="tab" aria-selected={tab === "active"} onClick={() => { setTab("active"); setSort(DEFAULT_SORT); }}>Активные</button>
                <button type="button" role="tab" aria-selected={tab === "archive"} onClick={() => { setTab("archive"); setSort(ARCHIVE_DEFAULT_SORT); }}>Архив</button>
              </div>
            </div>

            <div className="queue-filters">
              <label className="queue-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="Клиент, сотрудник или ID" aria-label="Поиск заявок" />
              </label>
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка">
                {(tab === "archive" ? ARCHIVE_SORT_OPTIONS : ACTIVE_SORT_OPTIONS).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="Источник">
                {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {tab === "archive" ? (
                <select value={archiveStatus} onChange={(event) => setArchiveStatus(event.target.value)} aria-label="Статус">
                  <option value="all">Все статусы</option>
                  <option value="CLOSED">Закрытые</option>
                  <option value="CANCELLED">Отменённые</option>
                </select>
              ) : (
                <button type="button" className="queue-filterToggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
                  Статусы <span>{statusSet.size}/{STATUS_OPTIONS.length}</span>
                </button>
              )}
            </div>

            {tab === "active" && filtersOpen ? (
              <div className="queue-statusFilters">
                {STATUS_OPTIONS.map((option) => (
                  <button key={option.value} type="button" aria-pressed={statusSet.has(option.value)} onClick={() => toggleStatus(option.value)}>{option.label}</button>
                ))}
                <button type="button" className="queue-statusFilters__reset" onClick={() => setStatusSet(new Set(STATUS_OPTIONS.map((option) => option.value)))}>Все</button>
              </div>
            ) : null}
          </header>

          {notice ? <div className="queue-notice" role="status">{notice}</div> : null}
          {loadError ? <div className="queue-error" role="alert">{loadError}<button type="button" onClick={() => void loadOrders()}>Повторить</button></div> : null}

          {loading ? (
            <div className="queue-skeleton" aria-label="Загрузка заявок">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
          ) : !loadError && !orders.length ? (
            <div className="queue-empty"><strong>Заявок не найдено</strong><span>Измените поиск или фильтры.</span></div>
          ) : (
            <div className="queue-list">
              {grouped.map(({ root, children }) => (
                <div key={root.id} className="queue-family">
                  {renderOrder(root)}
                  {children.length ? <div className="queue-family__children">{children.map((child) => renderOrder(child, true))}</div> : null}
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
    <React.Suspense fallback={<AppShell title="Очередь заявок"><div className="queue-empty">Загрузка…</div></AppShell>}>
      <WarehouseQueueContent />
    </React.Suspense>
  );
}
