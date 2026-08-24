"use client";

import React from "react";
import { createPortal } from "react-dom";

import { AppShell } from "@/app/_ui/AppShell";
import { BoardSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import { TaskActivityDrawer } from "@/app/tasks/TaskActivityDrawer";

import "./task-board.css";

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
  parentId: string | null;
  title: string;
  description: string | null;
  isDone: boolean;
  sortOrder: number;
  priority: Priority;
  color: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  assignee: null | { id: string; displayName: string };
};

type ChecklistPatchBody = Partial<{
  title: string;
  isDone: boolean;
  assigneeUserId: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  priority: Priority;
  color: string | null;
}>;

type ChecklistTreeNode = TaskChecklistItem & { children: ChecklistTreeNode[] };

type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  color: string | null;
  sortOrder: number;
  dueDate: string | null;
  reminderAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: null | { id: string; displayName: string };
  project: null | { id: string; title: string };
  order: null | { id: string; eventName: string | null; customer: { name: string } };
  checklistItems: TaskChecklistItem[];
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
  lastActivityAt: string | null;
  lastActivityKind: string | null;
};

type BoardColumn = {
  id: string;
  title: string;
  color: string | null;
  sortOrder: number;
  isDone: boolean;
  updatedAt: string;
  tasks: BoardTask[];
};

type BoardDetail = {
  id: string;
  title: string;
  description: string | null;
  isDefault: boolean;
  updatedAt: string;
  syncToken: string;
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
  reminderAt: string | null;
  priority: Priority;
  color: string | null;
  projectId: string | null;
  orderId: string | null;
  columnId: string;
  sortOrder: number;
  completed: boolean;
  archived: boolean;
}>;

type TaskCreateDraft = {
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  priority: Priority;
  color: string | null;
  projectId: string | null;
  orderId: string | null;
};

type TaskDropEdge = "before" | "after";
type ColumnDropEdge = "before" | "after";
type TaskBoardTheme = "light" | "dark";

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
    <div className="task-card__context">
      {task.project ? (
        <a
          href={`/projects/${task.project.id}`}
          onClick={(event) => event.stopPropagation()}
          className="task-card__context-link"
          title={task.project.title}
        >
          <span>Проект</span> {task.project.title}
        </a>
      ) : null}
      {task.order ? (
        <a
          href={`/orders/${task.order.id}`}
          onClick={(event) => event.stopPropagation()}
          className="task-card__context-link"
          title={orderContextLabel(task.order)}
        >
          <span>Заявка</span> {orderContextLabel(task.order)}
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

function getModalPortalHost(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  try {
    if (window.parent && window.parent !== window && window.parent.document?.body) {
      return window.parent.document.body;
    }
  } catch {
    // Cross-origin iframe fallback; local embeds are same-origin.
  }
  return document.body;
}

function cardTextColor(color: string | null): string {
  void color;
  return "text-white";
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function buildChecklistTree(items: TaskChecklistItem[]): ChecklistTreeNode[] {
  const nodes = new Map<string, ChecklistTreeNode>();
  const roots: ChecklistTreeNode[] = [];

  for (const item of items) nodes.set(item.id, { ...item, children: [] });
  for (const item of items) {
    const node = nodes.get(item.id)!;
    const parent = item.parentId ? nodes.get(item.parentId) : null;
    if (parent && parent.id !== item.id) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: ChecklistTreeNode[]) => {
    list.sort((left, right) => left.sortOrder - right.sortOrder);
    for (const node of list) sort(node.children);
  };
  sort(roots);
  return roots;
}

function AnchoredPopover({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useLayoutEffect(() => {
    const nextHost = getModalPortalHost();
    setHost(nextHost);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const embeddedInParent = nextHost?.ownerDocument !== document;
    const frameRect = embeddedInParent && window.frameElement instanceof HTMLElement
      ? window.frameElement.getBoundingClientRect()
      : null;
    const offsetLeft = frameRect?.left ?? 0;
    const offsetTop = frameRect?.top ?? 0;
    const viewport = embeddedInParent ? window.parent : window;
    const width = 248;
    const left = Math.max(10, Math.min(rect.left + offsetLeft, viewport.innerWidth - width - 10));
    const estimatedHeight = 420;
    const top = rect.bottom + offsetTop + 6 + estimatedHeight > viewport.innerHeight
      ? Math.max(10, rect.top + offsetTop - estimatedHeight - 6)
      : rect.bottom + offsetTop + 6;
    setPosition({ top, left });
  }, [anchor]);

  React.useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const ownerDocument = host?.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    document.addEventListener("pointerdown", closeOutside);
    if (ownerDocument !== document) ownerDocument.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    if (ownerWindow !== window) ownerWindow.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      if (ownerDocument !== document) ownerDocument.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
      if (ownerWindow !== window) ownerWindow.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchor, host, onClose]);

  if (!host || !anchor) return null;
  return createPortal(
    <div ref={menuRef} className="task-popover" style={position} onMouseDown={(event) => event.stopPropagation()}>
      {children}
    </div>,
    host,
  );
}

function TaskStickerMenu({
  task,
  users,
  anchor,
  onClose,
  onPatch,
}: {
  task: BoardTask;
  users: TasksMeta["users"];
  anchor: HTMLElement | null;
  onClose: () => void;
  onPatch: (body: TaskPatchBody) => void;
}) {
  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      <div className="task-popover__title">Добавить или изменить стикер</div>
      <div className="task-popover__section">
        <label className="block text-[10px] font-bold text-white/55">Исполнитель</label>
        <select className="mt-1" value={task.assignee?.id ?? ""} onChange={(event) => {
          onPatch({ assigneeUserId: event.target.value || null }); onClose();
        }}><option value="">Не назначен</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select>
      </div>
      <div className="task-popover__section">
        <label className="block text-[10px] font-bold text-white/55">Дедлайн</label>
        <input className="mt-1" type="date" value={task.dueDate ?? ""} onChange={(event) => {
          onPatch({ dueDate: event.target.value || null }); onClose();
        }} />
      </div>
      <div className="task-popover__section">
        <label className="block text-[10px] font-bold text-white/55">Приоритет</label>
        <select className="mt-1" value={task.priority} onChange={(event) => {
          onPatch({ priority: event.target.value as Priority }); onClose();
        }}>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}</select>
      </div>
      <div className="task-popover__section">
        <label className="block text-[10px] font-bold text-white/55">Напоминание</label>
        <input className="mt-1" type="datetime-local" value={toLocalDateTime(task.reminderAt)} onChange={(event) => {
          onPatch({ reminderAt: fromLocalDateTime(event.target.value) }); onClose();
        }} />
      </div>
    </AnchoredPopover>
  );
}

