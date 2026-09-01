"use client";

import React from "react";
import { createPortal } from "react-dom";

import {
  PROJECT_WIDGET_REGISTRY,
  type ProjectWidgetDefinition,
  type ProjectWidgetType,
} from "@/lib/projects/project-widget-registry";
import {
  buildProjectWorkspaceDraft,
  buildRecommendedProjectWorkspaceDraft,
  type ProjectWorkspaceWidgetInput,
} from "@/lib/projects/project-workspace";

export type ProjectWorkspaceMember = {
  role: "OWNER" | "EDITOR";
  createdAt: string;
  user: { id: string; displayName: string };
};

export type ProjectWorkspaceWidgetRecord = {
  id?: string;
  instanceKey: string;
  type: string;
  schemaVersion?: number;
  sortOrder: number;
  x: number;
  y: number;
  width: number;
  heightPreset: string;
  config?: unknown;
  isVisible: boolean;
  revision?: number;
};

export type ProjectWorkspaceSavedData = {
  revision: number;
  owner: { id: string; displayName: string };
  members: ProjectWorkspaceMember[];
  widgets: ProjectWorkspaceWidgetRecord[];
};

type WorkspaceMeta = {
  users: Array<{ id: string; displayName: string }>;
  currentUserId: string;
};

const WIDTH_LABEL: Record<number, string> = {
  4: "⅓",
  6: "½",
  8: "⅔",
  12: "Вся ширина",
};

const HEIGHT_LABEL: Record<ProjectWorkspaceWidgetInput["heightPreset"], string> = {
  COMPACT: "Компактный",
  MEDIUM: "Средний",
  LARGE: "Высокий",
  AUTO: "По содержимому",
};

const WIDTH_CLASS: Record<ProjectWorkspaceWidgetInput["width"], string> = {
  4: "md:col-span-4",
  6: "md:col-span-6",
  8: "md:col-span-8",
  12: "md:col-span-12",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU") ?? "")
    .join("") || "?";
}

function ModuleIcon({ definition }: { definition: ProjectWidgetDefinition }) {
  const paths: Record<ProjectWidgetDefinition["icon"], React.ReactNode> = {
    calculator: <path d="M7 3h10v4H7zM7 10h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zM7 14h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zM7 18h6v2H7z" />,
    clipboard: <path d="M9 4h6l1 2h3v15H5V6h3l1-2zm0 7h6v-2H9v2zm0 4h6v-2H9v2zm0 4h4v-2H9v2z" />,
    tasks: <path d="M4 6h3v3H4V6zm5 0h11v2H9V6zM4 11h3v3H4v-3zm5 0h11v2H9v-2zM4 16h3v3H4v-3zm5 0h11v2H9v-2z" />,
    board: <path d="M4 4h16v16H4V4zm3 3v10h3V7H7zm5 0v6h5V7h-5zm0 8v2h5v-2h-5z" />,
    calendar: <path d="M6 3h2v2h8V3h2v2h2v16H4V5h2V3zm0 7v9h12v-9H6z" />,
    files: <path d="M6 3h8l4 4v14H6V3zm8 1.5V8h3.5L14 4.5zM9 12h6v-2H9v2zm0 4h6v-2H9v2z" />,
    contacts: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0H5z" />,
    notes: <path d="M5 4h14v16H5V4zm3 4h8V6H8v2zm0 4h8v-2H8v2zm0 4h5v-2H8v2z" />,
    history: <path d="M12 4a8 8 0 11-7.4 5H2l3.5-4L9 9H6.7A6 6 0 1012 6V4zm-1 4h2v5l4 2-1 1.7-5-2.7V8z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      {paths[definition.icon]}
    </svg>
  );
}

