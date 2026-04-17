"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import { createPortal } from "react-dom";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper, orderStatusLabelRu, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
import {
  CONTACT_PATCH_FIELD_LABEL,
  PROJECT_ACTIVITY_KIND_LABEL,
  PROJECT_PATCH_FIELD_LABEL,
  formatActivityValue,
} from "@/lib/project-activity-ui";
import {
  PROJECT_BALL_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_TERMINAL_STATUSES,
  isProjectTerminalStatus,
} from "@/lib/project-ui-labels";
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

type DraftOrderLinePreview = {
  id: string;
  itemId: string;
  itemName: string;
  qty: number;
  plannedDays: number;
  comment: string | null;
  pricePerDaySnapshot: number | null;
};

type ProjectDetail = {
  id: string;
  title: string;
  status: ProjectStatus;
  ball: ProjectBall;
  archivedAt: string | null;
  archiveNote: string | null;
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
  draftOrder?: {
    id: string;
    title: string | null;
    comment: string | null;
    updatedAt: string;
    estimateVersionId: string | null;
    linesCount: number;
    lines: DraftOrderLinePreview[];
  } | null;
  estimateCurrent?: {
    id: string;
    versionNumber: number;
  } | null;
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

function buildProjectCatalogHref(args: {
  projectId: string;
  mode: "demo" | "dated";
  estimateVersionId?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("projectId", args.projectId);
  if (args.mode === "demo") params.set("projectMode", "demo");
  if (args.estimateVersionId?.trim()) params.set("estimateVersionId", args.estimateVersionId.trim());
  return `/catalog?${params.toString()}`;
}

const sectionShell = "rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-sm sm:p-4";
const softShell = "rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4";
const cardTile = "rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-3";
const inputField =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const primaryBtn =
  "rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50";
const secondaryBtn =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50";
const iconBtn =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50";
const metaBadge =
  "inline-flex items-center rounded-full border border-zinc-200 bg-white/85 px-2.5 py-1 text-xs font-medium text-zinc-700";
const workTabBtn = (active: boolean) =>
  [
    "min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition",
    active
      ? "border border-violet-300 bg-violet-600 text-white shadow-sm"
      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
  ].join(" ");
const heroStatCard = "rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm";

function projectStatusTone(status: ProjectStatus) {
  switch (status) {
    case "LIVE":
      return "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900";
    case "READY_TO_RUN":
    case "CONTRACT_SIGNED":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "PROPOSAL_SENT":
    case "CONTRACT_SENT":
    case "AWAITING_CLIENT_INPUT":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "AWAITING_VENDOR":
      return "border-sky-300 bg-sky-50 text-sky-900";
    case "ON_HOLD":
      return "border-zinc-300 bg-zinc-100 text-zinc-800";
    case "CANCELLED":
      return "border-red-300 bg-red-50 text-red-900";
    case "COMPLETED":
      return "border-violet-300 bg-violet-50 text-violet-900";
    default:
      return "border-violet-200 bg-violet-50/70 text-violet-900";
  }
}

function projectBallTone(ball: ProjectBall) {
  switch (ball) {
    case "CLIENT":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "WOWSTORG":
      return "border-violet-300 bg-violet-50 text-violet-900";
    case "VENDOR":
      return "border-sky-300 bg-sky-50 text-sky-900";
    case "VENUE":
      return "border-emerald-300 bg-emerald-50 text-emerald-900";
    case "NONE":
      return "border-zinc-300 bg-zinc-100 text-zinc-800";
    default:
      return "border-zinc-200 bg-white text-zinc-800";
  }
}

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

function fmtMoney(value: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

function HelpLegend({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-bold text-zinc-600 hover:bg-zinc-50"
        aria-label={title}
      >
        ?
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700 shadow-xl">
          <div className="font-semibold text-zinc-950">{title}</div>
          <div className="mt-2">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function InlineSelectMenu<T extends string>({
  value,
  options,
  labelByValue,
  onChange,
  tone,
  placeholderLabel,
}: {
  value: T;
  options: T[];
  labelByValue: Record<T, string>;
  onChange: (value: T) => void;
  tone: (value: T) => string;
  placeholderLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-11 min-w-[14rem] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-sm ${tone(value)}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-70">{placeholderLabel}</span>
          <span className="block text-sm font-semibold">{labelByValue[value]}</span>
        </span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-20 mt-2 w-full min-w-[14rem] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_18px_48px_rgba(24,24,27,0.14)]"
          role="listbox"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                option === value ? "bg-violet-50 text-violet-950" : "text-zinc-800 hover:bg-zinc-50"
              }`}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span>{labelByValue[option]}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone(option)}`}>
                {option === value ? "Выбрано" : "Выбрать"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActivityDescription({ row }: { row: ActivityLogRow }) {
  const kind = String(row.kind);

  if (kind === "PROJECT_CREATED") {
    const t =
      typeof row.payload === "object" &&
      row.payload !== null &&
      "title" in row.payload
        ? String((row.payload as { title?: unknown }).title ?? "")
        : "";
    return t ? <span>Название: {t}</span> : null;
  }
  if (kind === "PROJECT_ARCHIVED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { status?: unknown; archiveNote?: unknown })
        : null;
    const st = p?.status != null ? String(p.status) : "";
    const note = p?.archiveNote != null ? String(p.archiveNote).trim() : "";
    const statusLabel =
      st && st in PROJECT_STATUS_LABEL ? PROJECT_STATUS_LABEL[st as ProjectStatus] : st;
    return (
      <span className="block space-y-1">
        <span>Проект убран в архив{statusLabel ? ` (${statusLabel})` : ""}.</span>
        {note ? <span className="block text-zinc-600 whitespace-pre-wrap">Комментарий: {note}</span> : null}
      </span>
    );
  }
  if (kind === "ORDER_LINKED" || kind === "ORDER_CANCELLED") {
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
      <span>{kind === "ORDER_CANCELLED" ? "Отмена заявки" : "Связана заявка"}</span>
    );
  }
  if (kind === "PROJECT_CONTACT_CREATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { fullName?: unknown; contactId?: unknown })
        : null;
    const name = p?.fullName != null ? String(p.fullName) : "";
    return name ? <span>ФИО: {name}</span> : null;
  }
  if (kind === "PROJECT_CONTACT_UPDATED") {
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
  if (kind === "PROJECT_FOLDER_CREATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { name?: unknown })
        : null;
    const n = p?.name != null ? String(p.name) : "";
    return n ? <span>Папка: {n}</span> : null;
  }
  if (kind === "PROJECT_FOLDER_RENAMED") {
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
  if (kind === "PROJECT_FOLDER_DELETED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { name?: unknown })
        : null;
    const n = p?.name != null ? String(p.name) : "";
    return n ? <span>Удалена: {n}</span> : null;
  }
  if (kind === "PROJECT_FILE_UPLOADED") {
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
  if (kind === "PROJECT_ESTIMATE_VERSION_CREATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { versionNumber?: unknown })
        : null;
    const n = typeof p?.versionNumber === "number" ? p.versionNumber : null;
    return n != null ? <span>Версия {n}</span> : null;
  }
  if (kind === "PROJECT_FILE_DELETED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { originalName?: unknown })
        : null;
    const n = p?.originalName != null ? String(p.originalName) : "";
    return n ? <span>{n}</span> : null;
  }
  if (kind === "PROJECT_DRAFT_ORDER_UPDATED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as { lineCount?: unknown })
        : null;
    const count = typeof p?.lineCount === "number" ? p.lineCount : null;
    return count != null ? <span>Строк в demo-черновике: {count}</span> : <span>Demo-черновик обновлён.</span>;
  }
  if (kind === "PROJECT_DRAFT_ORDER_MATERIALIZED") {
    const p =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as {
            createdCount?: unknown;
            remainingDraftLines?: unknown;
            unavailableCount?: unknown;
          })
        : null;
    const createdCount = typeof p?.createdCount === "number" ? p.createdCount : null;
    const remaining = typeof p?.remainingDraftLines === "number" ? p.remainingDraftLines : null;
    const unavailable = typeof p?.unavailableCount === "number" ? p.unavailableCount : null;
    return (
      <span>
        Создано реальных заявок: {createdCount ?? 0}
        {remaining != null ? ` · осталось строк в demo: ${remaining}` : ""}
        {unavailable != null && unavailable > 0 ? ` · дефицитных строк: ${unavailable}` : ""}
      </span>
    );
  }
  if (kind === "PROJECT_UPDATED") {
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
  const [draftDeleteBusy, setDraftDeleteBusy] = React.useState(false);
  const [draftDeleteError, setDraftDeleteError] = React.useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = React.useState(false);
  const [archiveModalStatus, setArchiveModalStatus] = React.useState<"COMPLETED" | "CANCELLED">("COMPLETED");
  const [archiveModalNote, setArchiveModalNote] = React.useState("");
  const [showAllLog, setShowAllLog] = React.useState(false);
  const [activeWorkTab, setActiveWorkTab] = React.useState<"estimate" | "schedule" | "files" | "journal">("estimate");
  const [catalogModeOpen, setCatalogModeOpen] = React.useState(false);
  const [selectedEstimateVersionNumber, setSelectedEstimateVersionNumber] = React.useState<number | null>(null);
  const [resolvedEstimateVersion, setResolvedEstimateVersion] = React.useState<{ id: string; versionNumber: number } | null>(null);

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
  const canArchiveProject =
    (project?.orders?.length ?? 0) === 0 ||
    project?.orders?.every((order) => order.status === "CLOSED" || order.status === "CANCELLED");
  const activeEstimateVersionId = resolvedEstimateVersion?.id ?? project?.estimateCurrent?.id ?? null;
  const activeEstimateVersionNumber =
    resolvedEstimateVersion?.versionNumber ?? selectedEstimateVersionNumber ?? project?.estimateCurrent?.versionNumber ?? null;
  const hasDraftOrder = Boolean(project?.draftOrder && project.draftOrder.linesCount > 0);
  const projectHasConfirmedDates =
    Boolean(project?.eventDateConfirmed) && Boolean(project?.eventStartDate) && Boolean(project?.eventEndDate);

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

  React.useEffect(() => {
    if (!catalogModeOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-catalog-mode-modal]")) return;
      setCatalogModeOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [catalogModeOpen]);

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

  function openArchiveModal() {
    if (!project || readOnly) return;
    setArchiveError(null);
    setArchiveModalStatus(
      isProjectTerminalStatus(project.status) ? (project.status as "COMPLETED" | "CANCELLED") : "COMPLETED",
    );
    setArchiveModalNote("");
    setArchiveModalOpen(true);
  }

  async function confirmArchiveToModal() {
    if (!id || readOnly) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const note = archiveModalNote.trim();
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: archiveModalStatus,
          archive: true,
          ...(note ? { archiveNote: note } : { archiveNote: null }),
        }),
      });
      if (res.ok) {
        setArchiveModalOpen(false);
        router.push("/projects?tab=archive");
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setArchiveError(data?.error?.message ?? "Не удалось завершить проект");
      }
    } finally {
      setArchiveBusy(false);
    }
  }

  function openProjectCatalogEntry() {
    if (readOnly) return;
    if (!projectHasConfirmedDates) {
      router.push(
        buildProjectCatalogHref({
          projectId: id,
          mode: "demo",
          estimateVersionId: activeEstimateVersionId,
        }),
      );
      return;
    }
    if (!hasDraftOrder) {
      router.push(
        buildProjectCatalogHref({
          projectId: id,
          mode: "dated",
          estimateVersionId: activeEstimateVersionId,
        }),
      );
      return;
    }
    setCatalogModeOpen(true);
  }

  async function deleteDraftOrder() {
    if (!id || readOnly || !project?.draftOrder) return;
    const title = project.draftOrder.title?.trim() || "demo-заявку";
    if (!window.confirm(`Удалить ${title}? Черновик и его позиции исчезнут из проекта и сметы.`)) return;

    setDraftDeleteBusy(true);
    setDraftDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${id}/draft-order`, {
        method: "DELETE",
      });
      if (res.ok) {
        await load();
        return;
      }
      const data = await res.json().catch(() => null);
      setDraftDeleteError(data?.error?.message ?? "Не удалось удалить demo-заявку");
    } catch {
      setDraftDeleteError("Не удалось удалить demo-заявку");
    } finally {
      setDraftDeleteBusy(false);
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
            <div className="space-y-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Архив: только просмотр.
              </div>
              {project.archiveNote?.trim() ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Комментарий при закрытии</div>
                  <p className="mt-1 whitespace-pre-wrap">{project.archiveNote.trim()}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {archiveError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {archiveError}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-[30px] border border-violet-200/70 bg-[linear-gradient(135deg,rgba(124,58,237,0.12),rgba(255,255,255,0.98),rgba(250,204,21,0.09))] shadow-sm">
            <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-800">Проект</div>
                <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h1 className="break-words text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">
                      {project.title}
                    </h1>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => !readOnly && setEditingField((v) => (v === "status" ? null : "status"))}
                        disabled={readOnly}
                        className={`inline-flex items-center rounded-2xl border px-4 py-3 text-base font-bold shadow-sm ${projectStatusTone(project.status)} ${readOnly ? "cursor-default" : "hover:brightness-95"}`}
                      >
                        Статус: {PROJECT_STATUS_LABEL[project.status]}
                      </button>
                      <button
                        type="button"
                        onClick={() => !readOnly && setEditingField((v) => (v === "status" ? null : "status"))}
                        disabled={readOnly}
                        className={`inline-flex items-center rounded-2xl border px-4 py-3 text-base font-bold shadow-sm ${projectBallTone(project.ball)} ${readOnly ? "cursor-default" : "hover:brightness-95"}`}
                      >
                        Мяч: {PROJECT_BALL_LABEL[project.ball]}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={heroStatCard}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Заказчик</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-950">{project.customer.name}</div>
                  </div>
                  <div className={heroStatCard}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ответственный</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-950">{project.owner.displayName}</div>
                  </div>
                  <div className={heroStatCard}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Даты мероприятия</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-950">
                      {formatProjectDateRange(project.eventStartDate, project.eventEndDate, project.eventDateNote)}
                    </div>
                    <div className={`mt-1 text-xs ${project.eventDateConfirmed ? "font-semibold text-emerald-700" : "text-zinc-500"}`}>
                      {project.eventDateConfirmed ? "Дата подтверждена" : "Дата не подтверждена"}
                    </div>
                  </div>
                  <div className={heroStatCard}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Прогресс</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-950">Заявок: {project._count.orders}</div>
                    <div className="mt-1 text-xs text-zinc-500">Создан {fmtDate(project.createdAt)}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-white/80 bg-white/92 p-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Быстрые действия</div>
                  <div className="mt-3 flex flex-col gap-2">
                    <Link
                      href={buildProjectCatalogHref({
                        projectId: id,
                        mode: projectHasConfirmedDates ? "dated" : "demo",
                        estimateVersionId: activeEstimateVersionId,
                      })}
                      onClick={(e) => {
                        e.preventDefault();
                        openProjectCatalogEntry();
                      }}
                      className={`${primaryBtn} w-full text-center ${readOnly ? "pointer-events-none opacity-50" : ""}`}
                      aria-disabled={readOnly}
                    >
                      Каталог → реквизит
                    </Link>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => openArchiveModal()}
                        disabled={archiveBusy || !canArchiveProject}
                        className={`${secondaryBtn} w-full justify-center`}
                        title={
                          canArchiveProject
                            ? undefined
                            : "Сначала завершите или отмените все заявки, привязанные к проекту"
                        }
                      >
                        Завершить (в архив)
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className={`${sectionShell} h-full p-0`}>
              <div className="border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
                <div className="text-lg font-extrabold tracking-tight text-violet-900">Карточка проекта</div>
                <p className="mt-1 text-xs text-zinc-500">Главные поля проекта в одном цельном блоке.</p>
              </div>

              <div className="divide-y divide-zinc-100">
                <div className="px-4 py-3 sm:px-5 sm:py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Название</div>
                      {editingField === "title" && !readOnly ? (
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                            className={`${primaryBtn} w-full sm:w-auto`}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTitle(project.title);
                              setEditingField(null);
                            }}
                            className={`${secondaryBtn} w-full sm:w-auto`}
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
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="px-4 py-3 sm:px-5 sm:py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Статус и ответственность</div>
                      {editingField === "status" && !readOnly ? (
                        <div className="mt-3 space-y-3">
                          <div className="grid gap-3 lg:grid-cols-2">
                            <InlineSelectMenu
                              value={status}
                              options={statusOptions}
                              labelByValue={PROJECT_STATUS_LABEL}
                              onChange={setStatus}
                              tone={projectStatusTone}
                              placeholderLabel="Статус"
                            />
                            <InlineSelectMenu
                              value={ball}
                              options={ballOptions}
                              labelByValue={PROJECT_BALL_LABEL}
                              onChange={setBall}
                              tone={projectBallTone}
                              placeholderLabel="Мяч"
                            />
                          </div>
                          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:flex-wrap">
                            <button
                              type="button"
                              disabled={saveBusy}
                              onClick={() => void patchField({ status, ball })}
                              className={`${primaryBtn} w-full sm:w-auto`}
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
                              className={`${secondaryBtn} w-full sm:w-auto`}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-700">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 font-semibold ${projectStatusTone(project.status)}`}>
                            {PROJECT_STATUS_LABEL[project.status]}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 font-semibold ${projectBallTone(project.ball)}`}>
                            Мяч: {PROJECT_BALL_LABEL[project.ball]}
                          </span>
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
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="px-4 py-3 sm:px-5 sm:py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-900">
                            <input
                              type="checkbox"
                              checked={eventDateConfirmed}
                              onChange={(e) => setEventDateConfirmed(e.target.checked)}
                            />
                            Дата подтверждена
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                              className={`${primaryBtn} w-full sm:w-auto`}
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
                              className={`${secondaryBtn} w-full sm:w-auto`}
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
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className={`${softShell} h-full`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-extrabold tracking-tight text-violet-900">Рабочие заметки</div>
                  <p className="mt-1 text-xs text-zinc-500">Контекст проекта, риски и внутренние договорённости.</p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Блокеры</div>
                      {editingField === "openBlockers" && !readOnly ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={openBlockers}
                            onChange={(e) => setOpenBlockers(e.target.value)}
                            rows={4}
                            className={inputField}
                            placeholder="Что сейчас мешает движению проекта"
                          />
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button
                              type="button"
                              disabled={saveBusy}
                              onClick={() => void patchField({ openBlockers: openBlockers.trim() || null })}
                              className={`${primaryBtn} w-full sm:w-auto`}
                            >
                              Сохранить блокеры
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenBlockers(project.openBlockers ?? "");
                                setEditingField(null);
                              }}
                              className={`${secondaryBtn} w-full sm:w-auto`}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
                          {project.openBlockers?.trim() ? project.openBlockers : <span className="text-zinc-400">Пока пусто</span>}
                        </div>
                      )}
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => setEditingField((v) => (v === "openBlockers" ? null : "openBlockers"))}
                        className={iconBtn}
                        title="Редактировать блокеры"
                        aria-label="Редактировать блокеры"
                      >
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Внутреннее резюме</div>
                      {editingField === "internalSummary" && !readOnly ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={internalSummary}
                            onChange={(e) => setInternalSummary(e.target.value)}
                            rows={5}
                            className={inputField}
                            placeholder="Короткая суть проекта, важные договорённости, контекст"
                          />
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button
                              type="button"
                              disabled={saveBusy}
                              onClick={() => void patchField({ internalSummary: internalSummary.trim() || null })}
                              className={`${primaryBtn} w-full sm:w-auto`}
                            >
                              Сохранить резюме
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInternalSummary(project.internalSummary ?? "");
                                setEditingField(null);
                              }}
                              className={`${secondaryBtn} w-full sm:w-auto`}
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
                          {project.internalSummary?.trim() ? project.internalSummary : <span className="text-zinc-400">Пока пусто</span>}
                        </div>
                      )}
                    </div>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => setEditingField((v) => (v === "internalSummary" ? null : "internalSummary"))}
                        className={iconBtn}
                        title="Редактировать резюме"
                        aria-label="Редактировать резюме"
                      >
                        <PencilIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <ProjectContactsPanel projectId={id} readOnly={readOnly} />

          <div className={softShell}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-lg font-extrabold tracking-tight text-violet-900">Заявки реквизита</div>
                <HelpLegend title="Как работает блок заявок">
                  Один вход `Каталог → реквизит` ведёт либо в demo-каталог без дат, либо в обычный project-каталог с
                  датами мероприятия. Реальные заявки попадают в выбранную версию сметы автоматически.
                </HelpLegend>
              </div>
              {!readOnly ? (
                <button type="button" onClick={openProjectCatalogEntry} className={`${primaryBtn} w-full sm:w-auto`}>
                  Каталог → реквизит
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={metaBadge}>
                Версия сметы: {activeEstimateVersionNumber != null ? `v${activeEstimateVersionNumber}` : "будет создана автоматически"}
              </span>
              <span className={metaBadge}>
                {projectHasConfirmedDates ? "Даты подтверждены: доступен обычный каталог" : "Даты не подтверждены: доступен demo-каталог"}
              </span>
              {hasDraftOrder ? (
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                  Есть demo-заявка без дат
                </span>
              ) : null}
            </div>
            {!hasDraftOrder && !project.orders?.length ? (
              <p className="mt-3 text-sm text-zinc-600">Пока нет ни demo-заявки, ни привязанных реальных заявок.</p>
            ) : (
              <ul className="space-y-3">
                {project.draftOrder && project.draftOrder.linesCount > 0 ? (
                  <li className="rounded-xl border border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.94),rgba(255,255,255,0.98))] shadow-sm overflow-hidden">
                    <details className="group">
                      <summary className="cursor-pointer list-none px-3 py-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-red-200 bg-red-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                                Демо-заявка без дат
                              </span>
                              <span className="text-sm font-semibold text-zinc-900">
                                {project.draftOrder.title?.trim() || "Без названия demo-набора"}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span>{project.draftOrder.linesCount} поз.</span>
                              <span>·</span>
                              <span>обновлено {fmtDateTime(project.draftOrder.updatedAt)}</span>
                              {project.draftOrder.estimateVersionId === activeEstimateVersionId && activeEstimateVersionNumber != null ? (
                                <>
                                  <span>·</span>
                                  <span className="font-medium text-red-700">привязано к v{activeEstimateVersionNumber}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-red-700 group-open:hidden">Развернуть</span>
                            <span className="hidden text-xs font-medium text-red-700 group-open:inline">Свернуть</span>
                          </div>
                        </div>
                      </summary>
                      <div className="border-t border-red-100 px-3 pb-3 pt-3 sm:px-4">
                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
                          <div className="min-w-0 rounded-2xl border border-red-100 bg-white/90 p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-zinc-900">Содержимое demo-заявки</div>
                              <span className="rounded-full border border-red-100 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                без дат
                              </span>
                            </div>
                            {project.draftOrder.comment?.trim() ? (
                              <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700">
                                {project.draftOrder.comment}
                              </div>
                            ) : null}
                            <div className="mt-3 space-y-2">
                              {project.draftOrder.lines.map((line, index) => {
                                const pricePerDay = line.pricePerDaySnapshot ?? 0;
                                const lineTotal = line.qty * Math.max(1, line.plannedDays) * pricePerDay;
                                return (
                                  <div
                                    key={line.id}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-3 shadow-sm"
                                  >
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-50 px-2 text-[11px] font-bold text-red-700">
                                            {index + 1}
                                          </span>
                                          <span className="truncate text-sm font-semibold text-zinc-900">{line.itemName}</span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                          <span className={metaBadge}>Кол-во: {line.qty}</span>
                                          <span className={metaBadge}>Дней: {Math.max(1, line.plannedDays)}</span>
                                          <span className={metaBadge}>
                                            Цена/день: {pricePerDay > 0 ? `${fmtMoney(pricePerDay)} ₽` : "не задана"}
                                          </span>
                                        </div>
                                        {line.comment?.trim() ? (
                                          <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700">
                                            {line.comment}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="shrink-0 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2 text-right">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Сумма</div>
                                        <div className="text-sm font-bold text-red-900">{fmtMoney(lineTotal)} ₽</div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-red-100 bg-white/90 p-3 shadow-sm">
                            <div className="text-sm font-semibold text-zinc-900">Действия</div>
                            <div className="mt-2 text-xs leading-5 text-zinc-600">
                              Черновик проекта без дат. Состав и смету можно уточнять до подтверждения реальных интервалов.
                            </div>
                            {!readOnly ? (
                              <div className="mt-3 flex flex-col gap-2">
                                <Link
                                  href={buildProjectCatalogHref({
                                    projectId: id,
                                    mode: "demo",
                                    estimateVersionId: activeEstimateVersionId,
                                  })}
                                  className={`${secondaryBtn} justify-center text-center`}
                                >
                                  Открыть demo-каталог
                                </Link>
                                {projectHasConfirmedDates ? (
                                  <Link
                                    href={buildProjectCatalogHref({
                                      projectId: id,
                                      mode: "dated",
                                      estimateVersionId: activeEstimateVersionId,
                                    })}
                                    className={`${primaryBtn} justify-center text-center`}
                                  >
                                    Перейти к реальной заявке
                                  </Link>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={deleteDraftOrder}
                                  disabled={draftDeleteBusy}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {draftDeleteBusy ? "Удаляем..." : "Удалить demo-заявку"}
                                </button>
                                {draftDeleteError ? <div className="text-xs text-red-600">{draftDeleteError}</div> : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </details>
                  </li>
                ) : null}
                {(project.orders ?? []).map((o) => (
                  <li key={o.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                    <details className="group">
                      <summary className="cursor-pointer list-none px-3 py-3 sm:px-4 [&::-webkit-details-marker]:hidden">
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
                      <div className="border-t border-zinc-100 px-2 pb-3 pt-2 sm:px-3">
                        <iframe
                          title={`Заявка ${o.id.slice(0, 8)}`}
                          src={`/orders/${o.id}?embed=1&from=project`}
                          className="h-[58vh] min-h-[420px] w-full rounded-lg border border-zinc-200 bg-white sm:h-[min(72vh,880px)]"
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
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
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
              {activeWorkTab === "estimate" ? (
                <ProjectEstimatePanel
                  projectId={id}
                  readOnly={readOnly}
                  selectedVersionNumber={selectedEstimateVersionNumber}
                  onSelectedVersionNumberChange={setSelectedEstimateVersionNumber}
                  onResolvedVersionChange={setResolvedEstimateVersion}
                />
              ) : null}
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
          {catalogModeOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4">
              <div
                data-catalog-mode-modal
                className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_rgba(24,24,27,0.26)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-extrabold tracking-tight text-zinc-950">Какой режим открыть?</div>
                    <p className="mt-1 text-sm text-zinc-600">
                      Даты проекта уже подтверждены, поэтому можно либо продолжить demo-сценарий без дат, либо сразу
                      перейти к реальной заявке с предзаполненным периодом мероприятия.
                    </p>
                  </div>
                  <button type="button" onClick={() => setCatalogModeOpen(false)} className={secondaryBtn}>
                    Закрыть
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Link
                    href={buildProjectCatalogHref({
                      projectId: id,
                      mode: "demo",
                      estimateVersionId: activeEstimateVersionId,
                    })}
                    className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm transition hover:border-red-300 hover:bg-red-100"
                    onClick={() => setCatalogModeOpen(false)}
                  >
                    <div className="inline-flex rounded-full border border-red-200 bg-red-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      Demo без дат
                    </div>
                    <div className="mt-3 text-lg font-bold text-red-950">Собрать или обновить demo-корзину</div>
                    <p className="mt-2 text-sm text-red-900/80">
                      Подходит, если период ещё плавает или нужно дособрать состав без резервирования остатков.
                    </p>
                  </Link>
                  <Link
                    href={buildProjectCatalogHref({
                      projectId: id,
                      mode: "dated",
                      estimateVersionId: activeEstimateVersionId,
                    })}
                    className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm transition hover:border-violet-300 hover:bg-violet-100"
                    onClick={() => setCatalogModeOpen(false)}
                  >
                    <div className="inline-flex rounded-full border border-violet-200 bg-violet-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      Реальная заявка
                    </div>
                    <div className="mt-3 text-lg font-bold text-violet-950">Открыть каталог с датами мероприятия</div>
                    <p className="mt-2 text-sm text-violet-900/80">
                      Период подставится из проекта, но ты сможешь изменить даты и оформить заявку только на часть
                      мероприятия.
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {archiveModalOpen && typeof document !== "undefined"
            ? createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/40 p-4">
                  <div
                    className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="project-archive-title"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div id="project-archive-title" className="text-lg font-extrabold tracking-tight text-zinc-950">
                          Убрать проект в архив
                        </div>
                        <p className="mt-1 text-sm text-zinc-600">
                          Выбери итоговый статус и при необходимости оставь комментарий — он появится на карточке в списке
                          архива. После архивации редактирование проекта будет недоступно.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={secondaryBtn}
                        onClick={() => {
                          setArchiveModalOpen(false);
                          setArchiveError(null);
                        }}
                      >
                        Закрыть
                      </button>
                    </div>
                    {archiveError ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {archiveError}
                      </div>
                    ) : null}
                    <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Статус при закрытии
                      <select
                        value={archiveModalStatus}
                        onChange={(e) => setArchiveModalStatus(e.target.value as "COMPLETED" | "CANCELLED")}
                        className={`mt-1 ${inputField}`}
                      >
                        {PROJECT_TERMINAL_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {PROJECT_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      Комментарий (необязательно)
                      <textarea
                        value={archiveModalNote}
                        onChange={(e) => setArchiveModalNote(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        placeholder="Кратко: итог, причина отмены, ссылка на акт…"
                        className={`mt-1 ${inputField}`}
                      />
                    </label>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className={secondaryBtn}
                        onClick={() => {
                          setArchiveModalOpen(false);
                          setArchiveError(null);
                        }}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className={primaryBtn}
                        disabled={archiveBusy}
                        onClick={() => void confirmArchiveToModal()}
                      >
                        {archiveBusy ? "Сохраняю…" : "В архив"}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            : null}
        </div>
      )}
    </AppShell>
  );
}