function TaskActionMenu({
  task,
  columns,
  anchor,
  onClose,
  onPatch,
  onEdit,
  onActivity,
  onSubtasks,
  onDuplicate,
  onDelete,
}: {
  task: BoardTask;
  columns: BoardColumn[];
  anchor: HTMLElement | null;
  onClose: () => void;
  onPatch: (body: TaskPatchBody) => void;
  onEdit: () => void;
  onActivity: () => void;
  onSubtasks: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      <button type="button" className="task-popover__item" onClick={() => { onSubtasks(); onClose(); }}>＋ Создать подзадачу</button>
      <button type="button" className="task-popover__item" onClick={() => { onPatch({ completed: !task.completedAt }); onClose(); }}>{task.completedAt ? "↶ Вернуть в работу" : "✓ Отметить выполненной"}</button>
      <button type="button" className="task-popover__item" onClick={() => { onEdit(); onClose(); }}>✎ Переименовать и настроить</button>
      <button type="button" className="task-popover__item" onClick={() => { onActivity(); onClose(); }}>☵ История и заметки</button>
      <div className="task-popover__section">
        <label className="block text-[10px] font-bold text-white/55">Переместить</label>
        <select className="mt-1" defaultValue="" onChange={(event) => {
          const column = columns.find((item) => item.id === event.target.value);
          if (column) onPatch({ columnId: column.id, completed: column.isDone });
          onClose();
        }}><option value="" disabled>Выберите колонку</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select>
      </div>
      <button type="button" className="task-popover__item" onClick={() => { onPatch({ archived: true }); onClose(); }}>⌑ Поместить в архив</button>
      <button type="button" className="task-popover__item" onClick={() => { onDuplicate(); onClose(); }}>⧉ Дублировать</button>
      <div className="task-popover__section">
        <div className="mb-2 text-[10px] font-bold text-white/55">Цвет задачи</div>
        <div className="task-color-row">{TASK_COLORS.map((color) => <button key={color} type="button" aria-label={`Цвет ${color}`} className={`task-color-dot${task.color === color ? " is-active" : ""}`} style={{ backgroundColor: color }} onClick={() => { onPatch({ color }); onClose(); }} />)}</div>
      </div>
      <button type="button" className="task-popover__item is-danger" onClick={() => { onDelete(); onClose(); }}>⌫ Удалить</button>
    </AnchoredPopover>
  );
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
        "inline-flex shrink-0 items-center justify-center rounded-full border font-bold transition-colors",
        dim,
        checked
          ? "border-emerald-300 bg-emerald-500 text-white"
          : "border-white/40 bg-white/10 text-white/50 hover:border-white hover:bg-white/20 hover:text-white",
        className,
      ].join(" ")}
      aria-pressed={checked}
      aria-label={checked ? "Отметить невыполненной" : "Отметить выполненной"}
    >
      {checked ? (
        <svg aria-hidden viewBox="0 0 16 16" className="h-[70%] w-[70%]" fill="none">
          <path d="m3.2 8.1 3 3.1 6.6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}

function ChecklistStickerMenu({
  item,
  users,
  anchor,
  onClose,
  onPatch,
}: {
  item: TaskChecklistItem;
  users: TasksMeta["users"];
  anchor: HTMLElement | null;
  onClose: () => void;
  onPatch: (body: ChecklistPatchBody) => void;
}) {
  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      <div className="task-popover__title">Стикеры подзадачи</div>
      <div className="task-popover__section">
        <label>Исполнитель</label>
        <select value={item.assignee?.id ?? ""} onChange={(event) => { onPatch({ assigneeUserId: event.target.value || null }); onClose(); }}>
          <option value="">Не назначен</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
        </select>
      </div>
      <div className="task-popover__section">
        <label>Дедлайн</label>
        <input type="date" value={item.dueDate ?? ""} onChange={(event) => { onPatch({ dueDate: event.target.value || null }); onClose(); }} />
      </div>
      <div className="task-popover__section">
        <label>Приоритет</label>
        <select value={item.priority} onChange={(event) => { onPatch({ priority: event.target.value as Priority }); onClose(); }}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((priority) => <option key={priority} value={priority}>{PRIORITY_LABEL[priority]}</option>)}
        </select>
      </div>
      <div className="task-popover__section">
        <label>Напоминание</label>
        <input type="datetime-local" value={toLocalDateTime(item.reminderAt)} onChange={(event) => { onPatch({ reminderAt: fromLocalDateTime(event.target.value) }); onClose(); }} />
      </div>
      <div className="task-popover__section">
        <div className="task-popover__label">Цвет</div>
        <div className="task-color-row">
          <button type="button" className={`task-color-dot is-reset${item.color ? "" : " is-active"}`} onClick={() => { onPatch({ color: null }); onClose(); }} aria-label="Без цвета">×</button>
          {TASK_COLORS.map((color) => <button key={color} type="button" aria-label={`Цвет ${color}`} className={`task-color-dot${item.color === color ? " is-active" : ""}`} style={{ backgroundColor: color }} onClick={() => { onPatch({ color }); onClose(); }} />)}
        </div>
      </div>
    </AnchoredPopover>
  );
}

function ChecklistCreateRow({
  title,
  onTitleChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="task-checklist-create-row">
      <span aria-hidden className="task-checklist-create-row__icon">＋</span>
      <input
        autoFocus
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
          if (event.key === "Escape") onCancel();
        }}
        onBlur={() => { if (title.trim()) onSubmit(); else onCancel(); }}
        onMouseDown={(event) => event.stopPropagation()}
        placeholder="Название подзадачи"
      />
    </div>
  );
}

function ChecklistTreeItem({
  node,
  depth,
  users,
  addingParentId,
  newChecklistTitle,
  onNewChecklistTitleChange,
  onPatch,
  onEdit,
  onStartAdding,
  onSubmitNewItem,
  onCancelAdding,
}: {
  node: ChecklistTreeNode;
  depth: number;
  users: TasksMeta["users"];
  addingParentId: string | null | undefined;
  newChecklistTitle: string;
  onNewChecklistTitleChange: (value: string) => void;
  onPatch: (itemId: string, body: ChecklistPatchBody) => void;
  onEdit: (itemId: string) => void;
  onStartAdding: (parentId: string | null) => void;
  onSubmitNewItem: () => void;
  onCancelAdding: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const urgent = node.priority === "HIGH" || node.priority === "URGENT";

  return (
    <div className="task-checklist-node" style={{ "--task-tree-depth": depth } as React.CSSProperties}>
      <div className="task-checklist-row" style={node.color ? { backgroundColor: node.color } : undefined}>
        <div className="task-checklist-row__main">
          <RoundCheckbox size="sm" checked={node.isDone} onChange={(checked) => onPatch(node.id, { isDone: checked })} />
          <span className={`task-checklist-row__title${node.isDone ? " is-done" : ""}`}>{node.title}</span>
          <button type="button" className="task-checklist-row__menu" aria-label="Настроить подзадачу" onClick={(event) => { event.stopPropagation(); onEdit(node.id); }}>⋮</button>
        </div>
        <div className="task-checklist-row__stickers">
          {urgent ? <span className="task-subtask-sticker is-priority">≡ {PRIORITY_LABEL[node.priority]}</span> : null}
          {node.dueDate ? <span className="task-subtask-sticker">▣ {fmtDate(node.dueDate)}</span> : null}
          {node.reminderAt ? <span className="task-subtask-sticker" title="Есть напоминание">◴</span> : null}
          {node.assignee ? <span className="task-checklist-row__avatar" title={node.assignee.displayName}>{initials(node.assignee.displayName)}</span> : null}
          <div className="task-checklist-row__quick">
            <button type="button" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setMenuOpen(true); }}>＋ Стикер</button>
            <button type="button" title="Создать вложенную подзадачу" aria-label="Создать вложенную подзадачу" onClick={(event) => { event.stopPropagation(); onStartAdding(node.id); }}>＋</button>
          </div>
        </div>
      </div>
      {node.children.length > 0 || addingParentId === node.id ? (
        <div className="task-checklist-children">
          {node.children.map((child) => (
            <ChecklistTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              users={users}
              addingParentId={addingParentId}
              newChecklistTitle={newChecklistTitle}
              onNewChecklistTitleChange={onNewChecklistTitleChange}
              onPatch={onPatch}
              onEdit={onEdit}
              onStartAdding={onStartAdding}
              onSubmitNewItem={onSubmitNewItem}
              onCancelAdding={onCancelAdding}
            />
          ))}
          {addingParentId === node.id ? <ChecklistCreateRow title={newChecklistTitle} onTitleChange={onNewChecklistTitleChange} onSubmit={onSubmitNewItem} onCancel={onCancelAdding} /> : null}
        </div>
      ) : null}
      {menuOpen ? <ChecklistStickerMenu item={node} users={users} anchor={menuAnchor} onClose={() => setMenuOpen(false)} onPatch={(body) => onPatch(node.id, body)} /> : null}
    </div>
  );
}