function DiscreteWorkspaceSlider<T extends string | number>({
  label,
  values,
  value,
  formatValue,
  onChange,
  tone,
}: {
  label: string;
  values: readonly T[];
  value: T;
  formatValue: (value: T) => string;
  onChange: (value: T) => void;
  tone: "ink" | "violet";
}) {
  const selectedIndex = Math.max(0, values.findIndex((item) => item === value));
  const progress = values.length > 1 ? (selectedIndex / (values.length - 1)) * 100 : 0;

  return (
    <div className="project-workspace-size-slider" data-tone={tone}>
      <div className="project-workspace-size-slider__head">
        <span>{label}</span>
        <output>{formatValue(values[selectedIndex] ?? value)}</output>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, values.length - 1)}
        step={1}
        value={selectedIndex}
        disabled={values.length < 2}
        style={{ "--workspace-slider-progress": `${progress}%` } as React.CSSProperties}
        aria-label={label}
        aria-valuetext={formatValue(values[selectedIndex] ?? value)}
        onChange={(event) => onChange(values[Number(event.target.value)] ?? value)}
      />
      <div className="project-workspace-size-slider__marks" aria-hidden>
        {values.map((item, index) => (
          <i key={String(item)} data-active={index <= selectedIndex || undefined} />
        ))}
      </div>
    </div>
  );
}

