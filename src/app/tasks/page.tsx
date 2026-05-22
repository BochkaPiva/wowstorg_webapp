"use client";

import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { useAuth } from "@/app/providers";

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type BoardListItem = {
  id: string;
  title: string;
  description: string | null;
  isDefault: boolean;
  _count: { tasks: number; columns: number };
};

type TaskChecklistItem = {
  id: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
};

type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  color: string | null;
  sortOrder: number;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: null | { id: string; displayName: string };
  project: null | { id: string; title: string };
  order: null | { id: string; eventName: string | null; customer: { name: string } };
  checklistItems: TaskChecklistItem[];
  checklistDone: number;
  checklistTotal: number;
};

type BoardColumn = {
  id: string;
  title: string;
  color: string | null;
  sortOrder: number;
  isDone: boolean;
  tasks: BoardTask[];
};

type BoardDetail = {
  id: string;
  title: string;
  description: string | null;
  isDefault: boolean;
  columns: BoardColumn[];
};

type TasksMeta = {
  users: Array<{ id: string; displayName: string }>;
  projects: Array<{ id: string; title: string; customerName: string }>;
  orders: Array<{ id: string; label: string; readyByDate: string }>;
};

type TaskPatchBody = Partial<{
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  dueDate: string | null;
  priority: Priority;
  color: string | null;
  projectId: string | null;
  orderId: string | null;
  columnId: string;
  completed: boolean;
}>;

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Важно",
  URGENT: "Срочно",
};

const TASK_COLORS = ["#334155", "#365a83", "#6d3b7d", "#7b6b2e", "#315f2f", "#7f2f5f"];
const COLUMN_COLORS = ["#94a3b8", "#c084fc", "#facc15", "#5eead4", "#60a5fa", "#fb7185"];

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru") ?? "")
    .join("");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function orderContextLabel(order: NonNullable<BoardTask["order"]>): string {
  return order.eventName ? `${order.customer.name} · ${order.eventName}` : order.customer.name;
}

function TaskCardContext({ task }: { task: BoardTask }) {
  if (!task.project && !task.order) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {task.project ? (
        <a
          href={`/projects/${task.project.id}`}
          onClick={(event) => event.stopPropagation()}
          className="block truncate text-[11px] leading-snug text-slate-100/75 underline-offset-2 transition hover:text-white hover:underline"
          title={task.project.title}
        >
          <span className="font-semibold text-slate-100/50">Проект ·</span> {task.project.title}
        </a>
      ) : null}
      {task.order ? (
        <a
          href={`/orders/${task.order.id}`}
          onClick={(event) => event.stopPropagation()}
          className="block truncate text-[11px] leading-snug text-slate-100/75 underline-offset-2 transition hover:text-white hover:underline"
          title={orderContextLabel(task.order)}
        >
          <span className="font-semibold text-slate-100/50">Заявка ·</span> {orderContextLabel(task.order)}
        </a>
      ) : null}
    </div>
  );
}

async function readApi<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data ? data.error?.message : undefined;
    throw new Error(message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

function cardTextColor(color: string | null): string {
  if (!color) return "text-slate-100";
  return "text-white";
}

function RoundCheckbox({
  checked,
  onChange,
  size = "md",
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "md" | "sm";
  className?: string;
}) {
  const dim = size === "sm" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[11px]";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full border font-bold transition",
        dim,
        checked
          ? "border-emerald-400 bg-emerald-500 text-white shadow-sm shadow-emerald-950/20"
          : "border-white/40 bg-white/15 text-white/50 hover:border-white/55 hover:bg-white/22 hover:text-white/70",
        className,
      ].join(" ")}
      aria-pressed={checked}
      aria-label={checked ? "Отметить невыполненной" : "Отметить выполненной"}
    >
      ✓
    </button>
  );
}

const CHECKLIST_TREE_TRUNK_X = 11.5;
const CHECKLIST_TREE_BRANCH_END_X = 28;
const CHECKLIST_TREE_ACTION_BRANCH_END_X = 17;
const CHECKLIST_TREE_CORNER_R = 7;

function buildChecklistTreePath(centers: number[]): string {
  if (centers.length === 0) return "";

  const parts: string[] = [];
  for (let i = 0; i < centers.length; i++) {
    const y = centers[i]!;
    const startY = i === 0 ? 0 : centers[i - 1]!;
    const branchEndX =
      i === centers.length - 1 ? CHECKLIST_TREE_ACTION_BRANCH_END_X : CHECKLIST_TREE_BRANCH_END_X;
    parts.push(`M ${CHECKLIST_TREE_TRUNK_X} ${startY} V ${y - CHECKLIST_TREE_CORNER_R}`);
    parts.push(
      `Q ${CHECKLIST_TREE_TRUNK_X} ${y} ${CHECKLIST_TREE_TRUNK_X + CHECKLIST_TREE_CORNER_R} ${y} H ${branchEndX}`,
    );
  }
  return parts.join(" ");
}