function ChecklistTreeSection({
  items,
  users,
  addingParentId,
  newChecklistTitle,
  onNewChecklistTitleChange,
  onPatchChecklistItem,
  onEditChecklistItem,
  onStartAdding,
  onSubmitNewItem,
  onCancelAdding,
}: {
  items: TaskChecklistItem[];
  users: TasksMeta["users"];
  addingParentId: string | null | undefined;
  newChecklistTitle: string;
  onNewChecklistTitleChange: (value: string) => void;
  onPatchChecklistItem: (itemId: string, body: ChecklistPatchBody) => void;
  onEditChecklistItem: (itemId: string) => void;
  onStartAdding: (parentId: string | null) => void;
  onSubmitNewItem: () => void;
  onCancelAdding: () => void;
}) {
  const tree = React.useMemo(() => buildChecklistTree(items), [items]);
  return (
    <div className="task-checklist-tree">
      {tree.map((node) => (
        <ChecklistTreeItem key={node.id} node={node} depth={0} users={users} addingParentId={addingParentId} newChecklistTitle={newChecklistTitle} onNewChecklistTitleChange={onNewChecklistTitleChange} onPatch={onPatchChecklistItem} onEdit={onEditChecklistItem} onStartAdding={onStartAdding} onSubmitNewItem={onSubmitNewItem} onCancelAdding={onCancelAdding} />
      ))}
      {addingParentId === null ? <ChecklistCreateRow title={newChecklistTitle} onTitleChange={onNewChecklistTitleChange} onSubmit={onSubmitNewItem} onCancel={onCancelAdding} /> : null}
      {addingParentId === undefined ? <button type="button" className="task-checklist-tree__add-root" onClick={(event) => { event.stopPropagation(); onStartAdding(null); }}>＋ Создать подзадачу</button> : null}
    </div>
  );
}