export function ProjectWorkspaceSettings({
  projectId,
  revision,
  owner,
  members,
  widgets,
  readOnly,
  onSaved,
}: {
  projectId: string;
  revision: number;
  owner: { id: string; displayName: string };
  members: ProjectWorkspaceMember[];
  widgets: ProjectWorkspaceWidgetRecord[];
  readOnly: boolean;
  onSaved: (workspace?: ProjectWorkspaceSavedData) => void | Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [meta, setMeta] = React.useState<WorkspaceMeta | null>(null);
  const [draftOwnerId, setDraftOwnerId] = React.useState(owner.id);
  const [draftMemberIds, setDraftMemberIds] = React.useState<string[]>(members.map((item) => item.user.id));
  const [draftWidgets, setDraftWidgets] = React.useState<ProjectWorkspaceWidgetInput[]>(() =>
    buildProjectWorkspaceDraft(widgets),
  );
  const draftWidgetsRef = React.useRef(draftWidgets);
  const [layoutHistory, setLayoutHistory] = React.useState<ProjectWorkspaceWidgetInput[][]>([]);
  const [draggedType, setDraggedType] = React.useState<ProjectWidgetType | null>(null);
  const [dropTargetType, setDropTargetType] = React.useState<ProjectWidgetType | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [templateName, setTemplateName] = React.useState("");
  const [templateBusy, setTemplateBusy] = React.useState(false);
  const [templateNotice, setTemplateNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (editing) return;
    setDraftOwnerId(owner.id);
    setDraftMemberIds(members.map((item) => item.user.id));
    const nextWidgets = buildProjectWorkspaceDraft(widgets);
    draftWidgetsRef.current = nextWidgets;
    setDraftWidgets(nextWidgets);
    setLayoutHistory([]);
  }, [editing, members, owner.id, widgets]);

  React.useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editing]);

  function applyWidgetChange(
    updater: (current: ProjectWorkspaceWidgetInput[]) => ProjectWorkspaceWidgetInput[],
  ) {
    const current = draftWidgetsRef.current;
    const next = updater(current);
    if (next === current) return;
    setLayoutHistory((history) => [...history, current].slice(-20));
    draftWidgetsRef.current = next;
    setDraftWidgets(next);
  }

  function normalizeOrder(items: ProjectWorkspaceWidgetInput[]) {
    return items.map((widget, sortOrder) => ({ ...widget, sortOrder, y: sortOrder }));
  }

  const beginEditing = React.useCallback(async () => {
    setError(null);
    setLayoutHistory([]);
    setEditing(true);
    if (meta) return;
    try {
      const response = await fetch("/api/projects/meta", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as WorkspaceMeta | { error?: { message?: string } } | null;
      if (!response.ok || !data || !("users" in data)) throw new Error(data && "error" in data ? data.error?.message : undefined);
      setMeta(data);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "Не удалось загрузить список сотрудников");
    }
  }, [meta]);

  React.useEffect(() => {
    if (readOnly) return;
    const openSettings = () => void beginEditing();
    window.addEventListener("project-workspace:configure", openSettings);
    return () => window.removeEventListener("project-workspace:configure", openSettings);
  }, [beginEditing, readOnly]);

  function moveWidget(type: ProjectWidgetType, direction: -1 | 1) {
    applyWidgetChange((current) => {
      const next = current.slice();
      const index = next.findIndex((widget) => widget.type === type);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return normalizeOrder(next);
    });
  }

  function moveWidgetTo(activeType: ProjectWidgetType, targetType: ProjectWidgetType) {
    if (activeType === targetType) return;
    applyWidgetChange((current) => {
      const from = current.findIndex((widget) => widget.type === activeType);
      const to = current.findIndex((widget) => widget.type === targetType);
      if (from < 0 || to < 0) return current;
      const next = current.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return normalizeOrder(next);
    });
  }

  function undoLayoutChange() {
    setLayoutHistory((history) => {
      const previous = history.at(-1);
      if (!previous) return history;
      draftWidgetsRef.current = previous;
      setDraftWidgets(previous);
      return history.slice(0, -1);
    });
  }

  function applyRecommendedLayout() {
    applyWidgetChange(() => buildRecommendedProjectWorkspaceDraft());
  }

  async function saveWorkspace() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          ownerUserId: draftOwnerId,
          memberUserIds: Array.from(new Set([draftOwnerId, ...draftMemberIds])),
          widgets: draftWidgets,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { workspace?: ProjectWorkspaceSavedData; error?: { message?: string; details?: { message?: string } } }
        | null;
      if (!response.ok) {
        if (response.status === 409) await onSaved();
        const detail = data?.error?.details?.message;
        throw new Error(
          [data?.error?.message || "Не удалось сохранить рабочее пространство", detail]
            .filter(Boolean)
            .join(": "),
        );
      }
      if (!data?.workspace) throw new Error("Сервер не вернул сохранённое рабочее пространство");
      await onSaved(data.workspace);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить рабочее пространство");
    } finally {
      setBusy(false);
    }
  }

  async function saveAsTemplate() {
    const name = templateName.trim();
    if (name.length < 2) {
      setError("Введите название шаблона — минимум 2 символа");
      return;
    }
    setTemplateBusy(true);
    setError(null);
    setTemplateNotice(null);
    try {
      const response = await fetch("/api/projects/workspace-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, widgets: draftWidgetsRef.current }),
      });
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message || "Не удалось сохранить шаблон");
      setTemplateName("");
      setTemplateNotice(`Шаблон «${name}» сохранён`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить шаблон");
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <>
      <div className="project-workspace-toolbar flex flex-wrap items-center gap-2">
          <div className="flex -space-x-2" aria-label="Участники проекта">
            {members.slice(0, 4).map((member) => (
              <span
                key={member.user.id}
                title={`${member.user.displayName}${member.role === "OWNER" ? " · ответственный" : ""}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-zinc-900 text-[10px] font-extrabold text-white"
              >
                {initials(member.user.displayName)}
              </span>
            ))}
            {members.length > 4 ? (
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-violet-100 px-2 text-[10px] font-extrabold text-violet-800">
                +{members.length - 4}
              </span>
            ) : null}
          </div>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : void beginEditing())}
              className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-extrabold transition-colors duration-150 motion-reduce:transition-none ${
                editing
                  ? "border-zinc-950 bg-zinc-950 text-white hover:bg-violet-700"
                  : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-500"
              }`}
            >
              {editing ? "Закрыть" : "Настроить карточку"}
            </button>
          ) : null}
      </div>

      {editing ? createPortal(
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-zinc-950/55 p-3 backdrop-blur-[2px] sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Настройка рабочего пространства"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setEditing(false);
          }}
        >
          <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-[92rem] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#f8f7fb] shadow-[0_32px_90px_rgba(0,0,0,0.32)] sm:max-h-[calc(100vh-2.5rem)]">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  Конструктор карточки
                </div>
                <h2 className="mt-1 truncate text-lg font-black tracking-tight text-zinc-950">Настройка рабочего пространства</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Команда, порядок и размеры блоков — в одном окне.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-xl text-zinc-600 transition-colors duration-150 hover:border-zinc-400 hover:text-zinc-950 disabled:opacity-40 motion-reduce:transition-none"
                aria-label="Закрыть настройку"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
          <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.7fr)]">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-black text-zinc-950">Команда</div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Ответственный управляет проектом, остальные видят его в своей работе.</p>
              <label className="mt-4 block text-xs font-bold text-zinc-600">
                Ответственный
                <select
                  value={draftOwnerId}
                  onChange={(event) => {
                    setDraftOwnerId(event.target.value);
                    setDraftMemberIds((current) => Array.from(new Set([event.target.value, ...current])));
                  }}
                  disabled={!meta}
                  className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950"
                >
                  {(meta?.users ?? [{ id: owner.id, displayName: owner.displayName }]).map((user) => (
                    <option key={user.id} value={user.id}>{user.displayName}</option>
                  ))}
                </select>
              </label>
              <div className="mt-4 space-y-1">
                <div className="text-xs font-bold text-zinc-600">Участники</div>
                {(meta?.users ?? members.map((member) => member.user)).map((user) => {
                  const checked = draftMemberIds.includes(user.id) || user.id === draftOwnerId;
                  return (
                    <label key={user.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-zinc-800 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={user.id === draftOwnerId}
                        onChange={(event) =>
                          setDraftMemberIds((current) =>
                            event.target.checked ? Array.from(new Set([...current, user.id])) : current.filter((id) => id !== user.id),
                          )
                        }
                        className="h-4 w-4 accent-violet-700"
                      />
                      <span>{user.displayName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-zinc-950">Блоки карточки</div>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">Перетаскивайте за ручку или используйте стрелки. Смета и заявки обязательны.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyRecommendedLayout}
                    className="min-h-9 rounded-md border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-800 transition-colors duration-150 hover:border-violet-400 motion-reduce:transition-none"
                  >
                    Рекомендованная сетка
                  </button>
                  <button
                    type="button"
                    onClick={undoLayoutChange}
                    disabled={layoutHistory.length === 0}
                    className="min-h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition-colors duration-150 hover:border-zinc-400 disabled:opacity-35 motion-reduce:transition-none"
                  >
                    Отменить
                  </button>
                  <span className="text-xs font-bold text-zinc-500">{draftWidgets.filter((widget) => widget.isVisible).length} из {draftWidgets.length}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-12">
                {draftWidgets.map((widget, index) => {
                  const definition = PROJECT_WIDGET_REGISTRY.find((item) => item.type === widget.type)!;
                  return (
                    <div
                      key={widget.type}
                      onDragOver={(event) => {
                        if (!draggedType || draggedType === widget.type) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropTargetType(widget.type);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetType(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedType) moveWidgetTo(draggedType, widget.type);
                        setDraggedType(null);
                        setDropTargetType(null);
                      }}
                      className={`col-span-1 rounded-xl border bg-white p-3 transition-[border-color,background-color,opacity,box-shadow] duration-150 motion-reduce:transition-none ${WIDTH_CLASS[widget.width]} ${
                        dropTargetType === widget.type
                          ? "border-violet-500 bg-violet-50 shadow-[0_0_0_2px_rgba(109,40,217,0.12)]"
                          : widget.isVisible
                            ? "border-violet-200"
                            : "border-zinc-200 opacity-65"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><ModuleIcon definition={definition} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-black text-zinc-950">{definition.title}</div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", widget.type);
                                  setDraggedType(widget.type);
                                }}
                                onDragEnd={() => {
                                  setDraggedType(null);
                                  setDropTargetType(null);
                                }}
                                className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md border border-zinc-200 bg-white text-base font-black tracking-[-0.18em] text-zinc-500 transition-colors duration-150 hover:border-zinc-400 hover:text-zinc-950 active:cursor-grabbing motion-reduce:transition-none"
                                aria-label={`Перетащить ${definition.title}`}
                                title="Перетащить блок"
                              >
                                ⠿
                              </button>
                              <label className="relative inline-flex h-6 w-11 shrink-0 items-center">
                                <input
                                  type="checkbox"
                                  checked={widget.isVisible}
                                  disabled={definition.mandatory}
                                  onChange={(event) =>
                                    applyWidgetChange((current) => current.map((item) => item.type === widget.type ? { ...item, isVisible: event.target.checked } : item))
                                  }
                                  className="peer sr-only"
                                  aria-label={`${widget.isVisible ? "Скрыть" : "Показать"} ${definition.title}`}
                                />
                                <span className="absolute inset-0 rounded-full bg-zinc-300 transition-colors duration-150 peer-checked:bg-violet-700 peer-disabled:opacity-60 motion-reduce:transition-none" />
                                <span className="relative ml-1 h-4 w-4 rounded-full bg-white transition-transform duration-150 peer-checked:translate-x-5 motion-reduce:transition-none" />
                              </label>
                            </div>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">{definition.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-100 pt-3">
                        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
                          <DiscreteWorkspaceSlider
                            label="Ширина"
                            values={definition.allowedWidths}
                            value={widget.width}
                            formatValue={(width) => WIDTH_LABEL[width]}
                            tone="ink"
                            onChange={(width) => applyWidgetChange((current) => current.map((item) => item.type === widget.type ? { ...item, width: width as ProjectWorkspaceWidgetInput["width"] } : item))}
                          />
                          <DiscreteWorkspaceSlider
                            label="Высота"
                            values={definition.allowedHeights}
                            value={widget.heightPreset}
                            formatValue={(heightPreset) => HEIGHT_LABEL[heightPreset]}
                            tone="violet"
                            onChange={(heightPreset) => applyWidgetChange((current) => current.map((item) => item.type === widget.type ? { ...item, heightPreset } : item))}
                          />
                        </div>
                        <div className="flex gap-1">
                          <button type="button" disabled={index === 0} onClick={() => moveWidget(widget.type, -1)} className="h-8 w-8 rounded-md border border-zinc-200 bg-white text-sm font-black disabled:opacity-30" aria-label={`Поднять ${definition.title}`}>↑</button>
                          <button type="button" disabled={index === draftWidgets.length - 1} onClick={() => moveWidget(widget.type, 1)} className="h-8 w-8 rounded-md border border-zinc-200 bg-white text-sm font-black disabled:opacity-30" aria-label={`Опустить ${definition.title}`}>↓</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <div className="text-xs font-black text-zinc-950">Сохранить компоновку как шаблон</div>
              <p className="mt-0.5 text-xs text-zinc-500">В шаблон попадут только блоки, их порядок и размеры.</p>
              {templateNotice ? <p className="mt-1 text-xs font-bold text-emerald-700" role="status">{templateNotice}</p> : null}
            </div>
            <div className="mt-3 flex min-w-0 gap-2 sm:mt-0 sm:w-[24rem]">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                maxLength={80}
                placeholder="Например, большой проект"
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="button"
                onClick={() => void saveAsTemplate()}
                disabled={templateBusy || templateName.trim().length < 2}
                className="min-h-10 shrink-0 rounded-lg border border-zinc-950 bg-zinc-950 px-3 text-xs font-black text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
              >
                {templateBusy ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 flex flex-col-reverse gap-2 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-10px_28px_rgba(31,25,46,0.07)] backdrop-blur sm:-mx-5 sm:-mb-5 sm:flex-row sm:justify-end sm:px-5">
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800">Отмена</button>
            <button type="button" disabled={busy || !meta} onClick={() => void saveWorkspace()} className="min-h-11 rounded-lg bg-yellow-400 px-5 text-sm font-black text-zinc-950 disabled:opacity-50">{busy ? "Сохраняю…" : "Сохранить пространство"}</button>
          </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
