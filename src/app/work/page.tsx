"use client";

import Link from "next/link";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { useAuth } from "@/app/providers";

import "./work.css";

type Phase =
  | "NEW"
  | "ESTIMATING"
  | "WAITING_CLIENT"
  | "APPROVED"
  | "PREPARING"
  | "IN_PROGRESS"
  | "CLOSING"
  | "DONE"
  | "PAUSED"
  | "CANCELLED";

type ProjectStatus =
  | "LEAD"
  | "BRIEFING"
  | "INTERNAL_PREP"
  | "PROPOSAL_SENT"
  | "PROPOSAL_REVISION"
  | "CONTRACT_PREP"
  | "CONTRACT_SENT"
  | "CONTRACT_SIGNED"
  | "PREPRODUCTION"
  | "AWAITING_CLIENT_INPUT"
  | "AWAITING_VENDOR"
  | "READY_TO_RUN"
  | "LIVE"
  | "WRAP_UP"
  | "COMPLETED"
  | "ON_HOLD"
  | "CANCELLED";

type WorkOrder = {
  id: string;
  status: OrderStatus;
  phase: Phase;
  source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  title: string;
  readyByDate: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  note?: string | null;
  lines: Array<{ id: string; name: string; requestedQty: number; approvedQty: number | null; issuedQty: number | null }>;
  linesCount: number;
};

type WorkItem = {
  key: string;
  id: string;
  kind: "PROJECT" | "STANDALONE_ORDER" | "ESTIMATE_ONLY";
  title: string;
  phase: Phase;
  status: string;
  ball: string;
  customer: { id: string; name: string; logoUrl: string | null } | null;
  customerFallback: string | null;
  owner: { id: string; displayName: string };
  startDate: string | null;
  endDate: string | null;
  readyByDate?: string | null;
  dateConfirmed: boolean;
  blockers: string | null;
  summary: string | null;
  estimate: { id: string; versionNumber: number; title: string | null } | null;
  orders: WorkOrder[];
  ordersCount: number;
  tasksCount: number;
  totalAmount: number;
  updatedAt: string;
};

type QueuePayload = {
  items: WorkItem[];
  meta: {
    total: number;
    projects: number;
    standaloneOrders: number;
    estimates: number;
    undated: number;
    from: string;
    to: string;
  };
};

type ProjectPreview = {
  id: string;
  status: ProjectStatus;
  archived: boolean;
  counts: { contacts: number; tasks: number; orders: number };
  contacts: Array<{
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    category: string;
    roleNote: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueDate: string | null;
    completedAt: string | null;
    assignee: { displayName: string } | null;
    column: { title: string; isDone: boolean };
  }>;
  estimate: {
    id: string;
    versionNumber: number;
    title: string;
    financials: {
      revenueTotal: number;
      internalSubtotal: number;
      marginAfterTax: number;
      marginAfterTaxPct: number;
    };
  } | null;
};

type SavedView = {
  id: string;
  name: string;
  view: (typeof VIEW_OPTIONS)[number]["value"];
  kind: "all" | "project" | "order" | "estimate";
  phase: "all" | Phase;
  from: string;
  to: string;
  sort: SortMode;
};

type SortMode = "priority" | "date" | "updated" | "amount";

const VIEW_OPTIONS = [
  { value: "attention", label: "Нужно внимание" },
  { value: "month", label: "Текущий месяц" },
  { value: "undated", label: "Без даты" },
  { value: "estimates", label: "Расчёты" },
  { value: "warehouse", label: "Склад" },
  { value: "all", label: "Период" },
] as const;

const PHASE_LABEL: Record<Phase, string> = {
  NEW: "Новая работа",
  ESTIMATING: "Считаем",
  WAITING_CLIENT: "Ждём клиента",
  APPROVED: "Согласовано",
  PREPARING: "Подготовка",
  IN_PROGRESS: "На площадке",
  CLOSING: "Закрываем",
  DONE: "Завершено",
  PAUSED: "Пауза",
  CANCELLED: "Отменено",
};

