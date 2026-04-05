"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { orderStatusLabelRu, type OrderStatus } from "@/app/_ui/OrderStatusStepper";
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
  const [loading, setLoading] = React.useState(true);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [archiveBusy, setArchiveBusy] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus>("LEAD");
  const [ball, setBall] = React.useState<ProjectBall>("CLIENT");
  const [eventDateNote, setEventDateNote] = React.useState("");
  const [eventDateConfirmed, setEventDateConfirmed] = React.useState(false);
  const [openBlockers, setOpenBlockers] = React.useState("");
  const [internalSummary, setInternalSummary] = React.useState("");

  const readOnly = Boolean(project?.archivedAt);

  const load = React.useCallback(() => {
    if (!id || state.status !== "authenticated" || role !== "WOWSTORG") return;
    setLoading(true);
    fetch(`/api/projects/${id}?includeOrders=1&includeActivity=1`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((data: { project?: ProjectDetail; error?: { message?: string } } | null) => {
        if (data?.project) {
          setProject(data.project);
          setTitle(data.project.title);
          setStatus(data.project.status);
          setBall(data.project.ball);
          setEventDateNote(data.project.eventDateNote ?? "");
          setEventDateConfirmed(data.project.eventDateConfirmed);
          setOpenBlockers(data.project.openBlockers ?? "");
          setInternalSummary(data.project.internalSummary ?? "");
        } else {
          setProject(null);
        }
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
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

  async function save(e: React.FormEvent) {
    e.preventDefault();
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
      ) : loading ? (
        <div className="text-sm text-zinc-600">Загрузка…</div>
      ) : !project ? (
        <div className="text-sm text-zinc-600">Проект не найден.</div>
      ) : (
        <div className="space-y-6">
          {readOnly ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Архив: только просмотр.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 text-sm text-zinc-600">
            <span>
              Заказчик: <strong className="text-zinc-900">{project.customer.name}</strong>
            </span>
            <span>·</span>
            <span>
              Ответственный: <strong className="text-zinc-900">{project.owner.displayName}</strong>
            </span>
            <span>·</span>
            <span>
              Заявок реквизита: <strong className="text-zinc-900">{project._count.orders}</strong>
            </span>
            <span>·</span>
            <span>создан {fmtDate(project.createdAt)}</span>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Заявки реквизита</div>
              {!readOnly ? (
                <Link
                  href={`/catalog?projectId=${encodeURIComponent(id)}`}
                  className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Каталог → новая заявка
                </Link>
              ) : null}
            </div>
            {!project.orders?.length ? (
              <p className="text-sm text-zinc-600">Пока нет привязанных заявок.</p>
            ) : (
              <ul className="space-y-2">
                {project.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/orders/${o.id}`}
                      className="block rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-violet-300"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs text-zinc-500">{o.id.slice(0, 8)}…</span>
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700">
                          {orderStatusLabelRu[o.status] ?? o.status}
                        </span>
                      </div>
                      <div className="mt-1 text-zinc-800">
                        {o.eventName?.trim() ? o.eventName : "Без названия мероприятия"}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {fmtDate(o.startDate)} — {fmtDate(o.endDate)} · готовность {fmtDate(o.readyByDate)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ProjectContactsPanel projectId={id} readOnly={readOnly} />

          <ProjectFilesPanel projectId={id} readOnly={readOnly} />

          <ProjectEstimatePanel projectId={id} readOnly={readOnly} />

          <ProjectSchedulePanel projectId={id} readOnly={readOnly} />

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Журнал</div>
            <p className="mt-1 text-xs text-zinc-500">
              Неизменяемая история: карточка, заявки, контакты, файлы, смета, архивные события.
            </p>
            {!project.activityLogs?.length ? (
              <p className="mt-3 text-sm text-zinc-600">Пока нет записей.</p>
            ) : (
              <ul className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                {project.activityLogs.map((row) => (
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

          <form onSubmit={save} className="space-y-4">
            <label className="block text-xs text-zinc-600">
              Название
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={readOnly}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                maxLength={300}
                required
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-zinc-600">
                Статус
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  disabled={readOnly}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-zinc-600">
                Мяч
                <select
                  value={ball}
                  onChange={(e) => setBall(e.target.value as ProjectBall)}
                  disabled={readOnly}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                >
                  {ballOptions.map((b) => (
                    <option key={b} value={b}>
                      {PROJECT_BALL_LABEL[b]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs text-zinc-600">
              Дата мероприятия (заметка)
              <input
                value={eventDateNote}
                onChange={(e) => setEventDateNote(e.target.value)}
                disabled={readOnly}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                maxLength={2000}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={eventDateConfirmed}
                onChange={(e) => setEventDateConfirmed(e.target.checked)}
                disabled={readOnly}
              />
              Дата подтверждена
            </label>

            <label className="block text-xs text-zinc-600">
              Открытые блокеры
              <textarea
                value={openBlockers}
                onChange={(e) => setOpenBlockers(e.target.value)}
                disabled={readOnly}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                maxLength={5000}
              />
            </label>

            <label className="block text-xs text-zinc-600">
              Внутреннее резюме
              <textarea
                value={internalSummary}
                onChange={(e) => setInternalSummary(e.target.value)}
                disabled={readOnly}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-100"
                maxLength={5000}
              />
            </label>

            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saveBusy}
                  className="rounded-lg border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  {saveBusy ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => void archive()}
                  disabled={archiveBusy}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {archiveBusy ? "…" : "В архив"}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      )}
    </AppShell>
  );
}
