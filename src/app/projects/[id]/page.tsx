"use client";

import "@/app/catalog/catalog.css";
import "react-day-picker/style.css";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { createPortal } from "react-dom";
import { format, parse } from "date-fns";
import { ru } from "date-fns/locale";
import { DayPicker, type DateRange } from "react-day-picker";

import { AppShell } from "@/app/_ui/AppShell";
import { OrderStatusStepper, orderStatusLabelRu, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
import { ProjectDetailSkeleton } from "@/app/_ui/Skeleton";
import {
  CONTACT_PATCH_FIELD_LABEL,
  PROJECT_ACTIVITY_KIND_LABEL,
  PROJECT_PATCH_FIELD_LABEL,
  formatActivityValue,
} from "@/lib/project-activity-ui";
import {
  PROJECT_BALL_LABEL,
  PROJECT_STATUS_GROUPS,
  PROJECT_STATUS_GROUP_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_TERMINAL_STATUSES,
  isProjectTerminalStatus,
  projectStatusPickerLabel,
} from "@/lib/project-ui-labels";
import { useAuth } from "@/app/providers";
import { projectReturnFallback, safeDetailReturnTo } from "@/lib/detail-return";
import { ProjectModuleBoundary, ProjectModuleSkeleton } from "./ProjectModuleBoundary";
import {
  ProjectWorkspaceSettings,
  type ProjectWorkspaceMember,
  type ProjectWorkspaceSavedData,
  type ProjectWorkspaceWidgetRecord,
} from "./ProjectWorkspaceSettings";
import { buildProjectWorkspaceDraft } from "@/lib/projects/project-workspace";
import {
  buildLegacyProjectWorkspaceDraft,
  resolveProjectWorkspaceView,
} from "@/lib/projects/project-workspace-rollout";
import {
  PROJECT_WIDGET_REGISTRY,
  type ProjectWidgetType,
} from "@/lib/projects/project-widget-registry";
import { ProjectWorkspaceDashboard } from "./ProjectWorkspaceDashboard";

import type { ProjectActivityKind, ProjectBall, ProjectStatus } from "@prisma/client";

const ProjectContactsPanel = dynamic(
  () => import("./ProjectContactsPanel").then((module) => module.ProjectContactsPanel),
  { ssr: false, loading: () => <ProjectModuleSkeleton title="Контакты" /> },
);
const ProjectEstimatePanel = dynamic(
  () => import("./ProjectEstimatePanel").then((module) => module.ProjectEstimatePanel),
  { ssr: false, loading: () => <ProjectModuleSkeleton title="Сметы проекта" /> },
);
const ProjectFilesPanel = dynamic(
  () => import("./ProjectFilesPanel").then((module) => module.ProjectFilesPanel),
  { ssr: false, loading: () => <ProjectModuleSkeleton title="Файлы" /> },
);
const ProjectFreeBoard = dynamic(
  () => import("./ProjectFreeBoard").then((module) => module.ProjectFreeBoard),
  { ssr: false, loading: () => <ProjectModuleSkeleton title="Свободная доска" /> },
);
const ProjectSchedulePanel = dynamic(
  () => import("./ProjectSchedulePanel").then((module) => module.ProjectSchedulePanel),
  { ssr: false, loading: () => <ProjectModuleSkeleton title="Тайминг" /> },
);

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

type LinkableOrder = {
  id: string;
  status: OrderStatus;
  source: "GREENWICH_INTERNAL" | "WOWSTORG_EXTERNAL";
  eventName: string | null;
  readyByDate: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  linesCount: number;
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
  mode: "FULL" | "ESTIMATE_ONLY";
  leadCustomerName: string | null;
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
  customer: { id: string; name: string; logoUrl?: string | null } | null;
  owner: { id: string; displayName: string };
  createdBy: { id: string; displayName: string };
  revision: number;
  members: ProjectWorkspaceMember[];
  widgets: ProjectWorkspaceWidgetRecord[];
  _count: {
    orders: number;
    tasks: number;
    contacts: number;
    projectFiles: number;
    scheduleDays: number;
  };
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

const sectionShell =
  "rounded-xl border border-zinc-200 bg-white p-3 sm:p-4";
const softShell =
  "rounded-xl border border-zinc-200 bg-white p-3 sm:p-4";
const glassSectionHeader =
  "flex flex-col gap-3 border-b border-zinc-200 pb-3 sm:flex-row sm:items-center sm:justify-between";
const glassSectionTitle = "text-lg font-black tracking-tight text-zinc-950";
const inputField =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50";
const primaryBtn =
  "rounded-md border border-zinc-950 bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:border-yellow-400 hover:bg-yellow-400 hover:text-zinc-950 disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-950 disabled:opacity-50";
const iconBtn =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50";
const metaBadge =
  "inline-flex items-center rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700";
const PROJECT_WIDGET_WIDTH_CLASS: Record<4 | 6 | 8 | 12, string> = {
  4: "lg:col-span-4",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

const PROJECT_WIDGET_MIN_HEIGHT: Record<"COMPACT" | "MEDIUM" | "LARGE" | "AUTO", number | undefined> = {
  COMPACT: 220,
  MEDIUM: 340,
  LARGE: 520,
  AUTO: undefined,
};

const PROJECT_STATUS_NEXT: Partial<Record<ProjectStatus, ProjectStatus>> = {
  LEAD: "BRIEFING",
  BRIEFING: "INTERNAL_PREP",
  INTERNAL_PREP: "PROPOSAL_SENT",
  PROPOSAL_SENT: "CONTRACT_PREP",
  PROPOSAL_REVISION: "CONTRACT_PREP",
  CONTRACT_PREP: "CONTRACT_SENT",
  CONTRACT_SENT: "CONTRACT_SIGNED",
  CONTRACT_SIGNED: "PREPRODUCTION",
  PREPRODUCTION: "READY_TO_RUN",
  AWAITING_CLIENT_INPUT: "PROPOSAL_REVISION",
  AWAITING_VENDOR: "PREPRODUCTION",
  READY_TO_RUN: "LIVE",
  LIVE: "WRAP_UP",
  WRAP_UP: "COMPLETED",
  ON_HOLD: "BRIEFING",
};

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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-sm font-black text-violet-700 shadow-sm hover:bg-violet-100"
        aria-label={title}
      >
        !
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

function toProjectYmd(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "";
}

function parseProjectYmd(value: string | null | undefined) {
  const ymd = toProjectYmd(value);
  if (!ymd) return undefined;
  const parsed = parse(ymd, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M7 2a1 1 0 011 1v1h8V3a1 1 0 112 0v1h1.5A2.5 2.5 0 0122 6.5v12A2.5 2.5 0 0119.5 21h-15A2.5 2.5 0 012 18.5v-12A2.5 2.5 0 014.5 4H6V3a1 1 0 011-1zm12.5 8h-15v8.5a.5.5 0 00.5.5h14a.5.5 0 00.5-.5V10zM5 6a.5.5 0 00-.5.5V8h15V6.5A.5.5 0 0019 6H5z" />
    </svg>
  );
}

function ProjectEventDatePicker({
  startDate,
  endDate,
  onRangeChange,
}: {
  startDate: string;
  endDate: string;
  onRangeChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo<DateRange | undefined>(
    () => ({
      from: parseProjectYmd(startDate),
      to: parseProjectYmd(endDate),
    }),
    [startDate, endDate],
  );
  const summary =
    startDate && endDate
      ? `${fmtDate(startDate)} — ${fmtDate(endDate)}`
      : startDate
        ? `c ${fmtDate(startDate)}`
        : endDate
          ? `до ${fmtDate(endDate)}`
          : "Выбрать период";

  function applyRange(range: DateRange | undefined) {
    if (!range?.from) {
      onRangeChange("", "");
      return;
    }
    const nextStart = format(range.from, "yyyy-MM-dd");
    const nextEnd = format(range.to ?? range.from, "yyyy-MM-dd");
    onRangeChange(nextStart, nextEnd);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-left text-sm font-bold text-zinc-950 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <CalendarIcon />
          </span>
          <span className="min-w-0 truncate">{summary}</span>
        </span>
        <span className="text-xs font-black uppercase tracking-[0.12em] text-violet-700">Изменить</span>
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[95] flex items-center justify-center bg-zinc-950/35 px-4 py-6 backdrop-blur-sm"
              onMouseDown={() => setOpen(false)}
            >
              <div
                className="w-full max-w-[44rem] overflow-hidden rounded-[2rem] border border-white/80 bg-white/95 p-4 shadow-[0_30px_90px_rgba(24,24,27,0.22)]"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">Даты мероприятия</div>
                    <div className="mt-1 text-xl font-black text-zinc-950">Выбор периода</div>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className={secondaryBtn}>
                    Закрыть
                  </button>
                </div>
                <div className="mt-4 rounded-[1.5rem] border border-violet-100 bg-[linear-gradient(135deg,rgba(250,245,255,0.86),rgba(255,255,255,0.96))] p-3">
                  <DayPicker
                    mode="range"
                    selected={selected}
                    onSelect={applyRange}
                    locale={ru}
                    numberOfMonths={2}
                    weekStartsOn={1}
                    fixedWeeks
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => onRangeChange("", "")} className={secondaryBtn}>
                    Очистить даты
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className={primaryBtn}>
                    Готово
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ProjectStatusGroupedMenu({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (value: ProjectStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});

  const updateMenuPosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.max(rect.width, 320),
      zIndex: 80,
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    return () => {
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [open, updateMenuPosition]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) updateMenuPosition();
            return next;
          });
        }}
        className={`inline-flex min-h-11 min-w-[14rem] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-sm ${projectStatusTone(value)}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-70">Статус</span>
          <span className="block text-sm font-semibold">{PROJECT_STATUS_LABEL[value]}</span>
        </span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.06z" fill="currentColor" />
        </svg>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="max-h-[min(24rem,calc(100vh-6rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-[0_18px_48px_rgba(24,24,27,0.14)]"
              role="listbox"
            >
              {PROJECT_STATUS_GROUPS.map((group, groupIndex) => (
                <div key={group.id} className={groupIndex > 0 ? "mt-1 border-t border-zinc-100 pt-1" : ""}>
                  <div className="sticky top-0 z-10 rounded-lg bg-zinc-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
                    {PROJECT_STATUS_GROUP_LABEL[group.id]}
                  </div>
                  {group.items.map((option) => {
                    const shortLabel = projectStatusPickerLabel(option);
                    const fullLabel = PROJECT_STATUS_LABEL[option];
                    const showFullHint = shortLabel !== fullLabel;

                    return (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        aria-selected={option === value}
                        className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm ${
                          option === value ? "bg-violet-50 text-violet-950" : "text-zinc-800 hover:bg-zinc-50"
                        }`}
                        onClick={() => {
                          onChange(option);
                          setOpen(false);
                        }}
                      >
                        <span className="font-semibold">{shortLabel}</span>
                        {showFullHint ? <span className="mt-0.5 text-[11px] leading-snug text-zinc-500">{fullLabel}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ProjectStatusBallEditPanel({
  status,
  ball,
  recommendedStatus,
  saveBusy,
  onStatusChange,
  onBallChange,
  onSave,
  onCancel,
}: {
  status: ProjectStatus;
  ball: ProjectBall;
  recommendedStatus: ProjectStatus | null;
  saveBusy: boolean;
  onStatusChange: (status: ProjectStatus) => void;
  onBallChange: (ball: ProjectBall) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ballOptions = Object.keys(PROJECT_BALL_LABEL) as ProjectBall[];

  return (
    <div className="mt-3 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm">
      {recommendedStatus ? (
        <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-violet-100 bg-violet-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Следующий логичный шаг</div>
            <div className="mt-0.5 text-sm font-bold text-violet-950">{PROJECT_STATUS_LABEL[recommendedStatus]}</div>
          </div>
          <button
            type="button"
            onClick={() => onStatusChange(recommendedStatus)}
            className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-violet-700"
          >
            Выбрать
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-[minmax(14rem,1fr)_minmax(0,1.6fr)]">
        <ProjectStatusGroupedMenu value={status} onChange={onStatusChange} />
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Мяч</div>
          <div className="flex flex-wrap gap-2">
            {ballOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onBallChange(option)}
                className={[
                  "rounded-full border px-3 py-2 text-xs font-bold transition",
                  option === ball
                    ? `${projectBallTone(option)} shadow-sm`
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                ].join(" ")}
              >
                {PROJECT_BALL_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" disabled={saveBusy} onClick={onSave} className={`${primaryBtn} w-full sm:w-auto`}>
          Сохранить
        </button>
        <button type="button" onClick={onCancel} className={`${secondaryBtn} w-full sm:w-auto`}>
          Отмена
        </button>
      </div>
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

function ProjectTasksEmbed({
  projectId,
  projectTitle,
  readOnly,
}: {
  projectId: string;
  projectTitle: string;
  readOnly: boolean;
}) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = React.useState(236);

  React.useEffect(() => {
    const receiveHeight = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const payload = event.data as { type?: string; projectId?: string; height?: number } | null;
      if (
        payload?.type !== "wowstorg:tasks-embed-height"
        || payload.projectId !== projectId
        || typeof payload.height !== "number"
        || !Number.isFinite(payload.height)
      ) return;
      setContentHeight(Math.max(196, Math.min(1800, Math.ceil(payload.height))));
    };
    window.addEventListener("message", receiveHeight);
    return () => window.removeEventListener("message", receiveHeight);
  }, [projectId]);

  return (
    <iframe
      ref={iframeRef}
      title={`Задачи проекта ${projectTitle}`}
      src={`/tasks?embed=1&projectId=${encodeURIComponent(projectId)}${readOnly ? "&readOnly=1" : ""}`}
      className="project-tasks-embed w-full border-0 bg-white"
      style={{ height: contentHeight }}
    />
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { state } = useAuth();
  const role = state.status === "authenticated" ? state.user.role : null;
  const returnFallback = projectReturnFallback(searchParams.get("from"));
  const backHref = safeDetailReturnTo(searchParams.get("returnTo"), returnFallback.href);
  const forbidden = state.status === "authenticated" && role !== "WOWSTORG";
  const [workspaceFeatures, setWorkspaceFeatures] = React.useState({
    projectWorkspaceV2: true,
    projectEstimateGridV2: true,
  });
  const workspaceView = resolveProjectWorkspaceView(
    searchParams.get("workspace"),
    workspaceFeatures.projectWorkspaceV2,
  );
  const isWorkspaceV2 = workspaceView === "v2";
  const isEstimateGridV2 =
    workspaceFeatures.projectEstimateGridV2 ||
    searchParams.get("estimate")?.toLocaleLowerCase("en-US") === "v2" ||
    searchParams.get("workspace")?.toLocaleLowerCase("en-US") === "v2";

  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [draftDeleteBusy, setDraftDeleteBusy] = React.useState(false);
  const [draftDeleteError, setDraftDeleteError] = React.useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = React.useState(false);
  const [archiveModalStatus, setArchiveModalStatus] = React.useState<"COMPLETED" | "CANCELLED">("COMPLETED");
  const [archiveModalNote, setArchiveModalNote] = React.useState("");
  const [showAllLog, setShowAllLog] = React.useState(false);
  const [catalogModeOpen, setCatalogModeOpen] = React.useState(false);
  const [linkExistingOpen, setLinkExistingOpen] = React.useState(false);
  const [linkableOrders, setLinkableOrders] = React.useState<LinkableOrder[]>([]);
  const [linkableLoading, setLinkableLoading] = React.useState(false);
  const [selectedLinkOrderIds, setSelectedLinkOrderIds] = React.useState<string[]>([]);
  const [linkExistingBusy, setLinkExistingBusy] = React.useState(false);
  const [linkExistingError, setLinkExistingError] = React.useState<string | null>(null);
  const [selectedEstimateVersionNumber, setSelectedEstimateVersionNumber] = React.useState<number | null>(null);
  const [resolvedEstimateVersion, setResolvedEstimateVersion] = React.useState<{ id: string; versionNumber: number } | null>(null);
  const [title, setTitle] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus>("LEAD");
  const [ball, setBall] = React.useState<ProjectBall>("CLIENT");
  const [eventStartDate, setEventStartDate] = React.useState("");
  const [eventEndDate, setEventEndDate] = React.useState("");
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
  const workspaceWidgets = React.useMemo(
    () =>
      isWorkspaceV2
        ? buildProjectWorkspaceDraft(project?.widgets)
        : buildLegacyProjectWorkspaceDraft(),
    [isWorkspaceV2, project?.widgets],
  );
  const visibleWorkspaceTypes = React.useMemo(
    () => new Set(workspaceWidgets.filter((widget) => widget.isVisible).map((widget) => widget.type)),
    [workspaceWidgets],
  );
  const workspaceLayoutByType = React.useMemo(
    () => new Map(workspaceWidgets.map((widget) => [widget.type, widget] as const)),
    [workspaceWidgets],
  );

  function workspaceModuleClass(type: ProjectWidgetType, shellClass = "") {
    const width = workspaceLayoutByType.get(type)?.width ?? 12;
    return ["project-workspace-module col-span-1 min-w-0", PROJECT_WIDGET_WIDTH_CLASS[width], shellClass].filter(Boolean).join(" ");
  }

  function workspaceModuleStyle(type: ProjectWidgetType): React.CSSProperties {
    const widget = workspaceLayoutByType.get(type);
    return {
      order: widget?.sortOrder ?? 99,
      minHeight: isWorkspaceV2 ? PROJECT_WIDGET_MIN_HEIGHT[widget?.heightPreset ?? "AUTO"] : undefined,
    };
  }

  function applySavedWorkspace(workspace?: ProjectWorkspaceSavedData) {
    if (!workspace) {
      load();
      return;
    }
    setProject((current) =>
      current
        ? {
            ...current,
            revision: workspace.revision,
            owner: workspace.owner,
            members: workspace.members,
            widgets: workspace.widgets,
          }
        : current,
    );
  }

  /** true после первой успешной загрузки проекта — чтобы обновления не размонтировали страницу */
  const hasProjectRef = React.useRef(false);
  const loadRequestRef = React.useRef(0);
  React.useEffect(() => {
    hasProjectRef.current = project != null;
  }, [project]);

  const load = React.useCallback(async () => {
    if (!id || state.status !== "authenticated" || role !== "WOWSTORG") return;
    const requestId = ++loadRequestRef.current;
    // Важно: не «сбрасываем» всю страницу на "Загрузка…", иначе скролл прыгает вверх
    // при любом патче (файлы/тайминг/смета), т.к. контент размонтируется.
    if (hasProjectRef.current) setRefreshing(true);
    else setInitialLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/projects/${id}?includeOrders=1&includeActivity=1`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | {
            project?: ProjectDetail;
            features?: {
              projectWorkspaceV2?: boolean;
              projectEstimateGridV2?: boolean;
            };
            error?: { message?: string };
          }
        | null;
      if (requestId !== loadRequestRef.current) return;

      if (!response.ok || !data?.project) {
        setProject(null);
        setLoadError(
          response.status === 404
            ? "Проект не найден или был удалён."
            : data?.error?.message ?? "Не удалось загрузить проект. Проверьте соединение и повторите попытку.",
        );
        return;
      }

      setProject(data.project);
      setWorkspaceFeatures({
        projectWorkspaceV2: data.features?.projectWorkspaceV2 ?? true,
        projectEstimateGridV2: data.features?.projectEstimateGridV2 ?? true,
      });
      setTitle(data.project.title);
      setStatus(data.project.status);
      setBall(data.project.ball);
      setEventStartDate(data.project.eventStartDate ?? "");
      setEventEndDate(data.project.eventEndDate ?? "");
      setEventDateConfirmed(data.project.eventDateConfirmed);
      setOpenBlockers(data.project.openBlockers ?? "");
      setInternalSummary(data.project.internalSummary ?? "");
    } catch {
      if (requestId !== loadRequestRef.current) return;
      setProject(null);
      setLoadError("Не удалось загрузить проект. Проверьте соединение и повторите попытку.");
    } finally {
      if (requestId === loadRequestRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
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

  React.useEffect(() => {
    if (!linkExistingOpen) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-link-existing-modal]")) return;
      setLinkExistingOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [linkExistingOpen]);

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

  async function openLinkExistingModal() {
    if (readOnly) return;
    setLinkExistingError(null);
    setSelectedLinkOrderIds([]);
    setLinkExistingOpen(true);
    setLinkableLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}/orders/linkable`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | { orders?: LinkableOrder[]; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setLinkableOrders([]);
        setLinkExistingError(data?.error?.message ?? "Не удалось загрузить список заявок");
        return;
      }
      setLinkableOrders(data?.orders ?? []);
    } catch {
      setLinkableOrders([]);
      setLinkExistingError("Не удалось загрузить список заявок");
    } finally {
      setLinkableLoading(false);
    }
  }

  async function linkExistingOrders() {
    if (selectedLinkOrderIds.length === 0) return;
    setLinkExistingBusy(true);
    setLinkExistingError(null);
    try {
      const res = await fetch(`/api/projects/${id}/orders/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedLinkOrderIds,
          ...(activeEstimateVersionId ? { targetEstimateVersionId: activeEstimateVersionId } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setLinkExistingError(data?.error?.message ?? "Не удалось привязать заявки");
        return;
      }
      setLinkExistingOpen(false);
      setSelectedLinkOrderIds([]);
      load();
      window.dispatchEvent(new CustomEvent("project-activity-refresh"));
    } finally {
      setLinkExistingBusy(false);
    }
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

  const recommendedStatus = project ? PROJECT_STATUS_NEXT[project.status] ?? null : null;

  function renderWorkspaceWidget(type: ProjectWidgetType): React.ReactNode {
    if (!project) return null;
    if (type === "ESTIMATE") {
      return (
        <ProjectModuleBoundary title="Сметы проекта" resetKey={`${id}:estimate:inline`}>
          <ProjectEstimatePanel
            projectId={id}
            readOnly={readOnly}
            workspaceMode
            estimateGridEnabled={isEstimateGridV2}
            selectedVersionNumber={selectedEstimateVersionNumber}
            onSelectedVersionNumberChange={setSelectedEstimateVersionNumber}
            onResolvedVersionChange={setResolvedEstimateVersion}
          />
        </ProjectModuleBoundary>
      );
    }
    if (type === "TASKS") {
      return (
        <ProjectTasksEmbed
          projectId={id}
          projectTitle={project.title}
          readOnly={readOnly}
        />
      );
    }
    if (type === "SCHEDULE") {
      return <ProjectModuleBoundary title="Тайминг" resetKey={`${id}:schedule:inline`}><ProjectSchedulePanel projectId={id} readOnly={readOnly} /></ProjectModuleBoundary>;
    }
    if (type === "FILES") {
      return <ProjectModuleBoundary title="Файлы" resetKey={`${id}:files:inline`}><ProjectFilesPanel projectId={id} readOnly={readOnly} /></ProjectModuleBoundary>;
    }
    if (type === "CONTACTS") {
      return <ProjectModuleBoundary title="Контакты" resetKey={`${id}:contacts:inline`}><ProjectContactsPanel projectId={id} readOnly={readOnly} /></ProjectModuleBoundary>;
    }
    if (type === "FREE_BOARD") {
      return (
        <ProjectModuleBoundary title="Свободная доска" resetKey={`${id}:free-board:inline`}>
          <ProjectFreeBoard projectId={id} actorUserId={state.status === "authenticated" ? state.user.id : "anonymous"} readOnly={readOnly} />
        </ProjectModuleBoundary>
      );
    }
    if (type === "NOTES") {
      return (
        <div className="project-status-panel">
          <label className="project-status-panel__field">
            <span>Контекст</span>
            <textarea value={internalSummary} onChange={(event) => setInternalSummary(event.target.value)} readOnly={readOnly} className="mt-2 min-h-32 flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-zinc-900 outline-none focus:shadow-none" placeholder="Договорённости, решения и общий контекст проекта" />
            {!readOnly ? <button type="button" disabled={saveBusy} onClick={() => void patchField({ internalSummary: internalSummary.trim() || null })}>Сохранить</button> : null}
          </label>
          <label className="project-status-panel__field project-status-panel__field--attention">
            <span><i aria-hidden /> Требует внимания</span>
            <textarea value={openBlockers} onChange={(event) => setOpenBlockers(event.target.value)} readOnly={readOnly} className="mt-2 min-h-32 flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 text-zinc-900 outline-none focus:shadow-none" placeholder="Что мешает двигаться дальше и от кого ждём решение" />
            {!readOnly ? <button type="button" disabled={saveBusy} onClick={() => void patchField({ openBlockers: openBlockers.trim() || null })}>Сохранить</button> : null}
          </label>
        </div>
      );
    }
    if (type === "HISTORY") {
      return project.activityLogs?.length ? (
        <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
          {project.activityLogs.map((row) => (
            <li key={row.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
              <div className="min-w-0"><div className="truncate font-bold text-zinc-950">{PROJECT_ACTIVITY_KIND_LABEL[row.kind] ?? row.kind}</div><div className="mt-0.5 text-xs text-zinc-500">{row.actor.displayName}</div><div className="mt-1 text-xs leading-5 text-zinc-700"><ActivityDescription row={row} /></div></div>
              <time className="text-xs font-semibold text-zinc-400">{fmtDateTime(row.createdAt)}</time>
            </li>
          ))}
        </ul>
      ) : <div className="px-5 py-12 text-center text-sm text-zinc-500">История пока пуста.</div>;
    }
    if (type === "ORDERS") {
      return (
        <div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
              <button type="button" onClick={openProjectCatalogEntry} className="rounded-md bg-yellow-400 px-3 py-2 text-xs font-extrabold text-zinc-950 hover:bg-yellow-300">Добавить реквизит</button>
              <button type="button" onClick={() => void openLinkExistingModal()} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-800 hover:border-zinc-950">Привязать заявку</button>
            </div>
          ) : null}
          {project.orders?.length ? project.orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}?from=project&returnTo=${encodeURIComponent(`/projects/${id}`)}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0 hover:bg-zinc-50">
              <span className="min-w-0"><span className="block truncate font-bold text-zinc-950">{order.eventName?.trim() || `Заявка ${order.id.slice(0, 8)}`}</span><span className="mt-0.5 block text-xs text-zinc-500">{fmtDate(order.startDate)} — {fmtDate(order.endDate)}</span></span>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800">{orderStatusLabelRu[order.status] ?? order.status}</span>
            </Link>
          )) : <div className="px-4 py-12 text-center text-sm text-zinc-500">Связанных заявок пока нет.</div>}
        </div>
      );
    }
    return null;
  }

  return (
    <AppShell title="Проекты" backHref={backHref}>
      {forbidden ? (
        <div className="text-sm text-zinc-600">Этот раздел доступен только Wowstorg (склад).</div>
      ) : initialLoading ? (
        <ProjectDetailSkeleton />
      ) : !project ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 sm:p-6" role="alert">
          <div className="text-sm font-black text-red-950">Не удалось открыть карточку проекта</div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
            {loadError ?? "Проект не найден или недоступен."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className={primaryBtn}>
              Повторить
            </button>
            <Link href={backHref} className={secondaryBtn}>
              {returnFallback.label}
            </Link>
          </div>
        </section>
      ) : (
        <div className="project-detail-page space-y-4">
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

          <section className="project-detail-hero">
            <div className="project-detail-hero__surface">
              <div className="project-detail-hero__primary min-w-0">
                <div className="project-detail-hero__crumbs">
                  <Link href={backHref} className="project-detail-hero__back" aria-label={returnFallback.label}>←</Link>
                  <span className="truncate">{project.customer?.name ?? project.leadCustomerName ?? "Заказчик не указан"}</span>
                  <span aria-hidden className="project-detail-hero__crumb-separator">/</span>
                  <span className="shrink-0">{project.members.length} участн.</span>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    {editingField === "title" && !readOnly ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className={`${inputField} text-xl font-black sm:text-2xl`}
                          maxLength={300}
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={saveBusy || !title.trim()}
                          onClick={() => void patchField({ title: title.trim() })}
                          className={`${primaryBtn} sm:w-auto`}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTitle(project.title);
                            setEditingField(null);
                          }}
                          className={`${secondaryBtn} sm:w-auto`}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => !readOnly && setEditingField("title")}
                        disabled={readOnly}
                        className={`project-detail-hero__title block break-words text-left ${
                          readOnly ? "cursor-default" : "rounded outline-none transition-colors hover:text-violet-900 focus:ring-2 focus:ring-violet-100"
                        }`}
                      >
                        {project.title}
                      </button>
                    )}
                    <div className="project-detail-hero__states">
                      <button
                        type="button"
                        onClick={() => !readOnly && setEditingField((v) => (v === "status" ? null : "status"))}
                        disabled={readOnly}
                        className={`project-detail-hero__state ${projectStatusTone(project.status)} ${readOnly ? "cursor-default" : "hover:brightness-95"}`}
                      >
                        {PROJECT_STATUS_LABEL[project.status]}
                      </button>
                      <button
                        type="button"
                        onClick={() => !readOnly && setEditingField((v) => (v === "status" ? null : "status"))}
                        disabled={readOnly}
                        className={`project-detail-hero__state ${projectBallTone(project.ball)} ${readOnly ? "cursor-default" : "hover:brightness-95"}`}
                      >
                        Мяч: {PROJECT_BALL_LABEL[project.ball]}
                      </button>
                    </div>
                    {editingField === "status" && !readOnly ? (
                      <ProjectStatusBallEditPanel
                        status={status}
                        ball={ball}
                        recommendedStatus={recommendedStatus}
                        saveBusy={saveBusy}
                        onStatusChange={setStatus}
                        onBallChange={setBall}
                        onSave={() => void patchField({ status, ball })}
                        onCancel={() => {
                          setStatus(project.status);
                          setBall(project.ball);
                          setEditingField(null);
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="project-detail-hero__meta">
                  <span className="project-detail-hero__meta-item"><span>Ответственный</span><strong>{project.owner.displayName}</strong></span>
                  <button
                    type="button"
                    onClick={() => !readOnly && setEditingField((v) => (v === "eventDates" ? null : "eventDates"))}
                    disabled={readOnly}
                    className={`project-detail-hero__meta-item outline-none ${readOnly ? "cursor-default" : "hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-200"}`}
                  >
                    <CalendarIcon />
                    <strong>{formatProjectDateRange(project.eventStartDate, project.eventEndDate, project.eventDateNote)}</strong>
                    <span className={`h-1.5 w-1.5 rounded-full ${project.eventDateConfirmed ? "bg-emerald-500" : "bg-amber-400"}`} aria-label={project.eventDateConfirmed ? "Даты подтверждены" : "Даты не подтверждены"} />
                  </button>
                  <span className="project-detail-hero__meta-item"><strong className="tabular-nums">{project._count.orders}</strong><span>заявок</span></span>
                  <span className="project-detail-hero__meta-item project-detail-hero__meta-item--muted"><span>Создан</span><strong>{fmtDate(project.createdAt)}</strong></span>
                </div>
                {editingField === "eventDates" && !readOnly ? (
                      <div className="mt-3 max-w-xl space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <ProjectEventDatePicker
                          startDate={eventStartDate}
                          endDate={eventEndDate}
                          onRangeChange={(start, end) => {
                            setEventStartDate(start);
                            setEventEndDate(end);
                          }}
                        />
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700">
                          <span>Дата подтверждена</span>
                          <input
                            type="checkbox"
                            checked={eventDateConfirmed}
                            onChange={(e) => setEventDateConfirmed(e.target.checked)}
                            className="h-5 w-5 accent-violet-600"
                          />
                        </label>
                        <div className="flex gap-2">
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
                            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white"
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
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                ) : null}
              </div>

              <div className="project-detail-hero__actions">
                  {isWorkspaceV2 ? (
                    <ProjectWorkspaceSettings
                      projectId={id}
                      revision={project.revision}
                      owner={project.owner}
                      members={project.members}
                      widgets={project.widgets}
                      readOnly={readOnly}
                      onSaved={applySavedWorkspace}
                    />
                  ) : null}
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
                      className={`project-detail-hero__catalog ${readOnly ? "pointer-events-none opacity-50" : ""}`}
                      aria-disabled={readOnly}
                    >
                      Каталог → реквизит
                    </Link>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => openArchiveModal()}
                        disabled={archiveBusy || !canArchiveProject}
                        className="project-detail-hero__archive"
                        title={
                          canArchiveProject
                            ? undefined
                            : "Сначала завершите или отмените все заявки, привязанные к проекту"
                        }
                      >
                        В архив
                      </button>
                    ) : null}
              </div>
            </div>
          </section>

          {!isWorkspaceV2 ? (
            <section className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-amber-950">Безопасный классический вид</div>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Все рабочие блоки показаны в фиксированной компоновке. Данные проекта остаются теми же.
                </p>
              </div>
              <Link
                href={`?${new URLSearchParams({
                  ...Object.fromEntries(searchParams.entries()),
                  workspace: "v2",
                }).toString()}`}
                className={`${secondaryBtn} shrink-0 text-center`}
              >
                Открыть новый вид
              </Link>
            </section>
          ) : null}

          <ProjectWorkspaceDashboard
            projectId={id}
            widgets={workspaceWidgets}
            renderWidget={renderWorkspaceWidget}
          />

          {/* Legacy inline workspace retained temporarily for safe rollback while the dashboard is validated.
          <div className="project-workspace-grid grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
          {visibleWorkspaceTypes.has("TASKS") ? <section
            id="project-module-tasks"
            className={workspaceModuleClass("TASKS", softShell)}
            style={workspaceModuleStyle("TASKS")}
          >
            <div className={glassSectionHeader}>
              <div className="flex items-center gap-2">
                <div className={glassSectionTitle}>Задачи проекта</div>
                <HelpLegend title="Задачи проекта">
                  Здесь видны только задачи этого проекта. Новую задачу можно создать здесь или в общем YouGile, если указать этот проект в карточке задачи.
                </HelpLegend>
              </div>
              <Link
                href={`/tasks?projectId=${encodeURIComponent(id)}`}
                className={`${secondaryBtn} w-full text-center sm:w-auto`}
              >
                Открыть в YouGile
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-violet-100 bg-white/70">
              <iframe
                title={`Задачи проекта ${project.title}`}
                src={`/tasks?embed=1&projectId=${encodeURIComponent(id)}${readOnly ? "&readOnly=1" : ""}`}
                className="h-[34rem] w-full border-0 bg-transparent"
              />
            </div>
          </section> : null}

            <section className="hidden" aria-hidden="true">
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
                        <div className="mt-3">
                          <ProjectStatusBallEditPanel
                            status={status}
                            ball={ball}
                            recommendedStatus={recommendedStatus}
                            saveBusy={saveBusy}
                            onStatusChange={setStatus}
                            onBallChange={setBall}
                            onSave={() => void patchField({ status, ball })}
                            onCancel={() => {
                              setStatus(project.status);
                              setBall(project.ball);
                              setEditingField(null);
                            }}
                          />
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

            {visibleWorkspaceTypes.has("NOTES") ? <section
              id="project-module-notes"
              className={workspaceModuleClass("NOTES", `${softShell} h-full`)}
              style={workspaceModuleStyle("NOTES")}
            >
              <div className={glassSectionHeader}>
                <div className="flex items-center gap-2">
                  <div className={glassSectionTitle}>Рабочие заметки</div>
                  <HelpLegend title="Рабочие заметки">
                    «Блокеры» — что мешает двигаться дальше. «Внутреннее резюме» — короткая памятка для команды: договоренности, риски, важные нюансы.
                  </HelpLegend>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Блокеры</div>
                      {editingField === "openBlockers" && !readOnly ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={openBlockers}
                            onChange={(e) => setOpenBlockers(e.target.value)}
                            rows={3}
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
                            rows={3}
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
            </section> : null}
          {visibleWorkspaceTypes.has("CONTACTS") ? (
            <div
              id="project-module-contacts"
              className={workspaceModuleClass("CONTACTS")}
              style={workspaceModuleStyle("CONTACTS")}
            >
              <ProjectModuleBoundary title="Контакты" resetKey={`${id}:contacts`}>
                <ProjectContactsPanel projectId={id} readOnly={readOnly} />
              </ProjectModuleBoundary>
            </div>
          ) : null}

          <div
            id="project-module-orders"
            className={workspaceModuleClass("ORDERS", softShell)}
            style={workspaceModuleStyle("ORDERS")}
          >
            <div className={glassSectionHeader}>
              <div className="flex items-center gap-2">
                <div className={glassSectionTitle}>Заявки реквизита</div>
                <HelpLegend title="Как работает блок заявок">
                  Нажми «Каталог → реквизит», чтобы собрать новую заявку для проекта. Если даты еще не подтверждены, это будет черновик без резерва склада. «Привязать существующую» нужно, когда заявка уже создана отдельно и ее надо добавить в проект.
                </HelpLegend>
              </div>
              {!readOnly ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <button type="button" onClick={openProjectCatalogEntry} className={`${primaryBtn} w-full sm:w-auto`}>
                    Каталог → реквизит
                  </button>
                  <button
                    type="button"
                    onClick={() => void openLinkExistingModal()}
                    className={`${secondaryBtn} w-full sm:w-auto`}
                  >
                    Привязать существующую
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-2">
              <span className={metaBadge}>
                Версия сметы: {activeEstimateVersionNumber != null ? `v${activeEstimateVersionNumber}` : "будет создана автоматически"}
              </span>
              <span className={metaBadge}>
                {projectHasConfirmedDates ? "Даты подтверждены: доступен обычный каталог" : "Даты не подтверждены: доступен demo-каталог"}
              </span>
              {hasDraftOrder ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                  Demo-заявка
                  <HelpLegend title="Что значит demo-заявка">
                    Это предварительная корзина без дат. Она помогает посчитать смету заранее, но склад ничего не резервирует, пока ты не выберешь реальные даты.
                  </HelpLegend>
                </span>
              ) : null}
            </div>
            {!hasDraftOrder && !project.orders?.length ? (
              <p className="mt-3 text-sm text-zinc-600">Пока нет ни demo-заявки, ни привязанных реальных заявок.</p>
            ) : (
              <ul className="space-y-3">
                {project.draftOrder && project.draftOrder.linesCount > 0 ? (
                  <li className="rounded-xl border border-violet-200 bg-[linear-gradient(180deg,rgba(250,245,255,0.94),rgba(255,255,255,0.98))] shadow-sm overflow-hidden">
                    <details className="group">
                      <summary className="cursor-pointer list-none px-3 py-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                                Demo
                              </span>
                              <span className="text-sm font-semibold text-zinc-900">
                                {project.draftOrder.title?.trim() || "Без названия demo-набора"}
                              </span>
                              <HelpLegend title="Demo-режим">
                                Используй demo, когда клиент еще не подтвердил даты. Когда даты появятся, создай из него реальную заявку, и позиции попадут в работу склада.
                              </HelpLegend>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span>{project.draftOrder.linesCount} поз.</span>
                              <span>·</span>
                              <span>обновлено {fmtDateTime(project.draftOrder.updatedAt)}</span>
                              {project.draftOrder.estimateVersionId === activeEstimateVersionId && activeEstimateVersionNumber != null ? (
                                <>
                                  <span>·</span>
                                  <span className="font-medium text-violet-700">привязано к v{activeEstimateVersionNumber}</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-violet-700 group-open:hidden">Развернуть</span>
                            <span className="hidden text-xs font-medium text-violet-700 group-open:inline">Свернуть</span>
                          </div>
                        </div>
                      </summary>
                      <div className="border-t border-violet-100 px-3 pb-3 pt-3 sm:px-4">
                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
                          <div className="min-w-0 rounded-2xl border border-violet-100 bg-white/90 p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-zinc-900">Содержимое demo-заявки</div>
                              <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
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
                                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-50 px-2 text-[11px] font-bold text-violet-700">
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
                                      <div className="shrink-0 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-right">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">Сумма</div>
                                        <div className="text-sm font-bold text-violet-900">{fmtMoney(lineTotal)} ₽</div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-violet-100 bg-white/90 p-3 shadow-sm">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-zinc-900">Действия</div>
                              <HelpLegend title="Что можно сделать">
                                Открой demo-каталог, чтобы поменять состав. Когда даты известны, преврати demo в реальную заявку. Если черновик больше не нужен, удали его.
                              </HelpLegend>
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

          {visibleWorkspaceTypes.has("FREE_BOARD") ? (
            <section
              id="project-module-free-board"
              className={workspaceModuleClass("FREE_BOARD")}
              style={workspaceModuleStyle("FREE_BOARD")}
            >
              <ProjectModuleBoundary title="Свободная доска" resetKey={`${id}:free-board`}>
                <ProjectFreeBoard
                  projectId={id}
                  actorUserId={state.status === "authenticated" ? state.user.id : "anonymous"}
                  readOnly={readOnly}
                />
              </ProjectModuleBoundary>
            </section>
          ) : null}

          {visibleWorkspaceTypes.has("ESTIMATE") ? (
            <section
              id="project-module-estimate"
              className={workspaceModuleClass("ESTIMATE")}
              style={workspaceModuleStyle("ESTIMATE")}
            >
              <ProjectModuleBoundary title="Сметы проекта" resetKey={`${id}:estimate`}>
                <ProjectEstimatePanel
                  projectId={id}
                  readOnly={readOnly}
                  estimateGridEnabled={isEstimateGridV2}
                  selectedVersionNumber={selectedEstimateVersionNumber}
                  onSelectedVersionNumberChange={setSelectedEstimateVersionNumber}
                  onResolvedVersionChange={setResolvedEstimateVersion}
                />
              </ProjectModuleBoundary>
            </section>
          ) : null}

          {visibleWorkspaceTypes.has("SCHEDULE") ? (
            <section
              id="project-module-schedule"
              className={workspaceModuleClass("SCHEDULE")}
              style={workspaceModuleStyle("SCHEDULE")}
            >
              <ProjectModuleBoundary title="Тайминг" resetKey={`${id}:schedule`}>
                <ProjectSchedulePanel projectId={id} readOnly={readOnly} />
              </ProjectModuleBoundary>
            </section>
          ) : null}

          {visibleWorkspaceTypes.has("FILES") ? (
            <section
              id="project-module-files"
              className={workspaceModuleClass("FILES")}
              style={workspaceModuleStyle("FILES")}
            >
              <ProjectModuleBoundary title="Файлы" resetKey={`${id}:files`}>
                <ProjectFilesPanel projectId={id} readOnly={readOnly} />
              </ProjectModuleBoundary>
            </section>
          ) : null}

          {visibleWorkspaceTypes.has("HISTORY") ? (
            <section
              id="project-module-history"
              className={workspaceModuleClass("HISTORY", sectionShell)}
              style={workspaceModuleStyle("HISTORY")}
            >
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
            </section>
          ) : null}
          </div>
          */}

          {linkExistingOpen && typeof document !== "undefined"
            ? createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/45 p-4">
                  <div
                    data-link-existing-modal
                    className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_rgba(24,24,27,0.26)]"
                  >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-extrabold tracking-tight text-zinc-950">Привязать существующие заявки</div>
                    <p className="mt-1 text-sm text-zinc-600">
                      Показаны активные заявки заказчика «{project?.customer?.name ?? project?.leadCustomerName ?? "—"}», которые ещё не привязаны к
                      проекту. После привязки блок реквизита добавится в{" "}
                      {activeEstimateVersionNumber != null ? `смету v${activeEstimateVersionNumber}` : "смету проекта"}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkExistingOpen(false);
                      setLinkExistingError(null);
                    }}
                    className={secondaryBtn}
                  >
                    Закрыть
                  </button>
                </div>

                {linkExistingError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {linkExistingError}
                  </div>
                ) : null}

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
                  {linkableLoading ? (
                    <div className="text-sm text-zinc-600">Загружаем список заявок…</div>
                  ) : linkableOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                      Нет доступных заявок для привязки. Показываются только активные заявки этого заказчика без
                      привязки к другому проекту.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkableOrders.map((order) => (
                        <label
                          key={order.id}
                          className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-800 shadow-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedLinkOrderIds.includes(order.id)}
                            onChange={(e) =>
                              setSelectedLinkOrderIds((prev) =>
                                e.target.checked ? [...prev, order.id] : prev.filter((item) => item !== order.id),
                              )
                            }
                            className="mt-1"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-zinc-950">
                              {order.eventName?.trim() ? order.eventName : `Заявка ${order.id.slice(0, 8)}…`}
                            </span>
                            <span className="mt-1 block text-xs text-zinc-500">
                              {fmtDate(order.startDate)} — {fmtDate(order.endDate)} · готовность {fmtDate(order.readyByDate)}
                            </span>
                            <span className="mt-1 block text-xs text-zinc-500">
                              {orderStatusLabelRu[order.status] ?? order.status} · {order.linesCount} поз. ·{" "}
                              {order.source === "GREENWICH_INTERNAL" ? "Grinvich" : "Склад"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkExistingOpen(false);
                      setLinkExistingError(null);
                    }}
                    className={secondaryBtn}
                    disabled={linkExistingBusy}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => void linkExistingOrders()}
                    disabled={linkExistingBusy || selectedLinkOrderIds.length === 0 || linkableLoading}
                    className={primaryBtn}
                  >
                    {linkExistingBusy
                      ? "Привязываем…"
                      : `Привязать выбранные${selectedLinkOrderIds.length > 0 ? ` (${selectedLinkOrderIds.length})` : ""}`}
                  </button>
                </div>
                  </div>
                </div>,
                document.body,
              )
            : null}

          {catalogModeOpen && typeof document !== "undefined"
            ? createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/45 p-4">
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
                    className="rounded-2xl border border-violet-200 bg-[linear-gradient(135deg,rgba(250,245,255,0.96),rgba(255,251,235,0.86))] p-4 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
                    onClick={() => setCatalogModeOpen(false)}
                  >
                    <div className="inline-flex rounded-full border border-violet-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                      Demo без дат
                    </div>
                    <div className="mt-3 text-lg font-bold text-violet-950">Собрать или обновить demo-корзину</div>
                    <p className="mt-2 text-sm text-zinc-600">
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
                </div>,
                document.body,
              )
            : null}

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