const KIND_LABEL: Record<WorkItem["kind"], string> = {
  PROJECT: "Проект",
  STANDALONE_ORDER: "Заявка",
  ESTIMATE_ONLY: "Расчёт",
};

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  LEAD: "Лид / первичный запрос",
  BRIEFING: "Сбор брифа",
  INTERNAL_PREP: "Внутренняя подготовка",
  PROPOSAL_SENT: "Смета отправлена",
  PROPOSAL_REVISION: "Правки сметы",
  CONTRACT_PREP: "Подготовка договора",
  CONTRACT_SENT: "Договор отправлен",
  CONTRACT_SIGNED: "Договор подписан",
  PREPRODUCTION: "Предпродакшн",
  AWAITING_CLIENT_INPUT: "Ждём клиента",
  AWAITING_VENDOR: "Ждём подрядчика",
  READY_TO_RUN: "Готово к проведению",
  LIVE: "На площадке",
  WRAP_UP: "Закрытие",
  COMPLETED: "Завершён",
  ON_HOLD: "Пауза",
  CANCELLED: "Отменён",
};

const PROJECT_STATUS_OPTIONS = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[];

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function dateRu(value: string | null | undefined) {
  if (!value) return "Без даты";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function period(item: WorkItem) {
  if (!item.startDate) return "Дата не назначена";
  if (!item.endDate || item.endDate === item.startDate) return dateRu(item.startDate);
  return `${dateRu(item.startDate)} — ${dateRu(item.endDate)}`;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru"))
    .join("");
}

function quickAction(order: WorkOrder) {
  if (order.status === "SUBMITTED" || order.status === "CHANGES_REQUESTED") {
    return {
      endpoint: "send-estimate",
      label: "Отправить смету",
      confirm: "Сформировать и отправить смету клиенту?",
    };
  }
  if (order.status === "APPROVED_BY_GREENWICH") {
    return {
      endpoint: "start-picking",
      label: "Начать сборку",
      confirm: "Перевести заявку на этап сборки?",
    };
  }
  if (order.status === "PICKING") {
    return {
      endpoint: "issue",
      label: "Выдать",
      confirm: "Подтвердить выдачу всех согласованных позиций?",
    };
  }
  if (order.status === "ISSUED" && order.source === "WOWSTORG_EXTERNAL") {
    return {
      endpoint: "return-declared",
      label: "На приёмку",
      confirm: "Перевести заявку на этап приёмки?",
    };
  }
  return null;
}

async function responseMessage(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? `Ошибка ${response.status}`;
}

export default function WorkQueuePage() {
  const { state } = useAuth();
  const forbidden = state.status === "authenticated" && state.user.role !== "WOWSTORG";
  const [payload, setPayload] = React.useState<QueuePayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [view, setView] = React.useState<(typeof VIEW_OPTIONS)[number]["value"]>("attention");
  const [queryInput, setQueryInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<"all" | "project" | "order" | "estimate">("all");
  const [phase, setPhase] = React.useState<"all" | Phase>("all");
  const [from, setFrom] = React.useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [to, setTo] = React.useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  });
  const [sort, setSort] = React.useState<SortMode>("priority");
  const [savedViews, setSavedViews] = React.useState<SavedView[]>([]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [previews, setPreviews] = React.useState<Record<string, ProjectPreview>>({});
  const [previewBusy, setPreviewBusy] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState("");
  const [createCustomer, setCreateCustomer] = React.useState("");
  const [convertItem, setConvertItem] = React.useState<WorkItem | null>(null);
  const [convertCustomer, setConvertCustomer] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmOrder, setConfirmOrder] = React.useState<WorkOrder | null>(null);
  const [projectAction, setProjectAction] = React.useState<WorkItem | null>(null);
  const [projectStatus, setProjectStatus] = React.useState<ProjectStatus>("LEAD");
  const [projectArchiveNote, setProjectArchiveNote] = React.useState("");

  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem("wowstorg.work.saved-views.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedView[];
      if (Array.isArray(parsed)) setSavedViews(parsed.slice(0, 8));
    } catch {
      // Повреждённое локальное представление не должно ломать очередь.
    }
  }, []);

  const load = React.useCallback(async () => {
    if (forbidden) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ view, kind });
    if (query) params.set("q", query);
    if (phase !== "all") params.set("phase", phase);
    if (view === "all" || view === "month" || view === "warehouse") {
      params.set("from", from);
      params.set("to", to);
    }
    try {
      const response = await fetch(`/api/work-queue?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setPayload((await response.json()) as QueuePayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить очередь");
    } finally {
      setLoading(false);
    }
  }, [forbidden, from, kind, phase, query, to, view]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function loadPreview(item: WorkItem) {
    if (item.kind === "STANDALONE_ORDER" || previews[item.id]) return;
    setPreviewBusy(item.id);
    try {
      const response = await fetch(`/api/work-queue/projects/${item.id}/preview`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = (await response.json()) as { project: ProjectPreview };
      setPreviews((current) => ({ ...current, [item.id]: data.project }));
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Не удалось загрузить быстрый просмотр проекта",
      );
    } finally {
      setPreviewBusy((current) => (current === item.id ? null : current));
    }
  }

  function toggle(item: WorkItem) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      setConfirmOrder(null);
      return next;
    });
    if (!expanded.has(item.key)) void loadPreview(item);
  }

  function persistSavedViews(next: SavedView[]) {
    setSavedViews(next);
    window.localStorage.setItem("wowstorg.work.saved-views.v1", JSON.stringify(next));
  }

  function saveCurrentView() {
    const fallback = `Вид ${savedViews.length + 1}`;
    const name = window.prompt("Название сохранённого вида", fallback)?.trim();
    if (!name) return;
    const next: SavedView = {
      id: `${Date.now()}`,
      name,
      view,
      kind,
      phase,
      from,
      to,
      sort,
    };
    persistSavedViews([next, ...savedViews].slice(0, 8));
  }

  function applySavedView(saved: SavedView) {
    setView(saved.view);
    setKind(saved.kind);
    setPhase(saved.phase);
    setFrom(saved.from);
    setTo(saved.to);
    setSort(saved.sort);
  }

  async function updateProject(event: React.FormEvent) {
    event.preventDefault();
    if (!projectAction) return;
    const terminal = projectStatus === "COMPLETED" || projectStatus === "CANCELLED";
    setBusy(`project:${projectAction.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectAction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: projectStatus,
          ...(terminal
            ? {
                archive: true,
                archiveNote: projectArchiveNote.trim() || null,
              }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setNotice(
        terminal
          ? `Проект «${projectAction.title}» переведён в «${PROJECT_STATUS_LABEL[projectStatus]}» и убран в архив.`
          : `Проект «${projectAction.title}»: ${PROJECT_STATUS_LABEL[projectStatus]}.`,
      );
      setProjectAction(null);
      setProjectArchiveNote("");
      setPreviews((current) => {
        const next = { ...current };
        delete next[projectAction.id];
        return next;
      });
      await load();
    } catch (projectError) {
      setError(
        projectError instanceof Error ? projectError.message : "Не удалось изменить статус проекта",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createEstimate(event: React.FormEvent) {
    event.preventDefault();
    if (!createTitle.trim()) return;
    setBusy("create");
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle.trim(),
          customerName: createCustomer.trim() || undefined,
          mode: "ESTIMATE_ONLY",
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setCreateTitle("");
      setCreateCustomer("");
      setCreateOpen(false);
      setView("estimates");
      setNotice("Расчёт создан. Смета и demo-реквизит сохранятся при преобразовании в проект.");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать расчёт");
    } finally {
      setBusy(null);
    }
  }

  async function runOrderAction(order: WorkOrder) {
    const action = quickAction(order);
    if (!action) return;
    setBusy(order.id);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/${action.endpoint}`, { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setNotice(`Заявка «${order.title}»: ${action.label.toLocaleLowerCase("ru")}.`);
      setConfirmOrder(null);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Действие не выполнено");
    } finally {
      setBusy(null);
    }
  }

  async function convertEstimate(event: React.FormEvent) {
    event.preventDefault();
    if (!convertItem || !convertCustomer.trim()) return;
    setBusy(`convert:${convertItem.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${convertItem.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: convertCustomer.trim() }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setNotice(`«${convertItem.title}» преобразован в полноценный проект. Смета и история сохранены.`);
      setConvertItem(null);
      setConvertCustomer("");
      await load();
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Не удалось преобразовать расчёт");
    } finally {
      setBusy(null);
    }
  }

  const confirmAction = confirmOrder ? quickAction(confirmOrder) : null;
  const groupedItems = React.useMemo(() => {
    const source = [...(payload?.items ?? [])];
    if (sort === "date") {
      source.sort((a, b) => (a.startDate ?? "9999-12-31").localeCompare(b.startDate ?? "9999-12-31"));
    } else if (sort === "updated") {
      source.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (sort === "amount") {
      source.sort((a, b) => b.totalAmount - a.totalAmount);
    }

    const groups = new Map<string, WorkItem[]>();
    for (const item of source) {
      const key = item.startDate?.slice(0, 7) ?? "undated";
      const rows = groups.get(key) ?? [];
      rows.push(item);
      groups.set(key, rows);
    }
    return [...groups.entries()].map(([key, items]) => ({
      key,
      title:
        key === "undated"
          ? "Без подтверждённой даты"
          : new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
              new Date(`${key}-01T00:00:00`),
            ),
      items,
    }));
  }, [payload, sort]);

  return (
    <AppShell title="Рабочая очередь">
      {forbidden ? (
        <div className="work-empty">Раздел доступен только команде Wowstorg.</div>
      ) : (
        <div className="work-page">
          <header className="work-hero">
            <div>
              <span className="work-eyebrow">Операционный центр</span>
              <h2>Вся работа — в одной очереди</h2>
              <p>Проекты, самостоятельные заявки и предварительные расчёты без дублей.</p>
            </div>
            <button type="button" className="work-primary" onClick={() => setCreateOpen(true)}>
              Составить смету
            </button>
          </header>

          <section className="work-controls" aria-label="Фильтры рабочей очереди">
            <div className="work-presets">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={view === option.value || undefined}
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="work-savedViews">
              <span>Мои виды</span>
              {savedViews.length === 0 ? <small>Сохраните часто используемый набор фильтров</small> : null}
              {savedViews.map((saved) => (
                <span key={saved.id} className="work-savedView">
                  <button type="button" onClick={() => applySavedView(saved)}>{saved.name}</button>
                  <button
                    type="button"
                    aria-label={`Удалить вид ${saved.name}`}
                    onClick={() => persistSavedViews(savedViews.filter((item) => item.id !== saved.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button type="button" className="work-saveView" onClick={saveCurrentView}>
                + Сохранить текущий вид
              </button>
            </div>
            <div className="work-filters">
              <label className="work-search">
                <span>Поиск</span>
                <input
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder="Клиент, проект, заявка или сотрудник"
                />
              </label>
              <label>
                <span>Тип</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                  <option value="all">Вся работа</option>
                  <option value="project">Проекты</option>
                  <option value="order">Заявки</option>
                  <option value="estimate">Расчёты</option>
                </select>
              </label>
              <label>
                <span>Этап</span>
                <select value={phase} onChange={(event) => setPhase(event.target.value as typeof phase)}>
                  <option value="all">Все этапы</option>
                  {(Object.keys(PHASE_LABEL) as Phase[]).map((value) => (
                    <option key={value} value={value}>{PHASE_LABEL[value]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Сортировка</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
                  <option value="priority">Сначала требующие внимания</option>
                  <option value="date">По дате события</option>
                  <option value="updated">По последнему изменению</option>
                  <option value="amount">По сумме</option>
                </select>
              </label>
              {(view === "all" || view === "month" || view === "warehouse") ? (
                <>
                  <label><span>С</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                  <label><span>По</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
                </>
              ) : null}
            </div>
            {payload ? (
              <div className="work-meta" aria-label="Состав очереди">
                <span><strong>{payload.meta.total}</strong> всего</span>
                <span><strong>{payload.meta.projects}</strong> проектов</span>
                <span><strong>{payload.meta.standaloneOrders}</strong> заявок</span>
                <span><strong>{payload.meta.estimates}</strong> расчётов</span>
              </div>
            ) : null}
          </section>

          {notice ? <div className="work-notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)}>×</button></div> : null}
          {error ? <div className="work-error" role="alert">{error}<button type="button" onClick={() => void load()}>Повторить</button></div> : null}

          {loading ? (
            <div className="work-skeleton" aria-label="Загрузка очереди">
              {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
            </div>
          ) : payload?.items.length ? (
            <div className="work-list">
              {groupedItems.map((group) => (
                <section key={group.key} className="work-monthGroup">
                  <header className="work-monthGroup__header">
                    <h2>{group.title}</h2>
                    <span>{group.items.length}</span>
                  </header>
                  {group.items.map((item) => {
                const isExpanded = expanded.has(item.key);
                const customerName = item.customer?.name ?? item.customerFallback ?? "Заказчик не указан";
                const href = item.kind === "STANDALONE_ORDER"
                  ? `/orders/${item.id}?from=work`
                  : `/projects/${item.id}`;
                const preview = previews[item.id] ?? null;
                return (
                  <article key={item.key} className="work-card" data-phase={item.phase} data-expanded={isExpanded || undefined}>
                    <div className="work-card__rail" aria-hidden="true" />
                    <button type="button" className="work-card__summary" onClick={() => toggle(item)} aria-expanded={isExpanded}>
                      <span className="work-customerMark">
                        {item.customer?.logoUrl ? (
                          // The authenticated logo endpoint must receive the current session cookie.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.customer.logoUrl} alt="" />
                        ) : <b>{initials(customerName)}</b>}
                      </span>
                      <span className="work-card__identity">
                        <span className="work-card__overline">{KIND_LABEL[item.kind]} · {customerName}</span>
                        <strong>{item.title}</strong>
                        <small>{item.owner.displayName} · обновлено {dateRu(item.updatedAt.slice(0, 10))}</small>
                      </span>
                      <span className="work-card__state">
                        <b>{PHASE_LABEL[item.phase]}</b>
                        <small>{period(item)}{!item.dateConfirmed && item.startDate ? " · ориентировочно" : ""}</small>
                      </span>
                      <span className="work-card__numbers">
                        <strong>{item.totalAmount > 0 ? money(item.totalAmount) : "—"}</strong>
                        <small>{item.ordersCount} заявок · {item.tasksCount} задач</small>
                      </span>
                      <span className="work-card__chevron" aria-hidden="true">⌄</span>
                    </button>
                    <div className="work-card__actions">
                      {item.orders.length === 1 && item.kind === "STANDALONE_ORDER" && quickAction(item.orders[0]) ? (
                        <button
                          type="button"
                          className="work-action work-action--accent"
                          disabled={busy === item.orders[0].id}
                          onClick={() => setConfirmOrder(item.orders[0])}
                        >
                          {quickAction(item.orders[0])?.label}
                        </button>
                      ) : null}
                      {item.kind !== "STANDALONE_ORDER" ? (
                        <button
                          type="button"
                          className="work-action"
                          onClick={() => {
                            setProjectAction(item);
                            setProjectStatus(item.status as ProjectStatus);
                            setProjectArchiveNote("");
                          }}
                        >
                          Статус
                        </button>
                      ) : null}
                      <Link className="work-action" href={href}>Открыть</Link>
                    </div>

                    <div className="work-card__reveal" aria-hidden={!isExpanded}>
                      <div className="work-card__revealInner">
                        <div className="work-brief">
                          <section>
                            <h3>Коротко</h3>
                            <p>{item.summary || (item.kind === "ESTIMATE_ONLY" ? "Быстрый расчёт без обязательных дат и контактов." : "Внутреннее резюме пока не заполнено.")}</p>
                          </section>
                          <section data-warning={Boolean(item.blockers) || undefined}>
                            <h3>Блокеры</h3>
                            <p>{item.blockers || "Критичных блокеров нет."}</p>
                          </section>
                          <section>
                            <h3>Следующий ориентир</h3>
                            <p>{PHASE_LABEL[item.phase]} · {item.ball === "CLIENT" ? "мяч у клиента" : item.ball === "WOWSTORG" ? "мяч у Wowstorg" : "контроль команды"}</p>
                          </section>
                        </div>

                        {item.kind !== "STANDALONE_ORDER" ? (
                          previewBusy === item.id && !preview ? (
                            <div className="work-previewSkeleton" aria-label="Загрузка деталей проекта">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : preview ? (
                            <div className="work-projectPreview">
                              <section>
                                <h3>Финансы сметы</h3>
                                {preview.estimate ? (
                                  <dl>
                                    <div><dt>Клиенту</dt><dd>{money(preview.estimate.financials.revenueTotal)}</dd></div>
                                    <div><dt>Затраты</dt><dd>{money(preview.estimate.financials.internalSubtotal)}</dd></div>
                                    <div><dt>Маржа после налога</dt><dd>{money(preview.estimate.financials.marginAfterTax)} · {Math.round(preview.estimate.financials.marginAfterTaxPct)}%</dd></div>
                                  </dl>
                                ) : <p>Основная смета ещё не создана.</p>}
                              </section>
                              <section>
                                <h3>Ближайшие задачи · {preview.counts.tasks}</h3>
                                {preview.tasks.length ? (
                                  <ul>
                                    {preview.tasks.slice(0, 4).map((task) => (
                                      <li key={task.id}>
                                        <span>{task.title}</span>
                                        <small>{task.column.title}{task.dueDate ? ` · до ${dateRu(task.dueDate)}` : ""}</small>
                                      </li>
                                    ))}
                                  </ul>
                                ) : <p>Открытых задач нет.</p>}
                              </section>
                              <section>
                                <h3>Контакты · {preview.counts.contacts}</h3>
                                {preview.contacts.length ? (
                                  <ul>
                                    {preview.contacts.slice(0, 4).map((contact) => (
                                      <li key={contact.id}>
                                        <span>{contact.fullName}</span>
                                        <small>{contact.roleNote || contact.phone || contact.email || "Без примечания"}</small>
                                      </li>
                                    ))}
                                  </ul>
                                ) : <p>Контакты ещё не добавлены.</p>}
                              </section>
                            </div>
                          ) : null
                        ) : null}

                        {item.orders.length ? (
                          <div className="work-orders">
                            <div className="work-subhead"><h3>Заявки проекта</h3><span>{item.orders.length}</span></div>
                            {item.orders.map((order) => (
                              <div key={order.id} className="work-order">
                                <div className="work-order__head">
                                  <div><strong>{order.title}</strong><span>{dateRu(order.readyByDate)} готовность · {money(order.totalAmount)}</span></div>
                                  <div>
                                    {quickAction(order) ? (
                                      <button type="button" disabled={busy === order.id} onClick={() => setConfirmOrder(order)}>
                                        {quickAction(order)?.label}
                                      </button>
                                    ) : null}
                                    <Link href={`/orders/${order.id}?from=work`}>Открыть</Link>
                                  </div>
                                </div>
                                <OrderStatusStepper status={order.status} source={order.source} showSummary={false} compactWindow={8} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="work-emptyState">
                            <strong>{item.kind === "ESTIMATE_ONLY" ? "Смета без лишних полей" : "Заявок пока нет"}</strong>
                            <span>{item.estimate ? `Создана версия сметы №${item.estimate.versionNumber}` : "Откройте карточку, чтобы начать расчёт."}</span>
                          </div>
                        )}

                        <div className="work-revealActions">
                          {item.kind === "ESTIMATE_ONLY" ? (
                            <button
                              type="button"
                              className="work-action work-action--accent"
                              onClick={() => {
                                setConvertItem(item);
                                setConvertCustomer(item.customerFallback ?? "");
                              }}
                            >
                              Превратить в проект
                            </button>
                          ) : null}
                          <Link className="work-action work-action--dark" href={href}>
                            {item.kind === "ESTIMATE_ONLY" ? "Открыть расчёт" : "Открыть полную карточку"}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
                })}
                </section>
              ))}
            </div>
          ) : (
            <div className="work-empty"><strong>В этой выборке пока пусто</strong><span>Измените период или фильтр.</span></div>
          )}

          {createOpen ? (
            <div className="work-modal" role="dialog" aria-modal="true" aria-labelledby="estimate-modal-title">
              <button type="button" className="work-modal__backdrop" aria-label="Закрыть" onClick={() => setCreateOpen(false)} />
              <form className="work-modal__panel" onSubmit={createEstimate}>
                <span className="work-eyebrow">Новая сущность без лишней бюрократии</span>
                <h2 id="estimate-modal-title">Составить смету</h2>
                <p>Создайте расчёт сейчас. Заказчика, дату и контакты можно уточнить позже.</p>
                <label><span>Название расчёта</span><input autoFocus required value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="Например, летний корпоратив" /></label>
                <label><span>Заказчик, если известен</span><input value={createCustomer} onChange={(event) => setCreateCustomer(event.target.value)} placeholder="Можно оставить пустым" /></label>
                <div className="work-modal__actions">
                  <button type="button" onClick={() => setCreateOpen(false)}>Отмена</button>
                  <button type="submit" className="work-primary" disabled={busy === "create" || !createTitle.trim()}>{busy === "create" ? "Создаём…" : "Создать расчёт"}</button>
                </div>
              </form>
            </div>
          ) : null}

          {convertItem ? (
            <div className="work-modal" role="dialog" aria-modal="true" aria-labelledby="convert-modal-title">
              <button type="button" className="work-modal__backdrop" aria-label="Закрыть" onClick={() => setConvertItem(null)} />
              <form className="work-modal__panel" onSubmit={convertEstimate}>
                <span className="work-eyebrow">Без потери сметы и истории</span>
                <h2 id="convert-modal-title">Превратить в проект</h2>
                <p>Укажите заказчика. Если такого названия ещё нет, заказчик будет создан автоматически.</p>
                <label>
                  <span>Заказчик</span>
                  <input autoFocus required value={convertCustomer} onChange={(event) => setConvertCustomer(event.target.value)} placeholder="Название компании" />
                </label>
                <div className="work-modal__actions">
                  <button type="button" onClick={() => setConvertItem(null)}>Отмена</button>
                  <button type="submit" className="work-primary" disabled={busy === `convert:${convertItem.id}` || !convertCustomer.trim()}>
                    {busy === `convert:${convertItem.id}` ? "Преобразуем…" : "Создать полноценный проект"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {projectAction ? (
            <div className="work-modal" role="dialog" aria-modal="true" aria-labelledby="project-status-modal-title">
              <button type="button" className="work-modal__backdrop" aria-label="Закрыть" onClick={() => setProjectAction(null)} />
              <form className="work-modal__panel" onSubmit={updateProject}>
                <span className="work-eyebrow">Управление без перехода в карточку</span>
                <h2 id="project-status-modal-title">Статус проекта</h2>
                <strong className="work-modal__orderTitle">{projectAction.title}</strong>
                <label>
                  <span>Новый статус</span>
                  <select value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}>
                    {PROJECT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{PROJECT_STATUS_LABEL[status]}</option>
                    ))}
                  </select>
                </label>
                {projectStatus === "COMPLETED" || projectStatus === "CANCELLED" ? (
                  <>
                    <p className="work-modal__warning">
                      Терминальный статус сразу уберёт проект из активной очереди и перенесёт его в архив.
                      Если есть незавершённые заявки, система безопасно остановит действие.
                    </p>
                    <label>
                      <span>Комментарий к завершению</span>
                      <input
                        value={projectArchiveNote}
                        onChange={(event) => setProjectArchiveNote(event.target.value)}
                        placeholder="Итог, причина отмены или важная пометка"
                      />
                    </label>
                  </>
                ) : null}
                <div className="work-modal__actions">
                  <button type="button" onClick={() => setProjectAction(null)}>Отмена</button>
                  <button type="submit" className="work-primary" disabled={busy === `project:${projectAction.id}`}>
                    {busy === `project:${projectAction.id}` ? "Сохраняем…" : "Сохранить статус"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {confirmOrder && confirmAction ? (
            <div className="work-modal" role="dialog" aria-modal="true" aria-labelledby="quick-action-modal-title">
              <button type="button" className="work-modal__backdrop" aria-label="Закрыть" onClick={() => setConfirmOrder(null)} />
              <div className="work-modal__panel work-modal__panel--compact">
                <span className="work-eyebrow">Быстрое действие</span>
                <h2 id="quick-action-modal-title">{confirmAction.label}</h2>
                <p>{confirmAction.confirm}</p>
                <strong className="work-modal__orderTitle">{confirmOrder.title}</strong>
                <div className="work-modal__actions">
                  <button type="button" onClick={() => setConfirmOrder(null)}>Отмена</button>
                  <button
                    type="button"
                    className="work-primary"
                    disabled={busy === confirmOrder.id}
                    onClick={() => void runOrderAction(confirmOrder)}
                  >
                    {busy === confirmOrder.id ? "Выполняем…" : "Подтвердить"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
