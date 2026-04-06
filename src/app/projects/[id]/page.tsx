"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper, orderStatusLabelRu, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
import {
  CONTACT_PATCH_FIELD_LABEL,
  PROJECT_ACTIVITY_KIND_LABEL,
  PROJECT_PATCH_FIELD_LABEL,
  formatActivityValue,
} from "@/lib/project-activity-ui";
import { PROJECT_BALL_LABEL, PROJECT_STATUS_LABEL } from "@/lib/project-ui-labels";
import { useAuth } from "@/app/providers";
import { ProjectContactsPanel } from "./ProjectContactsPanel";
import { ProjectEstimatePanel } from "./ProjectEstimatePanel";
import { ProjectFilesPanel } from "./ProjectFilesPanel";
import { ProjectSchedulePanel } from "./ProjectSchedulePanel";

import type { ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";

type LinkedOrder = {
  id: string;
  status: OrderStatus;
  source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  readyByDate: string;
  startDate: string;
  endDate: string;
  eventName: string | null;
  createdAt: string;
};

type ProjectDetail = {
  id: string;
  title: string;
  status: ProjectStatus;
  ball: ProjectBall;
  archivedAt: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  eventDateNote: string | null;
  eventDateConfirmed: boolean;
  openBlockers: string | null;
  internalSummary: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string };
  owner: { id: string; displayName: string };
  _count: { orders: number };
  orders?: LinkedOrder[];
  activityLogs?: ActivityLogRow[];
};