function ChecklistTreeSection({
  items,
  adding,
  newChecklistTitle,
  onNewChecklistTitleChange,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onAddClick,
  onSubmitNewItem,
  onCancelAdding,
}: {
  items: TaskChecklistItem[];
  adding: boolean;
  newChecklistTitle: string;
  onNewChecklistTitleChange: (value: string) => void;
  onToggleChecklistItem: (itemId: string, isDone: boolean) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onAddClick: (event: React.MouseEvent) => void;
  onSubmitNewItem: () => void;
  onCancelAdding: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [treePath, setTreePath] = React.useState("");

  const syncTreePath = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerTop = container.getBoundingClientRect().top;
    const centers = rowRefs.current
      .filter((row): row is HTMLDivElement => row != null)
      .map((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top - containerTop + rect.height / 2;
      });

    setTreePath(buildChecklistTreePath(centers));
  }, []);

  React.useLayoutEffect(() => {
    rowRefs.current.length = items.length + 1;
    syncTreePath();
  }, [adding, items, newChecklistTitle, syncTreePath]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => syncTreePath());
    observer.observe(container);
    window.addEventListener("resize", syncTreePath);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTreePath);
    };
  }, [syncTreePath]);

  return (
    <div ref={containerRef} className="relative mx-3 mb-2 pb-1">
      {treePath ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-sky-500/75"
        >
          <path
            d={treePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}

      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(node) => {
            rowRefs.current[index] = node;
          }}
          className={`relative pl-5 ${index > 0 ? "mt-2" : ""}`}
        >
          <div className="flex items-center gap-1 rounded-lg bg-[#323d50] px-2.5 py-2">
            <RoundCheckbox
              size="sm"
              checked={item.isDone}
              onChange={(checked) => onToggleChecklistItem(item.id, checked)}
            />
            <span
              className={[
                "min-w-0 flex-1 text-xs leading-snug",
                item.isDone ? "text-slate-400 line-through opacity-70" : "text-slate-100",
              ].join(" ")}
            >
              {item.title}
            </span>
            <div className="group/delete -mr-0.5 flex w-8 shrink-0 items-center justify-end pl-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteChecklistItem(item.id);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-sm leading-none text-slate-400 opacity-0 transition-opacity duration-200 hover:bg-white/10 hover:text-rose-300 group-hover/delete:opacity-100"
                aria-label="Удалить подзадачу"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}

      <div
        ref={(node) => {
          rowRefs.current[items.length] = node;
        }}
        className={`relative pl-6 ${items.length > 0 ? "mt-2" : ""} min-h-[1.5rem]`}
      >
        {adding ? (
          <input
            autoFocus
            value={newChecklistTitle}
            onChange={(event) => onNewChecklistTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmitNewItem();
              if (event.key === "Escape") onCancelAdding();
            }}
            onBlur={() => {
              if (newChecklistTitle.trim()) onSubmitNewItem();
              else onCancelAdding();
            }}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder="Название подзадачи"
            className="w-full rounded-lg border border-white/10 bg-[#323d50] px-2.5 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-400 focus:border-sky-400/50"
          />
        ) : (
          <button
            type="button"
            onClick={onAddClick}
            onMouseDown={(event) => event.stopPropagation()}
            className="py-0.5 text-xs font-medium text-sky-400 transition hover:text-sky-300"
          >
            + Создать подзадачу
          </button>
        )}
      </div>
    </div>
  );
}