function TaskChecklistPanel({
  task,
  expanded,
  newChecklistTitle,
  onToggleExpanded,
  onPatchChecklistItem,
  onEditChecklistItem,
  onNewChecklistTitleChange,
  onAddChecklistItem,
  users,
}: {
  task: BoardTask;
  expanded: boolean;
  newChecklistTitle: string;
  onToggleExpanded: (taskId: string) => void;
  onPatchChecklistItem: (itemId: string, body: ChecklistPatchBody) => void;
  onEditChecklistItem: (itemId: string) => void;
  onNewChecklistTitleChange: (value: string) => void;
  onAddChecklistItem: (title: string, parentId: string | null) => void;
  users: TasksMeta["users"];
}) {
  const [addingParentId, setAddingParentId] = React.useState<string | null | undefined>(undefined);
  const progressPct = task.checklistTotal > 0 ? Math.round((task.checklistDone / task.checklistTotal) * 100) : 0;
  const hasChecklist = task.checklistTotal > 0;
  const showTree = expanded || !hasChecklist;

  function submitNewItem() {
    const next = newChecklistTitle.trim();
    if (!next) return;
    onAddChecklistItem(next, addingParentId ?? null);
    onNewChecklistTitleChange("");
    setAddingParentId(undefined);
  }

  function startAdding(parentId: string | null) {
    if (hasChecklist && !expanded) onToggleExpanded(task.id);
    setAddingParentId(parentId);
  }

  if (!hasChecklist && addingParentId === undefined) {
    return (
      <div className="task-checklist-footer task-checklist-footer--empty">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); startAdding(null); }}
          onMouseDown={(event) => event.stopPropagation()}
          className="task-checklist-create"
        >
          + Создать подзадачу
        </button>
      </div>
    );
  }

  return (
    <div className="task-checklist-footer">
      {hasChecklist ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded(task.id);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="task-checklist-progress"
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
          <span className="shrink-0 text-[10px] text-slate-300/75">{expanded ? "▴" : "▾"}</span>
        </button>
      ) : null}

      {showTree ? (
        <ChecklistTreeSection
          items={task.checklistItems}
          users={users}
          addingParentId={addingParentId}
          newChecklistTitle={newChecklistTitle}
          onNewChecklistTitleChange={onNewChecklistTitleChange}
          onPatchChecklistItem={onPatchChecklistItem}
          onEditChecklistItem={onEditChecklistItem}
          onStartAdding={startAdding}
          onSubmitNewItem={submitNewItem}
          onCancelAdding={() => {
            onNewChecklistTitleChange("");
            setAddingParentId(undefined);
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
  onPatchChecklistItem,
  onDragStart,
  onDragEnd,
  onDragOverTask,
  onDropOnTask,
  dropEdge,
  users,
  columns,
  onOpenActivity,
  onOpenSubtasks,
  onDuplicate,
  onDelete,
  isDragging,
  dragPreviewHeight,
}: {
  task: BoardTask;
  column: BoardColumn;
  onOpen: (task: BoardTask) => void;
  onPatchTask: (taskId: string, body: TaskPatchBody) => void;
  onAddChecklistItem: (taskId: string, title: string, parentId: string | null) => void;
  expanded: boolean;
  onToggleExpanded: (taskId: string) => void;
  onPatchChecklistItem: (itemId: string, body: ChecklistPatchBody) => void;
  onDragStart: (taskId: string, fromColumnId: string, cardHeight: number) => void;
  onDragEnd: () => void;
  onDragOverTask: (taskId: string, columnId: string, edge: TaskDropEdge) => void;
  onDropOnTask: (taskId: string, targetTaskId: string, targetColumnId: string, edge: TaskDropEdge) => void;
  dropEdge: TaskDropEdge | null;
  users: TasksMeta["users"];
  columns: BoardColumn[];
  onOpenActivity: (taskId: string) => void;
  onOpenSubtasks: (taskId: string) => void;
  onDuplicate: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  isDragging: boolean;
  dragPreviewHeight: number;
}) {
  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");
  const cardRef = React.useRef<HTMLElement>(null);
  const draggedRef = React.useRef(false);
  const [openMenu, setOpenMenu] = React.useState<"stickers" | "assignee" | "actions" | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLButtonElement | null>(null);
  const isUrgent = task.priority === "URGENT" || task.priority === "HIGH";
  const textTone = cardTextColor(task.color);
  const taskDone = Boolean(task.completedAt);

  return (
    <div
      className={`task-card-slot${dropEdge ? ` is-drop-${dropEdge}` : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = cardRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        const edge: TaskDropEdge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        onDragOverTask(task.id, column.id, edge);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const movedTaskId = event.dataTransfer.getData("text/plain");
        const rect = cardRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        const edge: TaskDropEdge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        if (movedTaskId) onDropOnTask(movedTaskId, task.id, column.id, edge);
      }}
    >
      {dropEdge === "before" ? <div className="task-drop-placeholder" style={{ height: dragPreviewHeight || 76 }} /> : null}
    <article
      ref={cardRef}
      data-task-card-id={task.id}
      draggable
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button,input,textarea,select,a")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.setData("application/x-wowstorg-task-id", task.id);
        draggedRef.current = true;
        onDragStart(task.id, column.id, event.currentTarget.getBoundingClientRect().height);
      }}
      onDragEnd={() => {
        onDragEnd();
        window.setTimeout(() => { draggedRef.current = false; }, 0);
      }}
      onClick={(event) => {
        if (draggedRef.current) return;
        const target = event.target as HTMLElement;
        if (target.closest("button,input,textarea,select,a,summary")) return;
        onOpenActivity(task.id);
      }}
      className={[
        "task-card group",
        isDragging ? "task-card-dragging" : "",
        textTone,
      ].join(" ")}
      style={{ backgroundColor: task.color ?? "#334155" }}
    >
      <div className="task-card__body">
        <div className="task-card__heading">
          <RoundCheckbox checked={taskDone} onChange={() => onPatchTask(task.id, { completed: !taskDone })} />
          <div className="min-w-0 flex-1">
            <div className="task-card__title-row">
              <strong className={`task-card__title${taskDone ? " is-done" : ""}`}>{task.title}</strong>
              <button
                type="button"
                className="task-card__edit"
                onClick={(event) => { event.stopPropagation(); onOpen(task); }}
                onMouseDown={(event) => event.stopPropagation()}
                title="Редактировать задачу"
                aria-label="Редактировать задачу"
              >
                ✎
              </button>
            </div>
            <TaskCardContext task={task} />
          </div>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu((current) => current === "actions" ? null : "actions"); }}
            onMouseDown={(event) => event.stopPropagation()}
            className="task-card__menu"
            title="Действия с задачей"
            aria-label="Действия с задачей"
          >
            ⋮
          </button>
        </div>

        <div className="task-card-tools">
          {isUrgent ? <span className="task-card-sticker task-card-sticker--priority">≡ {PRIORITY_LABEL[task.priority]}</span> : null}
          {task.dueDate ? <span className="task-card-sticker">▣ {fmtDate(task.dueDate)}</span> : null}
          {task.reminderAt ? <span className="task-card-sticker" title="Есть напоминание">◴</span> : null}
          <button type="button" className="task-card-tool" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu((current) => current === "stickers" ? null : "stickers"); }} onMouseDown={(event) => event.stopPropagation()}>＋ Стикер</button>
          <button type="button" className="task-card-tool task-card-tool--round" title="Назначить исполнителя" aria-label="Назначить исполнителя" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu((current) => current === "assignee" ? null : "assignee"); }} onMouseDown={(event) => event.stopPropagation()}>♙</button>
          {task.commentCount > 0 ? <span className="task-card-comments" title="В задаче есть заметки">☵ <span>{task.commentCount}</span></span> : null}
          {task.assignee ? (
            <span className="task-card-assignee" title={task.assignee.displayName}>
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
        onPatchChecklistItem={onPatchChecklistItem}
        onEditChecklistItem={() => onOpenSubtasks(task.id)}
        onNewChecklistTitleChange={setNewChecklistTitle}
        onAddChecklistItem={(title, parentId) => onAddChecklistItem(task.id, title, parentId)}
        users={users}
      />
    </article>
      {dropEdge === "after" ? <div className="task-drop-placeholder" style={{ height: dragPreviewHeight || 76 }} /> : null}
      {openMenu === "stickers" ? <TaskStickerMenu task={task} users={users} anchor={menuAnchor} onClose={() => setOpenMenu(null)} onPatch={(body) => onPatchTask(task.id, body)} /> : null}
      {openMenu === "assignee" ? (
        <AnchoredPopover anchor={menuAnchor} onClose={() => setOpenMenu(null)}>
          <div className="task-popover__title">Исполнитель</div>
          <button type="button" className="task-popover__item" onClick={() => { onPatchTask(task.id, { assigneeUserId: null }); setOpenMenu(null); }}>Без исполнителя</button>
          {users.map((user) => <button key={user.id} type="button" className="task-popover__item" onClick={() => { onPatchTask(task.id, { assigneeUserId: user.id }); setOpenMenu(null); }}><span className="task-avatar !h-6 !w-6">{initials(user.displayName)}</span>{user.displayName}</button>)}
        </AnchoredPopover>
      ) : null}
      {openMenu === "actions" ? <TaskActionMenu task={task} columns={columns} anchor={menuAnchor} onClose={() => setOpenMenu(null)} onPatch={(body) => onPatchTask(task.id, body)} onEdit={() => onOpen(task)} onActivity={() => onOpenActivity(task.id)} onSubtasks={() => onOpenSubtasks(task.id)} onDuplicate={() => onDuplicate(task.id)} onDelete={() => onDelete(task.id)} /> : null}
    </div>
  );
}

function ArchivedChecklistPreview({ task }: { task: BoardTask }) {
  if (task.checklistTotal === 0) {
    return (
      <div className="border-t border-black/25 bg-[#283040] px-3 py-2.5 text-xs font-medium text-sky-400">
        Подзадач нет
      </div>
    );
  }

  const progressPct = Math.round((task.checklistDone / task.checklistTotal) * 100);

  return (
    <div className="border-t border-black/25 bg-[#283040]">
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/35">
          <div
            className={[
              "h-full rounded-full",
              progressPct === 100 ? "bg-emerald-400" : "bg-white/45",
            ].join(" ")}
            style={{ width: `${progressPct > 0 ? Math.max(progressPct, 6) : 0}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-300/90">
          {task.checklistDone}/{task.checklistTotal}
        </span>
      </div>
      <div className="space-y-1 px-3 pb-3">
        {task.checklistItems.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-xs leading-snug text-slate-100/82">
            <span
              className={[
                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                item.isDone
                  ? "border-emerald-400 bg-emerald-500 text-white"
                  : "border-white/40 bg-white/15 text-white/40",
              ].join(" ")}
            >
              {item.isDone ? "✓" : ""}
            </span>
            <span className={item.isDone ? "line-through opacity-65" : ""}>{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchivedTaskCard({
  task,
  onRestore,
}: {
  task: BoardTask & { columnTitle: string };
  onRestore: (taskId: string) => void;
}) {
  const isUrgent = task.priority === "URGENT" || task.priority === "HIGH";
  const taskDone = Boolean(task.completedAt);
  const textTone = cardTextColor(task.color);

  return (
    <article
      className={[
        "group overflow-hidden rounded-xl border border-black/10 bg-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.18)]",
        textTone,
      ].join(" ")}
      style={{ backgroundColor: task.color ?? "#334155" }}
    >
      <div className="px-3 py-3">
        <div className="flex items-start gap-2">
          <span
            className={[
              "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
              taskDone
                ? "border-emerald-400 bg-emerald-500 text-white shadow-sm shadow-emerald-950/20"
                : "border-white/40 bg-white/15 text-white/50",
            ].join(" ")}
          >
            {taskDone ? "✓" : ""}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className={[
                "px-1 py-0.5 text-sm font-semibold leading-snug",
                taskDone ? "opacity-70 line-through" : "",
              ].join(" ")}
              title={task.title}
            >
              {task.title}
            </div>
            <TaskCardContext task={task} />
            {task.description ? (
              <div className="mt-1 whitespace-pre-wrap break-words px-1 py-0.5 text-xs leading-snug text-slate-100/80">
                {task.description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onRestore(task.id)}
            className="shrink-0 rounded-lg border border-white/20 bg-white/12 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
          >
            Вернуть
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
          <span className="rounded-md border border-white/30 bg-white/10 px-2 py-0.5 text-[11px] text-slate-100">
            {task.columnTitle}
          </span>
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
            <span
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-white/12 py-0.5 pl-1 pr-2 text-[11px] font-semibold text-white"
              title={task.assignee.displayName}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-pink-600 text-[11px] font-bold">
                {initials(task.assignee.displayName)}
              </span>
              <span className="max-w-32 truncate">{task.assignee.displayName}</span>
            </span>
          ) : null}
        </div>
      </div>

      <ArchivedChecklistPreview task={task} />
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
  onCreatedOptimistic,
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
  onCreatedOptimistic: (
    columnId: string,
    draft: TaskCreateDraft,
    request: Promise<{ task: BoardTask }>,
  ) => void;
  onDeleted: () => void;
}) {
  const isNew = task == null;
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [assigneeUserId, setAssigneeUserId] = React.useState(task?.assignee?.id ?? "");
  const [dueDate, setDueDate] = React.useState(task?.dueDate ?? "");
  const [reminderAt, setReminderAt] = React.useState(toLocalDateTime(task?.reminderAt ?? null));
  const [priority, setPriority] = React.useState<Priority>(task?.priority ?? "NORMAL");
  const [color, setColor] = React.useState(task?.color ?? TASK_COLORS[0]!);
  const [projectId, setProjectId] = React.useState(task?.project?.id ?? defaultProjectId ?? "");
  const [orderId, setOrderId] = React.useState(task?.order?.id ?? "");
  const [targetColumnId, setTargetColumnId] = React.useState(columnId ?? columns[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");
  const [portalHost, setPortalHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setPortalHost(getModalPortalHost());
  }, []);

  React.useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssigneeUserId(task?.assignee?.id ?? "");
    setDueDate(task?.dueDate ?? "");
    setReminderAt(toLocalDateTime(task?.reminderAt ?? null));
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
      const body: TaskCreateDraft = {
        title: title.trim(),
        description: description.trim() || null,
        assigneeUserId: assigneeUserId || null,
        dueDate: dueDate || null,
        reminderAt: fromLocalDateTime(reminderAt),
        priority,
        color,
        projectId: projectId || null,
        orderId: orderId || null,
      };
      const payload = isNew ? body : { ...body, columnId: targetColumnId };
      const endpoint = isNew ? `/api/tasks/columns/${targetColumnId}/tasks` : `/api/tasks/tasks/${task!.id}`;
      const request = fetch(endpoint, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((res) => readApi<{ task: BoardTask }>(res));
      if (isNew) {
        onCreatedOptimistic(targetColumnId, body, request);
        onClose();
        return;
      }
      await request;
      onSaved();
      onClose();
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

  const editorNode = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6">
      <button className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[3px]" onClick={onClose} aria-label="Закрыть" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-editor-title"
        className="relative flex max-h-[min(780px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-[linear-gradient(180deg,#ffffff,#f8f7ff)] text-zinc-950 shadow-[0_28px_90px_rgba(15,23,42,0.34)]"
      >
        <div className="shrink-0 border-b border-violet-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div id="task-editor-title" className="text-lg font-bold">{isNew ? "Новая задача" : "Задача"}</div>
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
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Напоминание</span>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
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

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-violet-100 bg-white/90 px-5 py-4">
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
      </section>
    </div>
  );

  return portalHost ? createPortal(editorNode, portalHost) : null;
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
  const [activityDrawer, setActivityDrawer] = React.useState<{
    taskId: string;
    tab: "activity" | "details" | "subtasks";
  } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null);
  const [dragPreviewHeight, setDragPreviewHeight] = React.useState(76);
  const [draggingFromColumnId, setDraggingFromColumnId] = React.useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = React.useState<string | null>(null);
  const [dragOverTask, setDragOverTask] = React.useState<{
    taskId: string;
    columnId: string;
    edge: TaskDropEdge;
  } | null>(null);
  const [draggingColumnId, setDraggingColumnId] = React.useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = React.useState<{
    columnId: string;
    edge: ColumnDropEdge;
  } | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = React.useState<Set<string>>(() => new Set());
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveLoading, setArchiveLoading] = React.useState(false);
  const [archiveTasks, setArchiveTasks] = React.useState<Array<BoardTask & { columnTitle: string }>>([]);
  const [archivePortalHost, setArchivePortalHost] = React.useState<HTMLElement | null>(null);
  const [boardTheme, setBoardTheme] = React.useState<TaskBoardTheme>("light");
  const boardRef = React.useRef<BoardDetail | null>(null);
  const moveQueueByTaskRef = React.useRef<Map<string, Promise<void>>>(new Map());
  const mutationSequenceRef = React.useRef(0);
  const latestMutationByTaskRef = React.useRef<Map<string, number>>(new Map());
  const pendingMutationsRef = React.useRef(0);
  const isWowstorg = state.status === "authenticated" && state.user.role === "WOWSTORG";

  React.useEffect(() => {
    setArchivePortalHost(getModalPortalHost());
    const savedTheme = window.localStorage.getItem("wowstorg-task-board-theme");
    if (savedTheme === "dark" || savedTheme === "light") setBoardTheme(savedTheme);
  }, []);

  function toggleBoardTheme() {
    setBoardTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      window.localStorage.setItem("wowstorg-task-board-theme", next);
      return next;
    });
  }

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
    params.set("archived", "0");
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

  const loadArchive = React.useCallback(async () => {
    if (!boardId) return;
    setArchiveLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ archived: "1" });
      if (viewParams.projectId) {
        params.set("projectId", viewParams.projectId);
        params.set("includeClosedProjectTasks", "1");
      }
      const data = await readApi<{ board: BoardDetail }>(
        await fetch(`/api/tasks/boards/${boardId}?${params.toString()}`, { cache: "no-store" }),
      );
      setArchiveTasks(
        data.board.columns.flatMap((column) =>
          column.tasks.map((task) => ({ ...task, columnTitle: column.title })),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить архив задач");
    } finally {
      setArchiveLoading(false);
    }
  }, [boardId, viewParams.projectId]);

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

  React.useEffect(() => {
    if (!boardId || !isWowstorg) return;
    let stopped = false;
    const sync = async () => {
      if (
        stopped ||
        document.visibilityState !== "visible" ||
        pendingMutationsRef.current > 0 ||
        draggingTaskId ||
        draggingColumnId ||
        editor ||
        activityDrawer
      ) return;
      try {
        const nextBoard = await fetchBoardDetail(boardId);
        if (!stopped && nextBoard && nextBoard.syncToken !== boardRef.current?.syncToken) applyBoard(nextBoard);
      } catch {
        // Фоновая синхронизация не должна мешать работе с доской.
      }
    };
    const timer = window.setInterval(() => void sync(), 12_000);
    const onFocus = () => void sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [activityDrawer, applyBoard, boardId, draggingColumnId, draggingTaskId, editor, fetchBoardDetail, isWowstorg]);

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

  async function archiveCompletedTasks(column: BoardColumn) {
    const count = column.tasks.filter((task) => task.completedAt).length;
    if (count === 0) {
      setError("В этой колонке нет выполненных задач для архива");
      return;
    }
    if (!window.confirm(`Архивировать выполненные задачи из колонки «${column.title}»?`)) return;
    const previousBoard = boardRef.current;
    setError(null);
    applyBoard(
      previousBoard
        ? {
            ...previousBoard,
            columns: previousBoard.columns.map((item) =>
              item.id === column.id
                ? { ...item, tasks: item.tasks.filter((task) => !task.completedAt) }
                : item,
            ),
          }
        : previousBoard,
    );
    try {
      await readApi<{ archivedCount: number }>(
        await fetch(`/api/tasks/columns/${column.id}/archive`, { method: "POST" }),
      );
      if (boardRef.current) await loadBoard(boardRef.current.id);
      if (archiveOpen) await loadArchive();
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось архивировать задачи");
    }
  }

  async function restoreArchivedTask(taskId: string) {
    setError(null);
    try {
      await readApi(
        await fetch(`/api/tasks/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        }),
      );
      if (boardRef.current) await loadBoard(boardRef.current.id);
      await loadArchive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось вернуть задачу из архива");
    }
  }

  async function patchChecklistItem(taskId: string, itemId: string, body: ChecklistPatchBody) {
    const previousBoard = boardRef.current;
    const nextAssignee = body.assigneeUserId === undefined
      ? undefined
      : body.assigneeUserId
        ? meta?.users.find((user) => user.id === body.assigneeUserId) ?? null
        : null;
    updateBoard((current) => current ? {
      ...current,
      columns: current.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => {
          if (task.id !== taskId) return task;
          const checklistItems = task.checklistItems.map((item) => item.id === itemId ? {
            ...item,
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.isDone !== undefined ? { isDone: body.isDone } : {}),
            ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
            ...(body.reminderAt !== undefined ? { reminderAt: body.reminderAt } : {}),
            ...(body.priority !== undefined ? { priority: body.priority } : {}),
            ...(body.color !== undefined ? { color: body.color } : {}),
            ...(nextAssignee !== undefined ? { assignee: nextAssignee } : {}),
          } : item);
          return { ...task, checklistItems, checklistDone: checklistItems.filter((item) => item.isDone).length };
        }),
      })),
    } : current);
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

  function addTaskOptimistically(
    columnId: string,
    draft: TaskCreateDraft,
    request: Promise<{ task: BoardTask }>,
  ) {
    const previousBoard = boardRef.current;
    const column = previousBoard?.columns.find((item) => item.id === columnId);
    if (!previousBoard || !column) return;

    const tempId = `temp-task-${crypto.randomUUID()}`;
    const assignee = draft.assigneeUserId
      ? meta?.users.find((user) => user.id === draft.assigneeUserId) ?? null
      : null;
    const project = draft.projectId
      ? meta?.projects.find((item) => item.id === draft.projectId) ?? null
      : null;
    const orderMeta = draft.orderId
      ? meta?.orders.find((item) => item.id === draft.orderId) ?? null
      : null;
    const optimisticTask: BoardTask = {
      id: tempId,
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      color: draft.color,
      sortOrder: column.tasks.reduce((max, task) => Math.max(max, task.sortOrder), 0) + 1000,
      dueDate: draft.dueDate,
      reminderAt: draft.reminderAt,
      completedAt: column.isDone ? new Date().toISOString() : null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignee,
      project: project ? { id: project.id, title: project.title } : null,
      order: orderMeta ? { id: orderMeta.id, eventName: null, customer: { name: orderMeta.label } } : null,
      checklistItems: [],
      checklistDone: 0,
      checklistTotal: 0,
      commentCount: 0,
      lastActivityAt: null,
      lastActivityKind: "CREATED",
    };

    applyBoard({
      ...previousBoard,
      columns: previousBoard.columns.map((item) =>
        item.id === columnId ? { ...item, tasks: [...item.tasks, optimisticTask] } : item,
      ),
    });

    void request
      .then(({ task }) => {
        updateBoard((current) =>
          current
            ? {
                ...current,
                columns: current.columns.map((item) => ({
                  ...item,
                  tasks: item.tasks.map((currentTask) => (currentTask.id === tempId ? task : currentTask)),
                })),
              }
            : current,
        );
      })
      .catch((e) => {
        applyBoard(previousBoard);
        setError(e instanceof Error ? e.message : "Не удалось создать задачу");
      });
  }

  async function patchTaskInline(taskId: string, body: TaskPatchBody) {
    const previousBoard = boardRef.current;
    if (!previousBoard) return;
    const sourceTask = previousBoard.columns.flatMap((column) => column.tasks).find((task) => task.id === taskId);
    if (!sourceTask) return;
    const mutationId = mutationSequenceRef.current + 1;
    mutationSequenceRef.current = mutationId;
    latestMutationByTaskRef.current.set(taskId, mutationId);
    pendingMutationsRef.current += 1;
    const nextAssignee = body.assigneeUserId === undefined
      ? sourceTask.assignee
      : body.assigneeUserId
        ? meta?.users.find((user) => user.id === body.assigneeUserId) ?? null
        : null;
    const nextProject = body.projectId === undefined
      ? sourceTask.project
      : body.projectId
        ? meta?.projects.find((project) => project.id === body.projectId) ?? null
        : null;
    const nextOrderMeta = body.orderId === undefined
      ? null
      : body.orderId
        ? meta?.orders.find((order) => order.id === body.orderId) ?? null
        : null;
    const optimisticTask: BoardTask = {
      ...sourceTask,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
      ...(body.reminderAt !== undefined ? { reminderAt: body.reminderAt } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.completed !== undefined ? { completedAt: body.completed ? (sourceTask.completedAt ?? new Date().toISOString()) : null } : {}),
      ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date().toISOString() : null } : {}),
      ...(body.assigneeUserId !== undefined ? { assignee: nextAssignee } : {}),
      ...(body.projectId !== undefined
        ? { project: nextProject ? { id: nextProject.id, title: nextProject.title } : null }
        : {}),
      ...(body.orderId !== undefined
        ? { order: nextOrderMeta ? { id: nextOrderMeta.id, eventName: null, customer: { name: nextOrderMeta.label } } : null }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    const targetColumnId = body.columnId ?? previousBoard.columns.find((column) => column.tasks.some((task) => task.id === taskId))?.id;
    updateBoard((current) => current ? {
      ...current,
      columns: current.columns.map((column) => {
        const withoutTask = column.tasks.filter((task) => task.id !== taskId);
        if (body.archived || column.id !== targetColumnId) return { ...column, tasks: withoutTask };
        return { ...column, tasks: [...withoutTask, optimisticTask].sort((left, right) => left.sortOrder - right.sortOrder) };
      }),
    } : current);
    const sendMutation = async () => {
      try {
        const data = await readApi<{ task: BoardTask }>(
          await fetch(`/api/tasks/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (latestMutationByTaskRef.current.get(taskId) === mutationId) {
          if (!body.archived) {
            updateTaskInBoard(taskId, (currentTask) => ({ ...data.task, sortOrder: currentTask.sortOrder }));
          }
          latestMutationByTaskRef.current.delete(taskId);
        }
      } catch (e) {
        if (latestMutationByTaskRef.current.get(taskId) === mutationId) {
          latestMutationByTaskRef.current.delete(taskId);
          const originalColumnId = previousBoard.columns.find((column) => column.tasks.some((task) => task.id === taskId))?.id;
          updateBoard((current) => current ? {
            ...current,
            columns: current.columns.map((column) => {
              const withoutTask = column.tasks.filter((task) => task.id !== taskId);
              return column.id === originalColumnId
                ? { ...column, tasks: [...withoutTask, sourceTask].sort((left, right) => left.sortOrder - right.sortOrder) }
                : { ...column, tasks: withoutTask };
            }),
          } : current);
          setError(e instanceof Error ? e.message : "Не удалось обновить задачу");
        }
      } finally {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      }
    };
    const previousMutation = moveQueueByTaskRef.current.get(taskId) ?? Promise.resolve();
    const queuedMutation = previousMutation.catch(() => undefined).then(sendMutation);
    moveQueueByTaskRef.current.set(taskId, queuedMutation);
    await queuedMutation;
    if (moveQueueByTaskRef.current.get(taskId) === queuedMutation) moveQueueByTaskRef.current.delete(taskId);
  }

  async function addChecklistItemInline(taskId: string, title: string, parentId: string | null = null) {
    const previousBoard = boardRef.current;
    const tempId = `temp-checklist-${crypto.randomUUID()}`;
    setExpandedTaskIds((current) => new Set(current).add(taskId));

    updateTaskInBoard(taskId, (task) => {
      const nextSortOrder = task.checklistItems
        .filter((item) => item.parentId === parentId)
        .reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1000;
      const checklistItems = [
        ...task.checklistItems,
        {
          id: tempId,
          parentId,
          title,
          description: null,
          isDone: false,
          sortOrder: nextSortOrder,
          priority: "NORMAL" as const,
          color: null,
          dueDate: null,
          reminderAt: null,
          completedAt: null,
          updatedAt: new Date().toISOString(),
          assignee: null,
        },
      ];
      return {
        ...task,
        checklistItems,
        checklistTotal: checklistItems.length,
        checklistDone: checklistItems.filter((item) => item.isDone).length,
      };
    });

    pendingMutationsRef.current += 1;
    try {
      const data = await readApi<{ item: TaskChecklistItem }>(
        await fetch(`/api/tasks/tasks/${taskId}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, parentId }),
        }),
      );
      updateTaskInBoard(taskId, (task) => ({
        ...task,
        checklistItems: task.checklistItems.map((item) => item.id === tempId ? data.item : item),
      }));
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось добавить подзадачу");
    }
  }

  async function reorderTaskWithinColumn(taskId: string, targetTaskId: string, columnId: string, edge: TaskDropEdge) {
    const currentBoard = boardRef.current;
    if (!currentBoard || taskId === targetTaskId) return;
    const column = currentBoard.columns.find((item) => item.id === columnId);
    if (!column) return;
    const movingTask = column.tasks.find((task) => task.id === taskId);
    if (!movingTask) return;

    const previousBoard = currentBoard;
    const tasksWithoutMoving = column.tasks.filter((task) => task.id !== taskId);
    const targetIndex = tasksWithoutMoving.findIndex((task) => task.id === targetTaskId);
    if (targetIndex < 0) return;
    const insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
    const reorderedTasks = [
      ...tasksWithoutMoving.slice(0, insertIndex),
      movingTask,
      ...tasksWithoutMoving.slice(insertIndex),
    ];
    const unchanged = reorderedTasks.every((task, index) => task.id === column.tasks[index]?.id);
    if (unchanged) return;

    const movedIndex = reorderedTasks.findIndex((task) => task.id === taskId);
    const prevTask = reorderedTasks[movedIndex - 1] ?? null;
    const nextTask = reorderedTasks[movedIndex + 1] ?? null;
    const nextSortOrder =
      prevTask && nextTask
        ? Math.floor((prevTask.sortOrder + nextTask.sortOrder) / 2)
        : prevTask
          ? prevTask.sortOrder + 1000
          : nextTask
            ? nextTask.sortOrder - 1000
            : movingTask.sortOrder;

    const optimisticTasks = reorderedTasks.map((task) =>
      task.id === taskId ? { ...task, sortOrder: nextSortOrder } : task,
    );
    applyBoard({
      ...currentBoard,
      columns: currentBoard.columns.map((item) =>
        item.id === columnId ? { ...item, tasks: optimisticTasks } : item,
      ),
    });

    try {
      await readApi(
        await fetch(`/api/tasks/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: nextSortOrder }),
        }),
      );
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось изменить порядок задач");
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    }
  }

  async function reorderColumn(columnId: string, targetColumnId: string, edge: ColumnDropEdge) {
    const currentBoard = boardRef.current;
    if (!currentBoard || columnId === targetColumnId) return;

    const movingColumn = currentBoard.columns.find((column) => column.id === columnId);
    if (!movingColumn) return;

    const previousBoard = currentBoard;
    const columnsWithoutMoving = currentBoard.columns.filter((column) => column.id !== columnId);
    const targetIndex = columnsWithoutMoving.findIndex((column) => column.id === targetColumnId);
    if (targetIndex < 0) return;

    const insertIndex = edge === "before" ? targetIndex : targetIndex + 1;
    const reorderedColumns = [
      ...columnsWithoutMoving.slice(0, insertIndex),
      movingColumn,
      ...columnsWithoutMoving.slice(insertIndex),
    ];
    const unchanged = reorderedColumns.every((column, index) => column.id === currentBoard.columns[index]?.id);
    if (unchanged) return;

    const movedIndex = reorderedColumns.findIndex((column) => column.id === columnId);
    const prevColumn = reorderedColumns[movedIndex - 1] ?? null;
    const nextColumn = reorderedColumns[movedIndex + 1] ?? null;
    const nextSortOrder =
      prevColumn && nextColumn
        ? Math.floor((prevColumn.sortOrder + nextColumn.sortOrder) / 2)
        : prevColumn
          ? prevColumn.sortOrder + 1000
          : nextColumn
            ? nextColumn.sortOrder - 1000
            : movingColumn.sortOrder;

    applyBoard({
      ...currentBoard,
      columns: reorderedColumns.map((column) =>
        column.id === columnId ? { ...column, sortOrder: nextSortOrder } : column,
      ),
    });

    pendingMutationsRef.current += 1;
    try {
      await readApi(
        await fetch(`/api/tasks/columns/${columnId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: nextSortOrder }),
        }),
      );
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось изменить порядок колонок");
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    }
  }

  async function moveTaskToColumn(
    taskId: string,
    targetColumnId: string,
    targetTaskId?: string,
    edge: TaskDropEdge = "after",
  ) {
    const currentBoard = boardRef.current;
    if (!currentBoard) return;
    const nextColumn = currentBoard.columns.find((column) => column.id === targetColumnId);
    if (!nextColumn) return;
    const sourceColumn = currentBoard.columns.find((column) => column.tasks.some((task) => task.id === taskId));
    if (!sourceColumn || sourceColumn.id === targetColumnId) return;
    const movingTask = sourceColumn.tasks.find((task) => task.id === taskId);
    if (!movingTask) return;
    const targetTasks = nextColumn.tasks.filter((task) => task.id !== taskId);
    const rawIndex = targetTaskId ? targetTasks.findIndex((task) => task.id === targetTaskId) : -1;
    const insertIndex = rawIndex < 0 ? targetTasks.length : edge === "before" ? rawIndex : rawIndex + 1;
    const previousTask = targetTasks[insertIndex - 1] ?? null;
    const followingTask = targetTasks[insertIndex] ?? null;
    const sortOrder = previousTask && followingTask
      ? Math.floor((previousTask.sortOrder + followingTask.sortOrder) / 2)
      : previousTask
        ? previousTask.sortOrder + 1000
        : followingTask
          ? followingTask.sortOrder - 1000
          : 1000;
    await patchTaskInline(taskId, {
      columnId: nextColumn.id,
      completed: nextColumn.isDone,
      sortOrder,
    });
  }

  async function duplicateTask(taskId: string) {
    const currentBoard = boardRef.current;
    if (!currentBoard) return;
    pendingMutationsRef.current += 1;
    setError(null);
    try {
      const data = await readApi<{ task: BoardTask }>(
        await fetch(`/api/tasks/tasks/${taskId}/duplicate`, { method: "POST" }),
      );
      const sourceColumn = currentBoard.columns.find((column) => column.tasks.some((task) => task.id === taskId));
      if (!sourceColumn) return;
      updateBoard((boardState) => boardState ? {
        ...boardState,
        columns: boardState.columns.map((column) => column.id === sourceColumn.id
          ? { ...column, tasks: [...column.tasks, data.task].sort((left, right) => left.sortOrder - right.sortOrder) }
          : column),
      } : boardState);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось дублировать задачу");
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    }
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm("Удалить задачу вместе с подзадачами и историей?")) return;
    const previousBoard = boardRef.current;
    if (!previousBoard) return;
    applyBoard({
      ...previousBoard,
      columns: previousBoard.columns.map((column) => ({
        ...column,
        tasks: column.tasks.filter((task) => task.id !== taskId),
      })),
    });
    pendingMutationsRef.current += 1;
    try {
      await readApi(await fetch(`/api/tasks/tasks/${taskId}`, { method: "DELETE" }));
      if (activityDrawer?.taskId === taskId) setActivityDrawer(null);
    } catch (cause) {
      applyBoard(previousBoard);
      setError(cause instanceof Error ? cause.message : "Не удалось удалить задачу");
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    }
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
        "task-board-shell",
        `theme-${boardTheme}`,
        viewParams.embedded ? "is-embedded" : "",
      ].join(" ")}
    >
      <div className="task-board-toolbar">
        <div className="task-board-toolbar__identity">
          {viewParams.projectId ? (
            <span className="task-board-toolbar__scope">
              Проектные задачи
            </span>
          ) : null}
          {boards.length > 1 ? (
            <select
              value={boardId}
              onChange={(event) => setBoardId(event.target.value)}
              className="task-board-toolbar__select"
            >
              {boards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <h1>{board?.title ?? boards[0]?.title ?? "Рабочая доска"}</h1>
              <span>{board?.columns.reduce((total, column) => total + column.tasks.length, 0) ?? 0} задач</span>
            </div>
          )}
        </div>
        <div className="task-board-toolbar__actions">
          <button
            type="button"
            onClick={toggleBoardTheme}
            className="task-board-button task-board-button--quiet task-board-theme-toggle"
            aria-pressed={boardTheme === "dark"}
            title={boardTheme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}
          >
            <span aria-hidden>{boardTheme === "light" ? "☾" : "☀"}</span>
            {boardTheme === "light" ? "Тёмная" : "Светлая"}
          </button>
          <button
            type="button"
            onClick={() => {
              setArchiveOpen(true);
              void loadArchive();
            }}
            className="task-board-button task-board-button--quiet"
          >
            <span aria-hidden>⌑</span> Архив
          </button>
          <button
            type="button"
            onClick={() => void addColumn()}
            disabled={viewParams.readOnly}
            className="task-board-button task-board-button--primary"
          >
            <span aria-hidden>＋</span> Колонка
          </button>
        </div>
      </div>

      {loading ? <BoardSkeleton /> : null}
      {error ? <div className="mx-1 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</div> : null}

      {!loading && board ? (
        <div className="task-board-viewport">
        <div className={`task-board-columns${viewParams.embedded ? " is-embedded" : ""}`}>
          {board.columns.map((column, columnIndex) => (
            <section
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const movedColumnId = event.dataTransfer.types.includes("application/x-wowstorg-column-id")
                  ? event.dataTransfer.getData("application/x-wowstorg-column-id") || draggingColumnId
                  : draggingColumnId;
                if (movedColumnId) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const edge: ColumnDropEdge = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDragOverColumn(movedColumnId === column.id ? null : { columnId: column.id, edge });
                  setDragOverColumnId(null);
                  return;
                }
                setDragOverColumnId(column.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const movedColumnId = event.dataTransfer.getData("application/x-wowstorg-column-id") || draggingColumnId;
                if (movedColumnId) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const edge: ColumnDropEdge = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
                  setDraggingColumnId(null);
                  setDragOverColumn(null);
                  if (!viewParams.readOnly) void reorderColumn(movedColumnId, column.id, edge);
                  return;
                }
                const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
                setDragOverColumnId(null);
                setDragOverTask(null);
                if (!viewParams.readOnly && taskId && column.id !== draggingFromColumnId) void moveTaskToColumn(taskId, column.id);
              }}
              className={[
                "task-column",
                dragOverColumnId === column.id ? "is-task-target" : "",
                draggingColumnId === column.id ? "is-dragging" : "",
              ].join(" ")}
              style={{ "--task-column-accent": column.color ?? "#94a3b8" } as React.CSSProperties}
            >
              {dragOverColumn?.columnId === column.id ? (
                <div
                  className={[
                    "task-column-drop-edge",
                    dragOverColumn.edge === "before" ? "is-before" : "is-after",
                  ].join(" ")}
                />
              ) : null}
              <div
                draggable={!viewParams.readOnly}
                onDragStart={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("input,button,select,textarea,a")) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-wowstorg-column-id", column.id);
                  event.dataTransfer.setData("text/plain", "");
                  setDraggingColumnId(column.id);
                  setDragOverTask(null);
                  setDragOverColumnId(null);
                }}
                onDragEnd={() => {
                  setDraggingColumnId(null);
                  setDragOverColumn(null);
                }}
                className="task-column__header"
              >
                <div className="task-column__title-row">
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
                    draggable={false}
                    className="task-column__title"
                  />
                  <span className="task-column__count">{column.tasks.length}</span>
                  <button
                    type="button"
                    onClick={() => void patchColumn(column.id, { isDone: !column.isDone })}
                    disabled={viewParams.readOnly}
                    draggable={false}
                    className={`task-column__done${column.isDone ? " is-active" : ""}`}
                    title="Колонка завершения"
                  >
                    {column.isDone ? "✓" : "○"}
                  </button>
                </div>
                <div className="task-column__actions">
                  <button
                    type="button"
                    onClick={() => setEditor({ task: null, columnId: column.id })}
                    disabled={viewParams.readOnly}
                    draggable={false}
                    className="task-column__add"
                  >
                    + Добавить задачу
                  </button>
                  {column.isDone && column.tasks.some((task) => task.completedAt) ? (
                    <button
                      type="button"
                      onClick={() => void archiveCompletedTasks(column)}
                      disabled={viewParams.readOnly}
                      draggable={false}
                      className="task-column__archive"
                      title="Убрать выполненные задачи из доски в архив"
                    >
                      Архивировать
                    </button>
                  ) : null}
                  {column.tasks.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => void deleteColumn(column.id)}
                      draggable={false}
                    className="task-column__delete"
                    >
                      удалить
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="task-column__cards">
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    column={column}
                    users={meta?.users ?? []}
                    columns={board.columns}
                    onOpen={(nextTask) => setEditor({ task: nextTask, columnId: column.id })}
                    onOpenActivity={(taskId) => setActivityDrawer({ taskId, tab: "activity" })}
                    onOpenSubtasks={(taskId) => setActivityDrawer({ taskId, tab: "subtasks" })}
                    onDuplicate={(taskId) => void duplicateTask(taskId)}
                    onDelete={(taskId) => void deleteTask(taskId)}
                    onPatchTask={(taskId, body) => void patchTaskInline(taskId, body)}
                    onAddChecklistItem={(taskId, title, parentId) => void addChecklistItemInline(taskId, title, parentId)}
                    expanded={expandedTaskIds.has(task.id)}
                    onToggleExpanded={toggleTaskExpanded}
                    onPatchChecklistItem={(itemId, body) => void patchChecklistItem(task.id, itemId, body)}
                    onDragStart={(taskId, fromColumnId, cardHeight) => {
                      setDraggingTaskId(taskId);
                      setDraggingFromColumnId(fromColumnId);
                      setDragPreviewHeight(cardHeight);
                      setDraggingColumnId(null);
                      setDragOverColumn(null);
                    }}
                    onDragEnd={() => {
                      setDraggingTaskId(null);
                      setDraggingFromColumnId(null);
                      setDragOverColumnId(null);
                      setDragOverTask(null);
                      setDragOverColumn(null);
                    }}
                    onDragOverTask={(taskId, columnId, edge) => {
                      if (viewParams.readOnly || !draggingTaskId || draggingTaskId === taskId) {
                        setDragOverTask(null);
                        return;
                      }
                      setDragOverColumnId(null);
                      setDragOverTask((current) =>
                        current?.taskId === taskId && current.columnId === columnId && current.edge === edge
                          ? current
                          : { taskId, columnId, edge },
                      );
                    }}
                    onDropOnTask={(taskId, targetTaskId, targetColumnId, edge) => {
                      setDragOverTask(null);
                      setDragOverColumnId(null);
                      if (viewParams.readOnly) return;
                      if (targetColumnId === draggingFromColumnId) {
                        void reorderTaskWithinColumn(taskId, targetTaskId, targetColumnId, edge);
                      } else {
                        void moveTaskToColumn(taskId, targetColumnId, targetTaskId, edge);
                      }
                    }}
                    dropEdge={
                      dragOverTask?.taskId === task.id && dragOverTask.columnId === column.id
                        ? dragOverTask.edge
                        : null
                    }
                    isDragging={draggingTaskId === task.id}
                    dragPreviewHeight={dragPreviewHeight}
                  />
                ))}
                {dragOverColumnId === column.id && draggingTaskId && column.id !== draggingFromColumnId ? (
                  <div className="task-drop-placeholder" style={{ height: dragPreviewHeight }} />
                ) : null}
                {column.tasks.length === 0 ? (
                  <div className="task-column__empty">
                    {columnIndex === 0 ? "Добавьте первую задачу" : "Пусто"}
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
        </div>
      ) : null}

      {archiveOpen && archivePortalHost ? createPortal(
        <div className="fixed inset-0 z-[950] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/35 backdrop-blur-[2px]"
            onClick={() => setArchiveOpen(false)}
            aria-label="Закрыть архив"
          />
          <section className="relative flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-[linear-gradient(180deg,#ffffff,#f8f7ff)] shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-violet-100 px-5 py-4">
              <div>
                <div className="text-lg font-black text-zinc-950">Архив задач</div>
                <div className="text-sm font-semibold text-zinc-500">Сюда попадают задачи, убранные из завершённых колонок.</div>
              </div>
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                Закрыть
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {archiveLoading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm font-semibold text-zinc-500">
                  Загружаю архив...
                </div>
              ) : archiveTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-6 text-sm font-semibold text-violet-700">
                  Архив пока пуст.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {archiveTasks.map((task) => (
                    <ArchivedTaskCard
                      key={task.id}
                      task={task}
                      onRestore={(taskId) => void restoreArchivedTask(taskId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>,
        archivePortalHost,
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
          onCreatedOptimistic={addTaskOptimistically}
          onDeleted={() => void refresh()}
        />
      ) : null}
      {activityDrawer ? (
        <TaskActivityDrawer
          key={`${activityDrawer.taskId}:${activityDrawer.tab}`}
          taskId={activityDrawer.taskId}
          users={meta?.users ?? []}
          columns={(board?.columns ?? []).map((column) => ({
            id: column.id,
            title: column.title,
            isDone: column.isDone,
          }))}
          initialTab={activityDrawer.tab}
          onClose={() => setActivityDrawer(null)}
          onChanged={() => {
            if (boardRef.current) void loadBoard(boardRef.current.id);
          }}
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