type ActivityLogRow = {
  id: string;
  kind: ProjectActivityKind;
  payload: unknown;
  createdAt: string;
  actor: { displayName: string };
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatProjectDateRange(start: string | null, end: string | null, fallback?: string | null) {
  if (start && end) return `${fmtDate(start)} — ${fmtDate(end)}`;
  if (start) return `c ${fmtDate(start)}`;
  if (end) return `до ${fmtDate(end)}`;
  return fallback?.trim() ? fallback : "—";
}

const sectionShell = "rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm";
const softShell = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm";
const cardTile = "rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-3";
const inputField =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const primaryBtn =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";
const iconBtn =
  "inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50";
const metaBadge =
  "inline-flex items-center rounded-full border border-zinc-200 bg-white/85 px-2.5 py-1 text-xs font-medium text-zinc-700";
const workTabBtn = (active: boolean) =>
  [
    "rounded-xl px-3 py-2 text-sm font-semibold transition",
    active
      ? "border border-violet-300 bg-violet-600 text-white shadow-sm"
      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
  ].join(" ");

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActivityDescription({ row }: { row: ActivityLogRow }) {
  if (row.kind === "PROJECT_CREATED") {
    const t =
      typeof row.payload === "object" &&
      row.payload !== null &&
      "title" in row.payload
        ? String((row.payload as { title?: unknown }).title ?? "")
        : "";
    return t ? <span>Название: {t}</span> : null;
  }
  if (row.kind === "PROJECT_ARCHIVED") {
    return <span>Проект убран из активного списка.</span>;
  }
  if (row.kind === "ORDER_LINKED" || row.kind === "ORDER_CANCELLED") {
    const oid =
      typeof row.payload === "object" &&
      row.payload !== null &&
      "orderId" in row.payload
        ? String((row.payload as { orderId?: unknown }).orderId ?? "")
        : "";
    return oid ? (
      <span>
        Заявка{" "}
        <Link href={`/orders/${oid}`} className="font-semibold text-violet-700 hover:text-violet-900">
          {oid.slice(0, 8)}…
        </Link>
      </span>
    ) : (
      <span>{row.kind === "ORDER_CANCELLED" ? "Отмена заявки" : "Связана заявка"}</span>
    );
  }
  if (row.kind === "PROJECT_CONTACT_CREATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { fullName?: unknown; contactId?: unknown })
        : null;
    const name = p?.fullName != null ? String(p.fullName) : "";
    return name ? <span>ФИО: {name}</span> : null;
  }
  if (row.kind === "PROJECT_CONTACT_UPDATED") {
    const raw =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { changes?: unknown; contactId?: unknown })
        : null;
    const ch =
      raw?.changes &&
      typeof raw.changes === "object" &&
      raw.changes !== null
        ? (raw.changes as Record<string, { from: unknown; to: unknown }>)
        : null;
    if (!ch || Object.keys(ch).length === 0) return null;
    return (
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-700">
        {Object.entries(ch).map(([field, diff]) => (
          <li key={field}>
            <span className="text-zinc-500">{CONTACT_PATCH_FIELD_LABEL[field] ?? field}:</span>{" "}
            {formatActivityValue(field, diff.from)} → {formatActivityValue(field, diff.to)}
          </li>
        ))}
      </ul>
    );
  }
  if (row.kind === "PROJECT_FOLDER_CREATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { name?: unknown })
        : null;
    const n = p?.name != null ? String(p.name) : "";
    return n ? <span>Папка: {n}</span> : null;
  }
  if (row.kind === "PROJECT_FOLDER_RENAMED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { from?: unknown; to?: unknown })
        : null;
    const a = p?.from != null ? String(p.from) : "";
    const b = p?.to != null ? String(p.to) : "";
    if (!a && !b) return null;
    return (
      <span>
        {a} → {b}
      </span>
    );
  }
  if (row.kind === "PROJECT_FOLDER_DELETED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { name?: unknown })
        : null;
    const n = p?.name != null ? String(p.name) : "";
    return n ? <span>Удалена: {n}</span> : null;
  }
  if (row.kind === "PROJECT_FILE_UPLOADED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { originalName?: unknown; sizeBytes?: unknown })
        : null;
    const n = p?.originalName != null ? String(p.originalName) : "";
    const sz = typeof p?.sizeBytes === "number" ? p.sizeBytes : null;
    if (!n) return null;
    return (
      <span>
        {n}
        {sz != null ? ` · ${(sz / 1024).toFixed(1)} КБ` : null}
      </span>
    );
  }
  if (row.kind === "PROJECT_ESTIMATE_VERSION_CREATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { versionNumber?: unknown })
        : null;
    const n = typeof p?.versionNumber === "number" ? p.versionNumber : null;
    return n != null ? <span>Версия {n}</span> : null;
  }
  if (row.kind === "PROJECT_FILE_DELETED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { originalName?: unknown })
        : null;
    const n = p?.originalName != null ? String(p.originalName) : "";
    return n ? <span>{n}</span> : null;
  }
  if (row.kind === "PROJECT_UPDATED") {
    const ch =
      typeof row.payload === "object" &&
      row.payload !== null &&
      "changes" in row.payload &&
      typeof (row.payload as { changes: unknown }).changes === "object" &&
      (row.payload as { changes: unknown }).changes !== null
        ? (row.payload as { changes: Record<string, { from: unknown; to: unknown }> }).changes
        : null;
    if (!ch || Object.keys(ch).length === 0) return null;
    return (
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-zinc-700">
        {Object.entries(ch).map(([field, diff]) => (
          <li key={field}>
            <span className="text-zinc-500">{PROJECT_PATCH_FIELD_LABEL[field] ?? field}:</span>{" "}
            {formatActivityValue(field, diff.from)} → {formatActivityValue(field, diff.to)}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const forbidden = state.status === "authenticated" && role !== "WOWSTORG";

  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [showAllLog, setShowAllLog] = React.useState(false);
  const [activeWorkTab, setActiveWorkTab] = React.useState<"estimate" | "schedule" | "files" | "journal">("estimate");

  const [title, setTitle] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus>("LEAD");
  const [ball, setBall] = React.useState<ProjectBall>("CLIENT");
  const [eventStartDate, setEventStartDate] = React.useState("");
  const [eventEndDate, setEventEndDate] = React.useState("");
  const [eventDateNote, setEventDateNote] = React.useState("");
  const [eventDateConfirmed, setEventDateConfirmed] = React.useState(false);
  const [openBlockers, setOpenBlockers] = React.useState("");
  const [internalSummary, setInternalSummary] = React.useState("");

  const [editingField, setEditingField] = React.useState<
    null | "title" | "status" | "ball" | "eventDates" | "openBlockers" | "internalSummary"
  >(null);

  const readOnly = Boolean(project?.archivedAt);

  /** true после первой успешной загрузки проекта — чтобы обновления не размонтировали страницу */
  const hasProjectRef = React.useRef(false);
  React.useEffect(() => {
    hasProjectRef.current = project != null;
  }, [project]);

  const load = React.useCallback(() => {
    if (!id || state.status !== "authenticated" || role !== "WOWSTORG") return;
    // Важно: не «сбрасываем» всю страницу на "Загрузка…", иначе скролл прыгает вверх
    // при любом патче (файлы/тайминг/смета), т.к. контент размонтируется.
    if (hasProjectRef.current) setRefreshing(true);
    else setInitialLoading(true);
    fetch(`/api/projects/${id}?includeOrders=1&includeActivity=1`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { project?: ProjectDetail; error?: { message?: string } } | null) => {
        if (data?.project) {
          setProject(data.project);
          setTitle(data.project.title);
          setStatus(data.project.status);
          setBall(data.project.ball);
          setEventStartDate(data.project.eventStartDate ?? "");
          setEventEndDate(data.project.eventEndDate ?? "");
          setEventDateNote(data.project.eventDateNote ?? "");
          setEventDateConfirmed(data.project.eventDateConfirmed);
          setOpenBlockers(data.project.openBlockers ?? "");
          setInternalSummary(data.project.internalSummary ?? "");
        } else {
          setProject(null);
        }
      })
      .catch(() => setProject(null))
      .finally(() => {
        setInitialLoading(false);
        setRefreshing(false);
      });
  }, [id, state.status, role]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    function onRefresh() {
      load();
    }
    window.addEventListener("project-activity-refresh", onRefresh);
    return () => window.removeEventListener("project-activity-refresh", onRefresh);
  }, [load]);

  /** iframe с заявкой (`?embed=1`) шлёт событие — обновляем шапку/список заявок без перезагрузки */
  React.useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const t = (e.data as { type?: string } | null)?.type;
      if (t === "wowstorg:project-refresh-request") load();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  async function doSave() {
    if (!id || readOnly) return;
    setSaveBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          status,
          ball,
          eventStartDate: eventStartDate || null,
          eventEndDate: eventEndDate || null,
          eventDateNote: eventDateNote.trim() || null,
          eventDateConfirmed,
          openBlockers: openBlockers.trim() || null,
          internalSummary: internalSummary.trim() || null,
        }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function patchField(
    patch: Partial<{
      title: string;
      status: ProjectStatus;
      ball: ProjectBall;
      eventStartDate: string | null;
      eventEndDate: string | null;
      eventDateNote: string | null;
      eventDateConfirmed: boolean;
      openBlockers: string | null;
      internalSummary: string | null;
    }>,
  ) {
    if (!id || readOnly) return;
    setSaveBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        await load();
        setEditingField(null);
      }
    } finally {
      setSaveBusy(false);
    }
  }

  async function archive() {
    if (!id || readOnly) return;
    if (!window.confirm("Убрать проект в архив? После этого редактирование будет недоступно.")) return;
    setArchiveBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      if (res.ok) {
        router.push("/projects");
        router.refresh();
      }
    } finally {
      setArchiveBusy(false);
    }
  }

  const statusOptions = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[];
  const ballOptions = Object.keys(PROJECT_BALL_LABEL) as ProjectBall[];

  return (
    <AppShell title={project?.title ?? "Проект"}>
      <div className="mb-4">
        <Link
          href="/projects"
          className="text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          ← К списку проектов
        </Link>
      </div>

      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : initialLoading ? (
        <div className="text-sm text-zinc-600">Загрузка…</div>
      ) : !project ? (
        <div className="text-sm text-zinc-600">Проект не найден.</div>
      ) : (
        <div className="space-y-5">
          {refreshing ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
              Обновляю данные…
            </div>
          ) : null}
          {readOnly ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Архив: только просмотр.
            </div>
          ) : null}

          <section className="rounded-3xl border border-violet-200/70 bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(255,255,255,0.96),rgba(250,204,21,0.06))] p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-800">Проект</div>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-950">{project.title}</h1>
                <div className="mt-3 text-sm font-semibold text-zinc-900">{PROJECT_STATUS_LABEL[project.status]}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                  <span className={metaBadge}>Заказчик: {project.customer.name}</span>
                  <span className={metaBadge}>Ответственный: {project.owner.displayName}</span>
                  <span className={metaBadge}>
                    Даты: {formatProjectDateRange(project.eventStartDate, project.eventEndDate, project.eventDateNote)}
                  </span>
                  <span className={metaBadge}>Заявок: {project._count.orders}</span>
                  <span className={metaBadge}>Мяч: {PROJECT_BALL_LABEL[project.ball]}</span>
                  <span className={metaBadge}>Создан {fmtDate(project.createdAt)}</span>
                </div>
                <div className={`mt-3 text-sm ${project.eventDateConfirmed ? "font-semibold text-emerald-700" : "text-zinc-500"}`}>
                  {project.eventDateConfirmed ? "Дата мероприятия подтверждена" : "Дата мероприятия ещё не подтверждена"}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => void doSave()}
                    disabled={saveBusy}
                    className={primaryBtn}
                  >
                    {saveBusy ? "Сохранение…" : "Сохранить"}
                  </button>
                ) : null}
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => void archive()}
                    disabled={archiveBusy}
                    className={secondaryBtn}
                  >
                    {archiveBusy ? "…" : "Завершить (в архив)"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <section className={`${sectionShell} p-0`}>
              <div className="border-b border-zinc-100 px-5 py-4">
                <div className="text-lg font-extrabold tracking-tight text-violet-900">Карточка проекта</div>
                <p className="mt-1 text-xs text-zinc-500">Главные поля проекта в одном цельном блоке.</p>
              </div>

              <div className="divide-y divide-zinc-100">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Название</div>
                      {editingField === "title" && !readOnly ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={`${inputField} min-w-[14rem] flex-1`}
                            maxLength={300}
                          />
                          <button
                            type="button"
                            disabled={saveBusy || !title.trim()}
                            onClick={() => void patchField({ title: title.trim() })}
                            className={primaryBtn}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTitle(project.title);
                              setEditingField(null);
                            }}
                            className={secondaryBtn}
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 text-base font-semibold text-zinc-950 break-words">{project.title}</div>
                      )}
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => setEditingField((v) => (v === "title" ? null : "title"))}
                        className={iconBtn}
                        title="Редактировать название"
                        aria-label="Редактировать название"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Статус и ответственность</div>
                      {editingField === "status" && !readOnly ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                            className={inputField}
                          >
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>
                                {PROJECT_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <select
                            value={ball}
                            onChange={(e) => setBall(e.target.value as ProjectBall)}
                            className={inputField}
                          >
                            {ballOptions.map((b) => (
                              <option key={b} value={b}>
                                {PROJECT_BALL_LABEL[b]}
                              </option>
                            ))}
                          </select>
                          <div className="sm:col-span-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={saveBusy}
                              onClick={() => void patchField({ status, ball })}
                              className={primaryBtn}
                            >
                              Сохранить
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStatus(project.status);
                                setBall(project.ball);
                                setEditingField(null);
                              }}
                              className={secondaryBtn}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1 text-sm text-zinc-700">
                          <div className="font-semibold text-zinc-950">{PROJECT_STATUS_LABEL[project.status]}</div>
                          <div>Мяч: <span className="font-semibold text-zinc-900">{PROJECT_BALL_LABEL[project.ball]}</span></div>
                        </div>
                      )}
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => setEditingField((v) => (v === "status" ? null : "status"))}
                        className={iconBtn}
                        title="Редактировать статус"
                        aria-label="Редактировать статус"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Даты мероприятия</div>
                      {editingField === "eventDates" && !readOnly ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="text-xs font-semibold text-zinc-500">
                              Дата начала
                              <input
                                type="date"
                                value={eventStartDate}
                                onChange={(e) => setEventStartDate(e.target.value)}
                                className={`mt-1 ${inputField}`}
                              />
                            </label>
                            <label className="text-xs font-semibold text-zinc-500">
                              Дата окончания
                              <input
                                type="date"
                                value={eventEndDate}
                                onChange={(e) => setEventEndDate(e.target.value)}
                                className={`mt-1 ${inputField}`}
                              />
                            </label>
                          </div>
                          <label className="inline-flex items-center gap-2 text-sm text-zinc-900">
                            <input
                              type="checkbox"
                              checked={eventDateConfirmed}
                              onChange={(e) => setEventDateConfirmed(e.target.checked)}
                            />
                            Дата подтверждена
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={saveBusy}
                              onClick={() =>
                                void patchField({
                                  eventStartDate: eventStartDate || null,
                                  eventEndDate: eventEndDate || null,
                                  eventDateConfirmed,
                                })
                              }
                              className={primaryBtn}
                            >
                              Сохранить
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEventStartDate(project.eventStartDate ?? "");
                                setEventEndDate(project.eventEndDate ?? "");
                                setEventDateConfirmed(project.eventDateConfirmed);
                                setEditingField(null);
                              }}
                              className={secondaryBtn}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 space-y-1 text-sm text-zinc-700">
                          <div className="font-semibold text-zinc-950">
                            {formatProjectDateRange(project.eventStartDate, project.eventEndDate, project.eventDateNote)}
                          </div>
                          <div className={project.eventDateConfirmed ? "font-semibold text-emerald-700" : "text-zinc-500"}>
                            {project.eventDateConfirmed ? "Дата подтверждена" : "Дата не подтверждена"}
                          </div>
                        </div>
                      )}
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => setEditingField((v) => (v === "eventDates" ? null : "eventDates"))}
                        className={iconBtn}
                        title="Редактировать даты"
                        aria-label="Редактировать даты"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              <ProjectContactsPanel projectId={id} readOnly={readOnly} />

              <section className={softShell}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-extrabold tracking-tight text-violet-900">Рабочие заметки</div>
                    <p className="mt-1 text-xs text-zinc-500">Контекст проекта, риски и внутренние договорённости.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Блокеры</div>
                    <textarea
                      value={openBlockers}
                      onChange={(e) => setOpenBlockers(e.target.value)}
                      rows={4}
                      className={inputField}
                      placeholder="Что сейчас мешает движению проекта"
                      disabled={readOnly}
                    />
                    {!readOnly ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saveBusy}
                          onClick={() => void patchField({ openBlockers: openBlockers.trim() || null })}
                          className={primaryBtn}
                        >
                          Сохранить блокеры
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2 border-t border-zinc-100 pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Внутреннее резюме</div>
                    <textarea
                      value={internalSummary}
                      onChange={(e) => setInternalSummary(e.target.value)}
                      rows={5}
                      className={inputField}
                      placeholder="Короткая суть проекта, важные договорённости, контекст"
                      disabled={readOnly}
                    />
                    {!readOnly ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saveBusy}
                          onClick={() => void patchField({ internalSummary: internalSummary.trim() || null })}
                          className={primaryBtn}
                        >
                          Сохранить резюме
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className={softShell}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-lg font-extrabold tracking-tight text-violet-900">Заявки реквизита</div>
              {!readOnly ? (
                <Link
                  href={`/catalog?projectId=${encodeURIComponent(id)}`}
                  className={primaryBtn}
                >
                  Каталог → новая заявка
                </Link>
              ) : null}
            </div>
            <p className="text-xs text-zinc-600">
              Разверни заявку — внутри тот же экран, что и в очереди/карточке заявки: статусы, редактирование,
              приёмка. Отдельная вкладка — по ссылке под блоком.
            </p>
            {!project.orders?.length ? (
              <p className="text-sm text-zinc-600">Пока нет привязанных заявок.</p>
            ) : (
              <ul className="space-y-3">
                {project.orders.map((o) => (
                  <li key={o.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                    <details className="group">
                      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900 truncate">
                              {o.eventName?.trim() ? o.eventName : "Без названия мероприятия"}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span className="font-mono">{o.id.slice(0, 8)}…</span>
                              <span>·</span>
                              <span>
                                {fmtDate(o.startDate)} — {fmtDate(o.endDate)} · готовность {fmtDate(o.readyByDate)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                              {orderStatusLabelRu[o.status] ?? o.status}
                            </span>
                            <span className="text-xs font-medium text-violet-700 group-open:hidden">
                              Развернуть управление
                            </span>
                            <span className="hidden text-xs font-medium text-violet-700 group-open:inline">
                              Свернуть
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-2 py-2">
                          <OrderStatusStepper status={o.status} source={o.source} />
                        </div>
                      </summary>
                      <div className="border-t border-zinc-100 px-2 pb-3 pt-2">
                        <iframe
                          title={`Заявка ${o.id.slice(0, 8)}`}
                          src={`/orders/${o.id}?embed=1&from=project`}
                          className="h-[min(72vh,880px)] w-full rounded-lg border border-zinc-200 bg-white"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm">
                          <Link
                            href={`/orders/${o.id}?from=project`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-violet-700 hover:text-violet-900"
                          >
                            Открыть заявку в новой вкладке
                          </Link>
                          <Link
                            href={`/warehouse/queue?q=${encodeURIComponent(o.id)}`}
                            className="text-zinc-600 hover:text-zinc-900"
                          >
                            Найти в очереди
                          </Link>
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section className={softShell}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold tracking-tight text-violet-900">Рабочая зона</div>
                <p className="mt-1 text-xs text-zinc-500">Открывай только один большой рабочий блок за раз.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setActiveWorkTab("estimate")} className={workTabBtn(activeWorkTab === "estimate")}>
                  Смета
                </button>
                <button type="button" onClick={() => setActiveWorkTab("schedule")} className={workTabBtn(activeWorkTab === "schedule")}>
                  Тайминг
                </button>
                <button type="button" onClick={() => setActiveWorkTab("files")} className={workTabBtn(activeWorkTab === "files")}>
                  Файлы
                </button>
                <button type="button" onClick={() => setActiveWorkTab("journal")} className={workTabBtn(activeWorkTab === "journal")}>
                  Журнал
                </button>
              </div>
            </div>

            <div className="mt-4">
              {activeWorkTab === "estimate" ? <ProjectEstimatePanel projectId={id} readOnly={readOnly} /> : null}
              {activeWorkTab === "schedule" ? <ProjectSchedulePanel projectId={id} readOnly={readOnly} /> : null}
              {activeWorkTab === "files" ? <ProjectFilesPanel projectId={id} readOnly={readOnly} /> : null}
              {activeWorkTab === "journal" ? (
                <div className={sectionShell}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-lg font-extrabold tracking-tight text-violet-900">Журнал</div>
                    {project.activityLogs?.length ? (
                      <button
                        type="button"
                        onClick={() => setShowAllLog((v) => !v)}
                        className={secondaryBtn}
                      >
                        {showAllLog ? "Скрыть историю" : "Показать всю историю"}
                      </button>
                    ) : null}
                  </div>
                  {!project.activityLogs?.length ? (
                    <p className="mt-3 text-sm text-zinc-600">Пока нет записей.</p>
                  ) : (
                    <ul className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                      {(showAllLog ? project.activityLogs : project.activityLogs.slice(0, 6)).map((row) => (
                        <li key={row.id} className="text-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium text-zinc-900">
                              {PROJECT_ACTIVITY_KIND_LABEL[row.kind] ?? row.kind}
                            </span>
                            <span className="text-xs text-zinc-400">{fmtDateTime(row.createdAt)}</span>
                          </div>
                          <div className="text-xs text-zinc-500">{row.actor.displayName}</div>
                          <div className="mt-1 text-zinc-800">
                            <ActivityDescription row={row} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