function TaskChecklistPanel({
  task,
  expanded,
  newChecklistTitle,
  onToggleExpanded,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onNewChecklistTitleChange,
  onAddChecklistItem,
}: {
  task: BoardTask;
  expanded: boolean;
  newChecklistTitle: string;
  onToggleExpanded: (taskId: string) => void;
  onToggleChecklistItem: (itemId: string, isDone: boolean) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onNewChecklistTitleChange: (value: string) => void;
  onAddChecklistItem: (title: string) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const progressPct = task.checklistTotal > 0 ? Math.round((task.checklistDone / task.checklistTotal) * 100) : 0;
  const hasChecklist = task.checklistTotal > 0;
  const showTree = expanded || !hasChecklist;

  function submitNewItem() {
    const next = newChecklistTitle.trim();
    if (!next) return;
    onAddChecklistItem(next);
    onNewChecklistTitleChange("");
    setAdding(false);
  }

  function startAdding(event: React.MouseEvent) {
    event.stopPropagation();
    if (hasChecklist && !expanded) onToggleExpanded(task.id);
    setAdding(true);
  }

  if (!hasChecklist && !adding) {
    return (
      <div className="border-t border-black/25 bg-[#283040] px-3 py-2.5">
        <button
          type="button"
          onClick={startAdding}
          onMouseDown={(event) => event.stopPropagation()}
          className="text-xs font-medium text-sky-400 transition hover:text-sky-300"
        >
          + Создать подзадачу
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-black/25 bg-[#283040]">
      {hasChecklist ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded(task.id);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/5"
        >
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/35">
            <div
              className={[
                "h-full rounded-full transition-all duration-200",
                progressPct === 100 ? "bg-emerald-400" : "bg-white/45",
              ].join(" ")}
              style={{ width: `${progressPct > 0 ? Math.max(progressPct, 6) : 0}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-300/90">
            {task.checklistDone}/{task.checklistTotal}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400/90">{expanded ? "▴" : "▾"}</span>
        </button>
      ) : null}

      {showTree ? (
        <ChecklistTreeSection
          items={task.checklistItems}
          adding={adding}
          newChecklistTitle={newChecklistTitle}
          onNewChecklistTitleChange={onNewChecklistTitleChange}
          onToggleChecklistItem={onToggleChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
          onAddClick={startAdding}
          onSubmitNewItem={submitNewItem}
          onCancelAdding={() => {
            onNewChecklistTitleChange("");
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}

function TaskCard({
  task,
  column,
  onOpen,
  onPatchTask,
  onAddChecklistItem,
  expanded,
  onToggleExpanded,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onDragStart,
  onDragEnd,
}: {
  task: BoardTask;
  column: BoardColumn;
  onOpen: (task: BoardTask) => void;
  onPatchTask: (taskId: string, body: TaskPatchBody) => void;
  onAddChecklistItem: (taskId: string, title: string) => void;
  expanded: boolean;
  onToggleExpanded: (taskId: string) => void;
  onToggleChecklistItem: (itemId: string, isDone: boolean) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onDragStart: (taskId: string, fromColumnId: string) => void;
  onDragEnd: () => void;
}) {
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description ?? "");
  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");
  const descriptionRef = React.useRef<HTMLTextAreaElement>(null);
  const isUrgent = task.priority === "URGENT" || task.priority === "HIGH";
  const textTone = cardTextColor(task.color);
  const taskDone = Boolean(task.completedAt);

  React.useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
  }, [task.description, task.title]);

  const syncDescriptionHeight = React.useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useEffect(() => {
    syncDescriptionHeight();
  }, [description, syncDescriptionHeight]);

  function commitTitle() {
    const next = title.trim();
    if (!next) {
      setTitle(task.title);
      return;
    }
    if (next !== task.title) onPatchTask(task.id, { title: next });
  }

  function commitDescription() {
    const next = description.trim();
    const current = task.description ?? "";
    if (next !== current) onPatchTask(task.id, { description: next || null });
  }

  return (
    <article
      data-task-card-id={task.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart(task.id, column.id);
      }}
      onDragEnd={onDragEnd}
      className={[
        "group overflow-hidden rounded-xl border border-black/10 bg-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.18)]",
        "cursor-grab transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(15,23,42,0.22)] active:cursor-grabbing",
        textTone,
      ].join(" ")}
      style={{ backgroundColor: task.color ?? "#334155" }}
    >
      <div className="px-3 py-3">
        <div className="flex items-start gap-2">
          <RoundCheckbox checked={taskDone} onChange={() => onPatchTask(task.id, { completed: !taskDone })} />
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setTitle(task.title);
                  event.currentTarget.blur();
                }
              }}
              className={[
                "block w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold leading-snug outline-none transition",
                "hover:bg-white/10 focus:bg-white/15 focus:ring-2 focus:ring-white/20",
                taskDone ? "opacity-60 line-through" : "",
              ].join(" ")}
            />
            <TaskCardContext task={task} />
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                requestAnimationFrame(syncDescriptionHeight);
              }}
              onBlur={commitDescription}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setDescription(task.description ?? "");
                  event.currentTarget.blur();
                }
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") event.currentTarget.blur();
              }}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="Описание"
              rows={1}
              className="mt-1 block w-full resize-none overflow-hidden rounded-md bg-transparent px-1 py-0.5 text-xs leading-snug text-slate-100/80 outline-none transition placeholder:text-slate-100/45 hover:bg-white/10 focus:bg-white/15 focus:ring-2 focus:ring-white/20"
            />
          </div>
          <button
            type="button"
            onClick={() => onOpen(task)}
            className="rounded-lg px-1.5 py-1 text-slate-100/70 transition hover:bg-white/10 hover:text-white"
            title="Открыть полное редактирование"
          >
            ⋮
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
          {task.dueDate ? (
            <span className="rounded-md border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] text-slate-100">
              {fmtDate(task.dueDate)}
            </span>
          ) : null}
          {isUrgent ? (
            <span className="rounded-md border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] text-slate-100">
              {PRIORITY_LABEL[task.priority]}
            </span>
          ) : null}
          {task.assignee ? (
            <span className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-pink-600 text-[11px] font-bold text-white">
              {initials(task.assignee.displayName)}
            </span>
          ) : null}
        </div>
      </div>

      <TaskChecklistPanel
        task={task}
        expanded={expanded}
        newChecklistTitle={newChecklistTitle}
        onToggleExpanded={onToggleExpanded}
        onToggleChecklistItem={onToggleChecklistItem}
        onDeleteChecklistItem={onDeleteChecklistItem}
        onNewChecklistTitleChange={setNewChecklistTitle}
        onAddChecklistItem={(title) => onAddChecklistItem(task.id, title)}
      />
    </article>
  );
}

function ChecklistEditorItem({
  item,
  onToggle,
  onRename,
  onDelete,
}: {
  item: TaskChecklistItem;
  onToggle: (itemId: string, isDone: boolean) => void;
  onRename: (itemId: string, title: string) => void;
  onDelete: (itemId: string) => void;
}) {
  const [title, setTitle] = React.useState(item.title);

  React.useEffect(() => {
    setTitle(item.title);
  }, [item.title]);

  return (
    <div className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <RoundCheckbox
        checked={item.isDone}
        onChange={(checked) => onToggle(item.id, checked)}
        className={
          item.isDone
            ? undefined
            : "border-zinc-300 bg-zinc-100 text-zinc-400 hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-500"
        }
      />
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          const next = title.trim();
          if (next && next !== item.title) onRename(item.id, next);
          if (!next) setTitle(item.title);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={[
          "min-w-0 flex-1 bg-transparent text-sm outline-none",
          item.isDone ? "text-zinc-400 line-through" : "text-zinc-900",
        ].join(" ")}
      />
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100"
      >
        удалить
      </button>
    </div>
  );
}

function TaskEditor({
  task,
  columnId,
  columns,
  meta,
  defaultProjectId,
  projectLocked,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: BoardTask | null;
  columnId: string | null;
  columns: BoardColumn[];
  meta: TasksMeta | null;
  defaultProjectId?: string | null;
  projectLocked?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isNew = task == null;
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [assigneeUserId, setAssigneeUserId] = React.useState(task?.assignee?.id ?? "");
  const [dueDate, setDueDate] = React.useState(task?.dueDate ?? "");
  const [priority, setPriority] = React.useState<Priority>(task?.priority ?? "NORMAL");
  const [color, setColor] = React.useState(task?.color ?? TASK_COLORS[0]!);
  const [projectId, setProjectId] = React.useState(task?.project?.id ?? defaultProjectId ?? "");
  const [orderId, setOrderId] = React.useState(task?.order?.id ?? "");
  const [targetColumnId, setTargetColumnId] = React.useState(columnId ?? columns[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");

  React.useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssigneeUserId(task?.assignee?.id ?? "");
    setDueDate(task?.dueDate ?? "");
    setPriority(task?.priority ?? "NORMAL");
    setColor(task?.color ?? TASK_COLORS[0]!);
    setProjectId(task?.project?.id ?? defaultProjectId ?? "");
    setOrderId(task?.order?.id ?? "");
    setTargetColumnId(columnId ?? columns[0]?.id ?? "");
    setError(null);
    setNewChecklistTitle("");
  }, [columnId, columns, defaultProjectId, task]);

  async function save() {
    if (!title.trim()) {
      setError("Название задачи обязательно");
      return;
    }
    if (!targetColumnId) {
      setError("Нет колонки для задачи");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = {
        title,
        description: description || null,
        assigneeUserId: assigneeUserId || null,
        dueDate: dueDate || null,
        priority,
        color,
        projectId: projectId || null,
        orderId: orderId || null,
      };
      const payload = isNew ? body : { ...body, columnId: targetColumnId };
      const res = await fetch(isNew ? `/api/tasks/columns/${targetColumnId}/tasks` : `/api/tasks/tasks/${task.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readApi(res);
      onSaved();
      if (isNew) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task) return;
    if (!window.confirm("Удалить задачу?")) return;
    setBusy(true);
    try {
      await readApi(await fetch(`/api/tasks/tasks/${task.id}`, { method: "DELETE" }));
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  async function addChecklistItem() {
    if (!task || !newChecklistTitle.trim()) return;
    setBusy(true);
    try {
      await readApi(
        await fetch(`/api/tasks/tasks/${task.id}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newChecklistTitle }),
        }),
      );
      setNewChecklistTitle("");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить подзадачу");
    } finally {
      setBusy(false);
    }
  }

  async function patchChecklistItem(itemId: string, body: object) {
    setBusy(true);
    try {
      await readApi(
        await fetch(`/api/tasks/checklist/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить подзадачу");
    } finally {
      setBusy(false);
    }
  }

  async function deleteChecklistItem(itemId: string) {
    setBusy(true);
    try {
      await readApi(await fetch(`/api/tasks/checklist/${itemId}`, { method: "DELETE" }));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить подзадачу");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30">
      <button className="absolute inset-0 bg-zinc-950/35 backdrop-blur-[2px]" onClick={onClose} aria-label="Закрыть" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-[linear-gradient(180deg,#ffffff,#f8f7ff)] text-zinc-950 shadow-2xl">
        <div className="border-b border-violet-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-bold">{isNew ? "Новая задача" : "Задача"}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-violet-50"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</div> : null}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Название</span>
            <textarea
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base font-semibold text-zinc-950 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Описание</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Колонка</span>
              <select
                value={targetColumnId}
                onChange={(event) => setTargetColumnId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Исполнитель</span>
              <select
                value={assigneeUserId}
                onChange={(event) => setAssigneeUserId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Не назначен</option>
                {meta?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Дедлайн</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Приоритет</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((key) => (
                  <option key={key} value={key}>
                    {PRIORITY_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Цвет карточки</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {TASK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={[
                    "h-8 w-8 rounded-full border transition",
                    color === c ? "border-white ring-2 ring-blue-300" : "border-white/20",
                  ].join(" ")}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Проект</span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={projectLocked}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Без проекта</option>
                {meta?.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title} · {project.customerName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Заявка</span>
              <select
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Без заявки</option>
                {meta?.orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {fmtDate(order.readyByDate)} · {order.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!isNew ? (
            <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-bold text-zinc-950">Подзадачи</div>
                <div className="text-xs font-semibold text-violet-700">
                  {task.checklistDone}/{task.checklistTotal}
                </div>
              </div>
              <div className="space-y-2">
                {task.checklistItems.map((item) => (
                  <ChecklistEditorItem
                    key={item.id}
                    item={item}
                    onToggle={(itemId, isDone) => void patchChecklistItem(itemId, { isDone })}
                    onRename={(itemId, nextTitle) => void patchChecklistItem(itemId, { title: nextTitle })}
                    onDelete={(itemId) => void deleteChecklistItem(itemId)}
                  />
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={newChecklistTitle}
                  onChange={(event) => setNewChecklistTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addChecklistItem();
                  }}
                  placeholder="Новая подзадача"
                  className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                />
                <button
                  type="button"
                  onClick={() => void addChecklistItem()}
                  className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-violet-500"
                >
                  Добавить
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-violet-100 bg-white/80 px-5 py-4">
          <div>
            {!isNew ? (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
              >
                Удалить
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-200 hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function TasksPageContent() {
  const { state } = useAuth();
  const [viewParams] = React.useState(() => {
    if (typeof window === "undefined") {
      return { projectId: "", embedded: false, readOnly: false };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      projectId: params.get("projectId")?.trim() || "",
      embedded: params.get("embed") === "1",
      readOnly: params.get("readOnly") === "1",
    };
  });
  const [boards, setBoards] = React.useState<BoardListItem[]>([]);
  const [boardId, setBoardId] = React.useState("");
  const [board, setBoard] = React.useState<BoardDetail | null>(null);
  const [meta, setMeta] = React.useState<TasksMeta | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<{ task: BoardTask | null; columnId: string | null } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null);
  const [draggingFromColumnId, setDraggingFromColumnId] = React.useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = React.useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(() => new Set());
  const boardRef = React.useRef<BoardDetail | null>(null);
  const moveRequestIdRef = React.useRef(0);
  const latestMoveByTaskRef = React.useRef<Map<string, number>>(new Map());
  const moveQueueByTaskRef = React.useRef<Map<string, Promise<void>>>(new Map());
  const isWowstorg = state.status === "authenticated" && state.user.role === "WOWSTORG";

  const applyBoard = React.useCallback((nextBoard: BoardDetail | null) => {
    boardRef.current = nextBoard;
    setBoard(nextBoard);
  }, []);

  const updateBoard = React.useCallback((updater: (current: BoardDetail | null) => BoardDetail | null) => {
    setBoard((current) => {
      const nextBoard = updater(boardRef.current ?? current);
      boardRef.current = nextBoard;
      return nextBoard;
    });
  }, []);

  const fetchBoardDetail = React.useCallback(async (id: string) => {
    if (!id) return;
    const params = new URLSearchParams();
    if (viewParams.projectId) {
      params.set("projectId", viewParams.projectId);
      params.set("includeClosedProjectTasks", "1");
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const data = await readApi<{ board: BoardDetail }>(
      await fetch(`/api/tasks/boards/${id}${suffix}`, { cache: "no-store" }),
    );
    return data.board;
  }, [viewParams.projectId]);

  const loadBoard = React.useCallback(
    async (id: string) => {
      const nextBoard = await fetchBoardDetail(id);
      if (nextBoard) applyBoard(nextBoard);
    },
    [applyBoard, fetchBoardDetail],
  );

  const refresh = React.useCallback(async () => {
    if (!isWowstorg) return;
    setError(null);
    const data = await readApi<{ boards: BoardListItem[] }>(await fetch("/api/tasks/boards", { cache: "no-store" }));
    setBoards(data.boards);
    const nextBoardId = boardId || data.boards[0]?.id || "";
    setBoardId(nextBoardId);
    if (nextBoardId) await loadBoard(nextBoardId);
  }, [boardId, isWowstorg, loadBoard]);

  React.useEffect(() => {
    if (!isWowstorg) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/tasks/boards", { cache: "no-store" }).then((res) => readApi<{ boards: BoardListItem[] }>(res)),
      fetch("/api/tasks/meta", { cache: "no-store" }).then((res) => readApi<TasksMeta>(res)),
    ])
      .then(async ([boardsData, metaData]) => {
        if (cancelled) return;
        setBoards(boardsData.boards);
        setMeta(metaData);
        const firstBoardId = boardId || boardsData.boards[0]?.id || "";
        setBoardId(firstBoardId);
        if (firstBoardId) {
          const detail = await readApi<{ board: BoardDetail }>(
            await fetch(
              `/api/tasks/boards/${firstBoardId}${
                viewParams.projectId
                  ? `?projectId=${encodeURIComponent(viewParams.projectId)}&includeClosedProjectTasks=1`
                  : ""
              }`,
              { cache: "no-store" },
            ),
          );
          if (!cancelled) applyBoard(detail.board);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить доску");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyBoard, boardId, isWowstorg, viewParams.projectId]);

  React.useEffect(() => {
    if (boardId) void loadBoard(boardId);
  }, [boardId, loadBoard]);

  async function addColumn() {
    if (!board) return;
    setError(null);
    try {
      await readApi(
        await fetch(`/api/tasks/boards/${board.id}/columns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Новая колонка", color: COLUMN_COLORS[0] }),
        }),
      );
      await loadBoard(board.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить колонку");
    }
  }

  async function patchColumn(columnId: string, body: object) {
    try {
      await readApi(
        await fetch(`/api/tasks/columns/${columnId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      if (board) await loadBoard(board.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить колонку");
    }
  }

  async function deleteColumn(columnId: string) {
    if (!window.confirm("Удалить пустую колонку?")) return;
    try {
      await readApi(await fetch(`/api/tasks/columns/${columnId}`, { method: "DELETE" }));
      if (board) await loadBoard(board.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить колонку");
    }
  }

  async function patchChecklistItem(taskId: string, itemId: string, body: { isDone?: boolean; title?: string }) {
    const previousBoard = boardRef.current;
    if (body.isDone !== undefined) {
      updateBoard((current) =>
        current
          ? {
              ...current,
              columns: current.columns.map((column) => ({
                ...column,
                tasks: column.tasks.map((task) => {
                  if (task.id !== taskId) return task;
                  const checklistItems = task.checklistItems.map((item) =>
                    item.id === itemId ? { ...item, isDone: body.isDone! } : item,
                  );
                  return {
                    ...task,
                    checklistItems,
                    checklistDone: checklistItems.filter((item) => item.isDone).length,
                  };
                }),
              })),
            }
          : current,
      );
    }
    try {
      await readApi(
        await fetch(`/api/tasks/checklist/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось обновить подзадачу");
    }
  }

  async function deleteChecklistItemInline(taskId: string, itemId: string) {
    const previousBoard = boardRef.current;
    const isPending = itemId.startsWith("temp-checklist-");

    updateTaskInBoard(taskId, (task) => {
      const checklistItems = task.checklistItems.filter((item) => item.id !== itemId);
      return {
        ...task,
        checklistItems,
        checklistTotal: checklistItems.length,
        checklistDone: checklistItems.filter((item) => item.isDone).length,
      };
    });

    if (isPending) return;

    try {
      await readApi(await fetch(`/api/tasks/checklist/${itemId}`, { method: "DELETE" }));
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось удалить подзадачу");
    }
  }

  function updateTaskInBoard(taskId: string, updater: (task: BoardTask) => BoardTask) {
    updateBoard((current) =>
      current
        ? {
            ...current,
            columns: current.columns.map((column) => ({
              ...column,
              tasks: column.tasks.map((task) => (task.id === taskId ? updater(task) : task)),
            })),
          }
        : current,
    );
  }

  async function patchTaskInline(taskId: string, body: TaskPatchBody) {
    const previousBoard = boardRef.current;
    updateTaskInBoard(taskId, (task) => ({
      ...task,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.completed !== undefined ? { completedAt: body.completed ? new Date().toISOString() : null } : {}),
    }));
    try {
      await readApi(
        await fetch(`/api/tasks/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      const needsBoardReload =
        body.columnId !== undefined ||
        body.assigneeUserId !== undefined ||
        body.projectId !== undefined ||
        body.orderId !== undefined;
      if (needsBoardReload && boardRef.current) await loadBoard(boardRef.current.id);
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось обновить задачу");
    }
  }

  async function addChecklistItemInline(taskId: string, title: string) {
    const previousBoard = boardRef.current;
    const tempId = `temp-checklist-${Date.now()}`;
    setExpandedTaskIds((current) => new Set(current).add(taskId));

    updateTaskInBoard(taskId, (task) => {
      const nextSortOrder = task.checklistItems.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1000;
      const checklistItems = [
        ...task.checklistItems,
        { id: tempId, title, isDone: false, sortOrder: nextSortOrder },
      ];
      return {
        ...task,
        checklistItems,
        checklistTotal: checklistItems.length,
        checklistDone: checklistItems.filter((item) => item.isDone).length,
      };
    });

    try {
      const data = await readApi<{ item: { id: string } }>(
        await fetch(`/api/tasks/tasks/${taskId}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }),
      );
      updateTaskInBoard(taskId, (task) => ({
        ...task,
        checklistItems: task.checklistItems.map((item) =>
          item.id === tempId ? { ...item, id: data.item.id } : item,
        ),
      }));
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось добавить подзадачу");
    }
  }

  async function moveTaskToColumn(taskId: string, targetColumnId: string) {
    const currentBoard = boardRef.current;
    if (!currentBoard) return;
    const nextColumn = currentBoard.columns.find((column) => column.id === targetColumnId);
    if (!nextColumn) return;
    const sourceColumn = currentBoard.columns.find((column) => column.tasks.some((task) => task.id === taskId));
    if (!sourceColumn || sourceColumn.id === targetColumnId) return;
    const movingTask = sourceColumn.tasks.find((task) => task.id === taskId);
    if (!movingTask) return;

    const previousBoard = currentBoard;
    const moveRequestId = moveRequestIdRef.current + 1;
    moveRequestIdRef.current = moveRequestId;
    latestMoveByTaskRef.current.set(taskId, moveRequestId);
    setError(null);

    const movedTask: BoardTask = {
      ...movingTask,
      completedAt: nextColumn.isDone ? (movingTask.completedAt ?? new Date().toISOString()) : null,
    };
    applyBoard({
      ...currentBoard,
      columns: currentBoard.columns.map((column) => {
        const tasksWithoutMoving = column.tasks.filter((task) => task.id !== taskId);
        if (column.id === targetColumnId) {
          return { ...column, tasks: [...tasksWithoutMoving, movedTask] };
        }
        return { ...column, tasks: tasksWithoutMoving };
      }),
    });

    const sendMove = async () => {
      try {
        await readApi(
          await fetch(`/api/tasks/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ columnId: nextColumn.id, completed: nextColumn.isDone }),
          }),
        );
        const freshBoard = await fetchBoardDetail(currentBoard.id);
        if (latestMoveByTaskRef.current.get(taskId) === moveRequestId) {
          latestMoveByTaskRef.current.delete(taskId);
          if (freshBoard) applyBoard(freshBoard);
        }
      } catch (e) {
        if (latestMoveByTaskRef.current.get(taskId) === moveRequestId) {
          latestMoveByTaskRef.current.delete(taskId);
          applyBoard(previousBoard);
          setError(e instanceof Error ? e.message : "Не удалось переместить задачу");
        }
      }
    };

    const previousMove = moveQueueByTaskRef.current.get(taskId) ?? Promise.resolve();
    const queuedMove = previousMove.catch(() => undefined).then(sendMove);
    moveQueueByTaskRef.current.set(taskId, queuedMove);
    void queuedMove.finally(() => {
      if (moveQueueByTaskRef.current.get(taskId) === queuedMove) {
        moveQueueByTaskRef.current.delete(taskId);
      }
    });
  }

  function toggleTaskExpanded(taskId: string) {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  if (state.status === "authenticated" && !isWowstorg) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Раздел доступен только Wowstorg.</div>;
  }

  return (
    <div
      className={[
        "rounded-3xl border border-violet-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(245,243,255,0.92))] shadow-[0_24px_70px_rgba(109,40,217,0.12)]",
        viewParams.embedded ? "p-3" : "p-4",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          {viewParams.projectId ? (
            <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">
              Проектные задачи
            </span>
          ) : null}
          {boards.length > 1 ? (
            <select
              value={boardId}
              onChange={(event) => setBoardId(event.target.value)}
              className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm outline-none focus:border-violet-300"
            >
              {boards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="px-1 text-sm font-semibold text-zinc-900">{board?.title ?? boards[0]?.title ?? "Рабочая доска"}</h1>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void addColumn()}
            disabled={viewParams.readOnly}
            className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-violet-500"
          >
            + Колонка
          </button>
        </div>
      </div>

      {loading ? <div className="px-4 py-6 text-sm text-zinc-600">Загрузка...</div> : null}
      {error ? <div className="mx-1 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</div> : null}

      {!loading && board ? (
        <div className="mt-4 overflow-x-auto pb-3">
        <div className={`${viewParams.embedded ? "min-h-[26rem]" : "min-h-[calc(100vh-280px)]"} flex gap-4 px-1 pb-2`}>
          {board.columns.map((column, columnIndex) => (
            <section
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverColumnId(column.id);
              }}
              onDragLeave={() => {
                if (dragOverColumnId === column.id) setDragOverColumnId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
                setDragOverColumnId(null);
                if (!viewParams.readOnly && taskId && column.id !== draggingFromColumnId) void moveTaskToColumn(taskId, column.id);
              }}
              className={[
                "flex w-[320px] shrink-0 flex-col rounded-2xl border bg-white/85 shadow-sm backdrop-blur transition",
                dragOverColumnId === column.id ? "border-violet-300 ring-4 ring-violet-100" : "border-white/80",
              ].join(" ")}
            >
              <div className="rounded-t-2xl px-3 py-3" style={{ backgroundColor: column.color ?? "#334155" }}>
                <div className="flex items-start justify-between gap-2">
                  <input
                    value={column.title}
                    onChange={(event) => {
                      const next = event.target.value;
                      updateBoard((current) =>
                        current
                          ? {
                              ...current,
                              columns: current.columns.map((col) => (col.id === column.id ? { ...col, title: next } : col)),
                            }
                          : current,
                      );
                    }}
                    onBlur={(event) => void patchColumn(column.id, { title: event.target.value })}
                    disabled={viewParams.readOnly}
                    className="min-w-0 flex-1 bg-transparent text-base font-bold text-white outline-none placeholder:text-white/70"
                  />
                  <button
                    type="button"
                    onClick={() => void patchColumn(column.id, { isDone: !column.isDone })}
                    disabled={viewParams.readOnly}
                    className="rounded-md border border-white/30 bg-white/10 px-2 py-1 text-xs text-white/90 hover:bg-white/20"
                    title="Колонка завершения"
                  >
                    {column.isDone ? "✓" : "○"}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditor({ task: null, columnId: column.id })}
                    disabled={viewParams.readOnly}
                    className="text-sm font-semibold text-white/90 hover:text-white"
                  >
                    + Добавить задачу
                  </button>
                  {column.tasks.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => void deleteColumn(column.id)}
                      className="ml-auto text-xs font-medium text-white/75 hover:text-white"
                    >
                      удалить
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-[15rem] flex-1 space-y-3 px-3 py-3">
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    column={column}
                    onOpen={(nextTask) => setEditor({ task: nextTask, columnId: column.id })}
                    onPatchTask={(taskId, body) => void patchTaskInline(taskId, body)}
                    onAddChecklistItem={(taskId, title) => void addChecklistItemInline(taskId, title)}
                    expanded={expandedTaskIds.has(task.id)}
                    onToggleExpanded={toggleTaskExpanded}
                    onToggleChecklistItem={(itemId, isDone) => void patchChecklistItem(task.id, itemId, { isDone })}
                    onDeleteChecklistItem={(itemId) => void deleteChecklistItemInline(task.id, itemId)}
                    onDragStart={(taskId, fromColumnId) => {
                      setDraggingTaskId(taskId);
                      setDraggingFromColumnId(fromColumnId);
                    }}
                    onDragEnd={() => {
                      setDraggingTaskId(null);
                      setDraggingFromColumnId(null);
                      setDragOverColumnId(null);
                    }}
                  />
                ))}
                {column.tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-white/60 px-3 py-4 text-sm text-zinc-500">
                    {columnIndex === 0 ? "Добавьте первую задачу" : "Пусто"}
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
        </div>
      ) : null}

      {editor ? (
        <TaskEditor
          task={editor.task}
          columnId={editor.columnId}
          columns={board?.columns ?? []}
          meta={meta}
          defaultProjectId={viewParams.projectId || null}
          projectLocked={Boolean(viewParams.projectId)}
          onClose={() => setEditor(null)}
          onSaved={() => void refresh()}
          onDeleted={() => void refresh()}
        />
      ) : null}
    </div>
  );
}

export default function TasksPage() {
  const [embedded] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("embed") === "1";
  });

  if (embedded) {
    return <TasksPageContent />;
  }

  return (
    <AppShell title="Задачи">
      <TasksPageContent />
    </AppShell>
  );
}
