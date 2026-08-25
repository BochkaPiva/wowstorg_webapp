"use client";

import React from "react";
import { createPortal } from "react-dom";

import { AppShell } from "@/app/_ui/AppShell";
import { BoardSkeleton } from "@/app/_ui/Skeleton";
import { useAuth } from "@/app/providers";
import { TaskActivityDrawer } from "@/app/tasks/TaskActivityDrawer";

import "./task-board.css";

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type TaskPerson = { id: string; displayName: string };

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
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  reminderAt: string | null;
  reminderText: string | null;
  priorityStickerEnabled: boolean;
  priorityStickerConfigured: boolean;
  deadlineStickerEnabled: boolean;
  reminderStickerEnabled: boolean;
  assigneeStickerEnabled: boolean;
  completedAt: string | null;
  updatedAt: string;
  assignee: TaskPerson | null;
  assignees: TaskPerson[];
};

type ChecklistPatchBody = Partial<{
  title: string;
  isDone: boolean;
  assigneeUserId: string | null;
  assigneeUserIds: string[];
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  reminderAt: string | null;
  reminderText: string | null;
  priority: Priority;
  priorityStickerEnabled: boolean;
  priorityStickerConfigured: boolean;
  deadlineStickerEnabled: boolean;
  reminderStickerEnabled: boolean;
  assigneeStickerEnabled: boolean;
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
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  reminderAt: string | null;
  reminderText: string | null;
  priorityStickerEnabled: boolean;
  priorityStickerConfigured: boolean;
  deadlineStickerEnabled: boolean;
  reminderStickerEnabled: boolean;
  assigneeStickerEnabled: boolean;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: TaskPerson | null;
  assignees: TaskPerson[];
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
  assigneeUserIds: string[];
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  reminderAt: string | null;
  reminderText: string | null;
  priority: Priority;
  priorityStickerEnabled: boolean;
  priorityStickerConfigured: boolean;
  deadlineStickerEnabled: boolean;
  reminderStickerEnabled: boolean;
  assigneeStickerEnabled: boolean;
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
  assigneeUserIds: string[];
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
type StickerMode = "priority" | "deadline" | "reminder" | "assignee";

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Не важно",
  NORMAL: "Нормально",
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

function targetAssignees(target: { assignee: TaskPerson | null; assignees: TaskPerson[] }): TaskPerson[] {
  return target.assignees.length > 0 ? target.assignees : target.assignee ? [target.assignee] : [];
}

function AssigneeAvatarStack({ people }: { people: TaskPerson[] }) {
  const visible = people.slice(0, 3);
  return (
    <span className="task-assignee-stack" aria-hidden>
      {visible.map((person, index) => (
        <span key={person.id} className="task-assignee-stack__avatar" style={{ zIndex: visible.length - index }}>
          {initials(person.displayName)}
        </span>
      ))}
      {people.length > visible.length ? <span className="task-assignee-stack__more">+{people.length - visible.length}</span> : null}
    </span>
  );
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

function dateTimeInOmsk(value: string | null): { date: string; time: string } {
  if (!value) return { date: "", time: "13:00" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Omsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function omskDateTimeToIso(date: string, time = "13:00"): string | null {
  return date ? new Date(`${date}T${time}:00+06:00`).toISOString() : null;
}

function todayDateOnly(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Omsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function CalendarStickerIcon() {
  return <svg aria-hidden viewBox="0 0 20 20"><path d="M5.5 2.8v2.3M14.5 2.8v2.3M3.1 7.2h13.8M4.7 4.2h10.6c.9 0 1.6.7 1.6 1.6v9c0 .9-.7 1.6-1.6 1.6H4.7c-.9 0-1.6-.7-1.6-1.6v-9c0-.9.7-1.6 1.6-1.6Z" /></svg>;
}

function PriorityStickerIcon() {
  return <svg aria-hidden viewBox="0 0 20 20"><path d="M4.2 15.8V10M10 15.8V6.8M15.8 15.8V3.8" /></svg>;
}

function ReminderStickerIcon() {
  return <svg aria-hidden viewBox="0 0 20 20"><path d="M6.2 8.3a3.8 3.8 0 0 1 7.6 0c0 4.3 1.8 4.5 1.8 4.5H4.4s1.8-.2 1.8-4.5ZM8.3 15.1a1.9 1.9 0 0 0 3.4 0" /></svg>;
}

function AssigneeStickerIcon() {
  return <svg aria-hidden viewBox="0 0 20 20"><path d="M10 10.1a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6ZM4.3 16.5c.5-2.7 2.4-4.2 5.7-4.2s5.2 1.5 5.7 4.2" /></svg>;
}

function SubtaskStickerIcon() {
  return <svg aria-hidden viewBox="0 0 20 20"><path d="M4 4v7.2c0 1.7 1.3 3 3 3h2.2M4 7.5h5.2M9.2 14.2h6.8M12.7 10.9l3.3 3.3-3.3 3.3" /></svg>;
}

function DeleteSubtaskIcon() {
  return <svg aria-hidden viewBox="0 0 20 20"><path d="M4.5 5.7h11M8 3.5h4M6.2 5.7l.7 10.1h6.2l.7-10.1M8.4 8.4v4.8M11.6 8.4v4.8" /></svg>;
}

type StickerTarget = Pick<
  TaskChecklistItem,
  | "priority"
  | "startDate"
  | "dueDate"
  | "dueTime"
  | "reminderAt"
  | "reminderText"
  | "assignee"
  | "assignees"
  | "priorityStickerEnabled"
  | "priorityStickerConfigured"
  | "deadlineStickerEnabled"
  | "reminderStickerEnabled"
  | "assigneeStickerEnabled"
>;

function MonthCalendar({ value, onChange }: { value: string | null; onChange: (value: string) => void }) {
  const initial = value || todayDateOnly();
  const [visibleMonth, setVisibleMonth] = React.useState(() => initial.slice(0, 7));
  const [year, month] = visibleMonth.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - offset + 1));
    return {
      value: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      outside: date.getUTCMonth() !== month - 1,
    };
  });
  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const moveMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setVisibleMonth(next.toISOString().slice(0, 7));
  };

  return (
    <div className="sticker-calendar">
      <div className="sticker-calendar__nav">
        <button type="button" aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}>‹</button>
        <strong>{monthLabel}</strong>
        <button type="button" aria-label="Следующий месяц" onClick={() => moveMonth(1)}>›</button>
      </div>
      <div className="sticker-calendar__weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="sticker-calendar__grid">
        {cells.map((cell) => (
          <button
            key={cell.value}
            type="button"
            className={`${cell.outside ? "is-outside " : ""}${cell.value === value ? "is-selected " : ""}${cell.value === todayDateOnly() ? "is-today" : ""}`}
            onClick={() => { onChange(cell.value); setVisibleMonth(cell.value.slice(0, 7)); }}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  );
}

function StickerToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`sticker-toggle${checked ? " is-checked" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function StickerTimeInput({ value, onChange, label = "Время" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [hours, setHours] = React.useState(value.slice(0, 2) || "13");
  const [minutes, setMinutes] = React.useState(value.slice(3, 5) || "00");

  React.useEffect(() => {
    setHours(value.slice(0, 2) || "13");
    setMinutes(value.slice(3, 5) || "00");
  }, [value]);

  function commit(nextHours = hours, nextMinutes = minutes) {
    const normalizedHours = String(Math.min(23, Math.max(0, Number(nextHours) || 0))).padStart(2, "0");
    const normalizedMinutes = String(Math.min(59, Math.max(0, Number(nextMinutes) || 0))).padStart(2, "0");
    setHours(normalizedHours);
    setMinutes(normalizedMinutes);
    onChange(`${normalizedHours}:${normalizedMinutes}`);
  }

  return (
    <div className="sticker-time" aria-label={label}>
      <input
        aria-label="Часы"
        inputMode="numeric"
        maxLength={2}
        value={hours}
        onChange={(event) => setHours(event.target.value.replace(/\D/gu, "").slice(0, 2))}
        onBlur={() => commit()}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
      />
      <span aria-hidden>:</span>
      <input
        aria-label="Минуты"
        inputMode="numeric"
        maxLength={2}
        value={minutes}
        onChange={(event) => setMinutes(event.target.value.replace(/\D/gu, "").slice(0, 2))}
        onBlur={() => commit()}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
      />
    </div>
  );
}

function StickerQuickEditor({
  target,
  initialMode,
  users,
  anchor,
  onClose,
  onPatch,
}: {
  target: StickerTarget;
  initialMode: "all" | StickerMode;
  users: TasksMeta["users"];
  anchor: HTMLElement | null;
  onClose: () => void;
  onPatch: (body: ChecklistPatchBody) => void;
}) {
  const [mode, setMode] = React.useState<"all" | StickerMode>(initialMode);
  const [userSearch, setUserSearch] = React.useState("");
  const [deadlineField, setDeadlineField] = React.useState<"start" | "due">("due");
  const reminderParts = React.useMemo(() => dateTimeInOmsk(target.reminderAt), [target.reminderAt]);
  const [reminderDate, setReminderDate] = React.useState(reminderParts.date);
  const [reminderTime, setReminderTime] = React.useState(reminderParts.time);
  const [reminderHasTime, setReminderHasTime] = React.useState(Boolean(target.reminderAt));
  const [reminderText, setReminderText] = React.useState(target.reminderText ?? "");
  const selectedAssignees = targetAssignees(target);
  const selectedAssigneeIds = new Set(selectedAssignees.map((assignee) => assignee.id));

  function attach(nextMode: StickerMode) {
    const flag = `${nextMode === "deadline" ? "deadline" : nextMode}StickerEnabled` as
      | "priorityStickerEnabled"
      | "deadlineStickerEnabled"
      | "reminderStickerEnabled"
      | "assigneeStickerEnabled";
    onPatch({ [flag]: true });
    setMode(nextMode);
  }

  function detach(flag: keyof Pick<ChecklistPatchBody, "priorityStickerEnabled" | "deadlineStickerEnabled" | "reminderStickerEnabled" | "assigneeStickerEnabled">) {
    onPatch({ [flag]: false });
    onClose();
  }

  return (
    <AnchoredPopover anchor={anchor} onClose={onClose}>
      {mode === "all" ? (
        <div className="sticker-chooser">
          <div className="task-popover__title">Добавить стикер</div>
          <button type="button" onClick={() => attach("assignee")}><AssigneeStickerIcon /><span>Исполнитель</span></button>
          <button type="button" onClick={() => attach("deadline")}><CalendarStickerIcon /><span>Дедлайн</span></button>
          <button type="button" onClick={() => attach("priority")}><PriorityStickerIcon /><span>Приоритет</span></button>
          <button type="button" onClick={() => attach("reminder")}><ReminderStickerIcon /><span>Напоминание</span></button>
        </div>
      ) : null}
      {mode === "priority" ? (
        <div className="sticker-editor">
          <div className="sticker-editor__header"><strong>Стикер «Приоритет»</strong><button type="button" onClick={() => detach("priorityStickerEnabled")}>открепить</button></div>
          <div className="sticker-editor__options">
            {([
              ["URGENT", "Срочно", "urgent"],
              ["HIGH", "Важно", "high"],
              ["NORMAL", "Нормально", "normal"],
              ["LOW", "Не важно", "low"],
            ] as const).map(([value, label, tone]) => (
              <button key={value} type="button" className={`sticker-editor__option is-${tone}${target.priorityStickerConfigured && target.priority === value ? " is-selected" : ""}`} onClick={() => onPatch({ priority: value, priorityStickerEnabled: true, priorityStickerConfigured: true })}>
                <span className="sticker-editor__preview"><PriorityStickerIcon />{label}</span>
                {target.priorityStickerConfigured && target.priority === value ? <span aria-hidden>✓</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {mode === "deadline" ? (
        <div className="sticker-editor">
          <div className="sticker-editor__header"><strong>Стикер «Дедлайн»</strong><button type="button" onClick={() => detach("deadlineStickerEnabled")}>открепить</button></div>
          <div className="sticker-date-tabs">
            {target.startDate ? <button type="button" className={deadlineField === "start" ? "is-active" : ""} onClick={() => setDeadlineField("start")}><span>Начало</span><strong>{fmtDate(target.startDate)}</strong></button> : null}
            <button type="button" className={deadlineField === "due" ? "is-active" : ""} onClick={() => setDeadlineField("due")}><span>Дедлайн</span><strong>{target.dueDate ? fmtDate(target.dueDate) : "Выберите дату"}</strong></button>
            {target.dueTime ? <div className="sticker-time-input"><span>Время</span><StickerTimeInput value={target.dueTime} onChange={(value) => onPatch({ dueTime: value })} /></div> : null}
          </div>
          <MonthCalendar value={deadlineField === "start" ? target.startDate : target.dueDate} onChange={(value) => onPatch(deadlineField === "start" ? { startDate: value, deadlineStickerEnabled: true } : { dueDate: value, deadlineStickerEnabled: true })} />
          <div className="sticker-switches">
            <div><span>Добавить время</span><StickerToggle label="Добавить время" checked={Boolean(target.dueTime)} onChange={(checked) => onPatch({ dueTime: checked ? "13:00" : null })} /></div>
            <div><span>Добавить дату начала</span><StickerToggle label="Добавить дату начала" checked={Boolean(target.startDate)} onChange={(checked) => { onPatch({ startDate: checked ? (target.dueDate ?? todayDateOnly()) : null }); if (checked) setDeadlineField("start"); }} /></div>
            <button type="button" onClick={() => attach("reminder")}><span>Добавить напоминание</span><ReminderStickerIcon /></button>
          </div>
        </div>
      ) : null}
      {mode === "reminder" ? (
        <div className="sticker-editor">
          <div className="sticker-editor__header"><strong>Стикер «Напоминание»</strong><button type="button" onClick={() => detach("reminderStickerEnabled")}>открепить</button></div>
          <div className="sticker-reminder-fields">
            <div><span>Дата</span><strong>{reminderDate ? fmtDate(reminderDate) : "Выберите"}</strong></div>
            {reminderHasTime ? <div><span>Время</span><StickerTimeInput value={reminderTime} onChange={setReminderTime} /></div> : null}
          </div>
          <MonthCalendar value={reminderDate || null} onChange={setReminderDate} />
          <div className="sticker-switch sticker-switch--single"><span>Указать точное время</span><StickerToggle label="Указать точное время" checked={reminderHasTime} onChange={setReminderHasTime} /></div>
          <textarea className="sticker-reminder-text" value={reminderText} onChange={(event) => setReminderText(event.target.value)} placeholder="Текст напоминания" />
          <button className="sticker-editor__save" type="button" disabled={!reminderDate} onClick={() => { onPatch({ reminderAt: omskDateTimeToIso(reminderDate, reminderHasTime ? reminderTime : "13:00"), reminderText: reminderText || null, reminderStickerEnabled: true }); onClose(); }}>Сохранить напоминание</button>
        </div>
      ) : null}
      {mode === "assignee" ? (
        <div className="sticker-editor">
          <div className="sticker-editor__header"><strong>Стикер «Исполнители»</strong><button type="button" onClick={() => detach("assigneeStickerEnabled")}>открепить</button></div>
          <div className="sticker-editor__search"><input autoFocus value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Поиск по имени" /></div>
          <div className="sticker-editor__hint">Можно выбрать нескольких · выбрано {selectedAssignees.length}</div>
          <div className="sticker-editor__people">
            {users.filter((user) => user.displayName.toLocaleLowerCase("ru").includes(userSearch.toLocaleLowerCase("ru"))).map((user) => {
              const selected = selectedAssigneeIds.has(user.id);
              return <button key={user.id} type="button" className={selected ? "is-selected" : ""} onClick={() => onPatch({ assigneeUserIds: selected ? selectedAssignees.filter((assignee) => assignee.id !== user.id).map((assignee) => assignee.id) : [...selectedAssignees.map((assignee) => assignee.id), user.id], assigneeStickerEnabled: true })}><span className="task-avatar">{initials(user.displayName)}</span><span>{user.displayName}</span>{selected ? <b aria-hidden>✓</b> : null}</button>;
            })}
          </div>
        </div>
      ) : null}
    </AnchoredPopover>
  );
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
  const [position, setPosition] = React.useState({ top: 0, left: 0, maxHeight: 480, placement: "below" as "above" | "below" });

  React.useLayoutEffect(() => {
    setHost(getModalPortalHost());
  }, []);

  const updatePosition = React.useCallback(() => {
    if (!anchor || !host) return;
    const rect = anchor.getBoundingClientRect();
    const embeddedInParent = host.ownerDocument !== document;
    const frameRect = embeddedInParent && window.frameElement instanceof HTMLElement
      ? window.frameElement.getBoundingClientRect()
      : null;
    const offsetLeft = frameRect?.left ?? 0;
    const offsetTop = frameRect?.top ?? 0;
    const viewport = host.ownerDocument.defaultView ?? window;
    const anchorTop = rect.top + offsetTop;
    const anchorBottom = rect.bottom + offsetTop;
    if (anchorBottom < 0 || anchorTop > viewport.innerHeight) {
      onClose();
      return;
    }

    const gap = 7;
    const inset = 10;
    const menuWidth = menuRef.current?.offsetWidth ?? 320;
    const measuredHeight = menuRef.current?.scrollHeight ?? 280;
    const maxHeight = Math.max(180, viewport.innerHeight - inset * 2);
    const menuHeight = Math.min(measuredHeight, maxHeight);
    const spaceBelow = viewport.innerHeight - anchorBottom - gap - inset;
    const spaceAbove = anchorTop - gap - inset;
    const placement = spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? "below" : "above";
    const desiredTop = placement === "below" ? anchorBottom + gap : anchorTop - menuHeight - gap;
    const top = Math.max(inset, Math.min(desiredTop, viewport.innerHeight - menuHeight - inset));
    const left = Math.max(inset, Math.min(rect.left + offsetLeft, viewport.innerWidth - menuWidth - inset));
    setPosition({ top, left, maxHeight, placement });
  }, [anchor, host, onClose]);

  React.useLayoutEffect(() => {
    if (!anchor || !host) return;
    let frame = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleUpdate);
    observer?.observe(anchor);
    if (menuRef.current) observer?.observe(menuRef.current);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    if (ownerWindow !== window) {
      ownerWindow.addEventListener("scroll", scheduleUpdate, true);
      ownerWindow.addEventListener("resize", scheduleUpdate);
    }
    scheduleUpdate();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
      if (ownerWindow !== window) {
        ownerWindow.removeEventListener("scroll", scheduleUpdate, true);
        ownerWindow.removeEventListener("resize", scheduleUpdate);
      }
    };
  }, [anchor, host, updatePosition]);

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
    <div
      ref={menuRef}
      className={`task-popover is-${position.placement}`}
      style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
      onMouseDown={(event) => event.stopPropagation()}
    >
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
  return <StickerQuickEditor target={task} initialMode="all" users={users} anchor={anchor} onClose={onClose} onPatch={onPatch} />;
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
  const checkedRef = React.useRef(checked);
  React.useEffect(() => {
    checkedRef.current = checked;
  }, [checked]);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        const nextChecked = !checkedRef.current;
        checkedRef.current = nextChecked;
        onChange(nextChecked);
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
  return <StickerQuickEditor target={item} initialMode="all" users={users} anchor={anchor} onClose={onClose} onPatch={onPatch} />;
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
  onDelete,
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
  onDelete: (itemId: string, hasChildren: boolean) => void;
  onEdit: (itemId: string) => void;
  onStartAdding: (parentId: string | null) => void;
  onSubmitNewItem: () => void;
  onCancelAdding: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuMode, setMenuMode] = React.useState<"all" | StickerMode | null>(null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(node.title);
  const hasPriority = node.priorityStickerEnabled || node.priority !== "NORMAL";

  React.useEffect(() => {
    if (!editingTitle) setTitleDraft(node.title);
  }, [editingTitle, node.title]);

  function finishTitleEdit() {
    const nextTitle = titleDraft.trim();
    setEditingTitle(false);
    if (!nextTitle) {
      setTitleDraft(node.title);
      return;
    }
    if (nextTitle !== node.title) onPatch(node.id, { title: nextTitle });
  }

  function openSticker(event: React.MouseEvent<HTMLElement>, mode: "all" | StickerMode) {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuMode(mode);
  }

  return (
    <div className="task-checklist-node" style={{ "--task-tree-depth": depth } as React.CSSProperties}>
      <div
        className="task-checklist-row"
        style={node.color ? { backgroundColor: node.color } : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (!(event.target as HTMLElement).closest("button,input,select,a")) onEdit(node.id);
        }}
      >
        <div className="task-checklist-row__main">
          <RoundCheckbox size="sm" checked={node.isDone} onChange={(checked) => onPatch(node.id, { isDone: checked })} />
          {editingTitle ? (
            <input
              autoFocus
              className="task-checklist-row__title-input"
              value={titleDraft}
              aria-label="Название подзадачи"
              onChange={(event) => setTitleDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onBlur={finishTitleEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setTitleDraft(node.title);
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="task-checklist-row__title-button"
              title="Нажмите, чтобы переименовать"
              onClick={(event) => {
                event.stopPropagation();
                setTitleDraft(node.title);
                setEditingTitle(true);
              }}
            >
              <span className={`task-checklist-row__title${node.isDone ? " is-done" : ""}`}>{node.title}</span>
              <span aria-hidden className="task-checklist-row__edit-icon">✎</span>
            </button>
          )}
          <button type="button" className="task-checklist-row__menu" aria-label="Настроить подзадачу" onClick={(event) => { event.stopPropagation(); onEdit(node.id); }}>⋮</button>
        </div>
        <div className="task-checklist-row__stickers">
          <div className="task-checklist-row__sticker-list">
            {hasPriority ? <button type="button" className={`task-subtask-sticker is-priority is-${node.priority.toLowerCase()}${node.priorityStickerConfigured || node.priority !== "NORMAL" ? "" : " is-unconfigured"}`} onClick={(event) => openSticker(event, "priority")}><PriorityStickerIcon />{node.priorityStickerConfigured || node.priority !== "NORMAL" ? PRIORITY_LABEL[node.priority] : "Приоритет"}</button> : null}
            {node.deadlineStickerEnabled || node.dueDate ? <button type="button" className="task-subtask-sticker" onClick={(event) => openSticker(event, "deadline")}><CalendarStickerIcon />{node.dueDate ? `${fmtDate(node.dueDate)}${node.dueTime ? ` · ${node.dueTime}` : ""}` : "Дедлайн"}</button> : null}
            {node.reminderStickerEnabled || node.reminderAt ? <button type="button" className="task-subtask-sticker" title="Изменить напоминание" onClick={(event) => openSticker(event, "reminder")}><ReminderStickerIcon />{node.reminderAt ? fmtDate(dateTimeInOmsk(node.reminderAt).date) : "Напоминание"}</button> : null}
            <div className="task-checklist-row__quick">
              <button type="button" onClick={(event) => openSticker(event, "all")}>＋ Стикер</button>
              <button type="button" className="task-checklist-row__add-child" title="Создать вложенную подзадачу" onClick={(event) => { event.stopPropagation(); onStartAdding(node.id); }}><SubtaskStickerIcon />Подзадача</button>
              <button
                type="button"
                className="task-checklist-row__delete"
                title="Удалить подзадачу"
                aria-label={`Удалить подзадачу «${node.title}»`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(node.id, node.children.length > 0);
                }}
              >
                <DeleteSubtaskIcon />
              </button>
            </div>
          </div>
          {node.assigneeStickerEnabled || targetAssignees(node).length > 0 ? (
            <button
              type="button"
              className={`task-checklist-row__avatar${targetAssignees(node).length > 0 ? "" : " is-empty"}`}
              title={targetAssignees(node).length > 0 ? `Исполнители: ${targetAssignees(node).map((person) => person.displayName).join(", ")}` : "Назначить исполнителей"}
              onClick={(event) => openSticker(event, "assignee")}
            >
              {targetAssignees(node).length > 0 ? <AssigneeAvatarStack people={targetAssignees(node)} /> : <AssigneeStickerIcon />}
            </button>
          ) : null}
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
              onDelete={onDelete}
              onEdit={onEdit}
              onStartAdding={onStartAdding}
              onSubmitNewItem={onSubmitNewItem}
              onCancelAdding={onCancelAdding}
            />
          ))}
          {addingParentId === node.id ? <ChecklistCreateRow title={newChecklistTitle} onTitleChange={onNewChecklistTitleChange} onSubmit={onSubmitNewItem} onCancel={onCancelAdding} /> : null}
        </div>
      ) : null}
      {menuMode === "all" ? <ChecklistStickerMenu item={node} users={users} anchor={menuAnchor} onClose={() => setMenuMode(null)} onPatch={(body) => onPatch(node.id, body)} /> : null}
      {menuMode && menuMode !== "all" ? <StickerQuickEditor target={node} initialMode={menuMode} users={users} anchor={menuAnchor} onClose={() => setMenuMode(null)} onPatch={(body) => onPatch(node.id, body)} /> : null}
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
  onDeleteChecklistItem,
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
  onDeleteChecklistItem: (itemId: string, hasChildren: boolean) => void;
  onEditChecklistItem: (itemId: string) => void;
  onStartAdding: (parentId: string | null) => void;
  onSubmitNewItem: () => void;
  onCancelAdding: () => void;
}) {
  const tree = React.useMemo(() => buildChecklistTree(items), [items]);
  return (
    <div className="task-checklist-tree">
      <div className="task-checklist-root-branch">
        {tree.map((node) => (
          <ChecklistTreeItem key={node.id} node={node} depth={0} users={users} addingParentId={addingParentId} newChecklistTitle={newChecklistTitle} onNewChecklistTitleChange={onNewChecklistTitleChange} onPatch={onPatchChecklistItem} onDelete={onDeleteChecklistItem} onEdit={onEditChecklistItem} onStartAdding={onStartAdding} onSubmitNewItem={onSubmitNewItem} onCancelAdding={onCancelAdding} />
        ))}
        {addingParentId === null ? <ChecklistCreateRow title={newChecklistTitle} onTitleChange={onNewChecklistTitleChange} onSubmit={onSubmitNewItem} onCancel={onCancelAdding} /> : null}
        {addingParentId === undefined ? <button type="button" className="task-checklist-tree__add-root" onClick={(event) => { event.stopPropagation(); onStartAdding(null); }}><SubtaskStickerIcon />Создать подзадачу</button> : null}
      </div>
    </div>
  );
}

function TaskChecklistPanel({
  task,
  expanded,
  newChecklistTitle,
  onToggleExpanded,
  onPatchChecklistItem,
  onDeleteChecklistItem,
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
  onDeleteChecklistItem: (itemId: string, hasChildren: boolean) => void;
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
          onDeleteChecklistItem={onDeleteChecklistItem}
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
  onDeleteChecklistItem,
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
  onDeleteChecklistItem: (itemId: string, hasChildren: boolean) => void;
  onDragStart: (taskId: string, fromColumnId: string, cardHeight: number) => void;
  onDragEnd: () => void;
  onDragOverTask: (taskId: string, columnId: string, edge: TaskDropEdge) => void;
  onDropOnTask: (taskId: string, targetTaskId: string, targetColumnId: string, edge: TaskDropEdge) => void;
  dropEdge: TaskDropEdge | null;
  users: TasksMeta["users"];
  columns: BoardColumn[];
  onOpenActivity: (taskId: string) => void;
  onOpenSubtasks: (taskId: string, itemId?: string) => void;
  onDuplicate: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  isDragging: boolean;
  dragPreviewHeight: number;
}) {
  const [newChecklistTitle, setNewChecklistTitle] = React.useState("");
  const cardRef = React.useRef<HTMLElement>(null);
  const draggedRef = React.useRef(false);
  const [openMenu, setOpenMenu] = React.useState<"stickers" | "actions" | StickerMode | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(task.title);
  const hasPriority = task.priorityStickerEnabled || task.priority !== "NORMAL";
  const textTone = cardTextColor(task.color);
  const taskDone = Boolean(task.completedAt);

  React.useEffect(() => {
    if (!editingTitle) setTitleDraft(task.title);
  }, [editingTitle, task.title]);

  function finishTitleEdit() {
    const nextTitle = titleDraft.trim();
    setEditingTitle(false);
    if (!nextTitle) {
      setTitleDraft(task.title);
      return;
    }
    if (nextTitle !== task.title) onPatchTask(task.id, { title: nextTitle });
  }

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
          <RoundCheckbox checked={taskDone} onChange={(checked) => onPatchTask(task.id, { completed: checked })} />
          <div className="min-w-0 flex-1">
            <div className="task-card__title-row">
              {editingTitle ? (
                <input
                  autoFocus
                  className="task-card__title-input"
                  value={titleDraft}
                  aria-label="Название задачи"
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onBlur={finishTitleEdit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setTitleDraft(task.title);
                      setEditingTitle(false);
                    }
                  }}
                />
              ) : (
                <>
                  <strong className={`task-card__title${taskDone ? " is-done" : ""}`}>{task.title}</strong>
                  <button
                    type="button"
                    className="task-card__edit"
                    onClick={(event) => {
                      event.stopPropagation();
                      setTitleDraft(task.title);
                      setEditingTitle(true);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    title="Быстро переименовать"
                    aria-label={`Переименовать задачу «${task.title}»`}
                  >
                    ✎
                  </button>
                </>
              )}
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
          {hasPriority ? <button type="button" className={`task-card-sticker task-card-sticker--priority is-${task.priority.toLowerCase()}${task.priorityStickerConfigured || task.priority !== "NORMAL" ? "" : " is-unconfigured"}`} onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu("priority"); }}><PriorityStickerIcon />{task.priorityStickerConfigured || task.priority !== "NORMAL" ? PRIORITY_LABEL[task.priority] : "Приоритет"}</button> : null}
          {task.deadlineStickerEnabled || task.dueDate ? <button type="button" className="task-card-sticker" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu("deadline"); }}><CalendarStickerIcon />{task.dueDate ? `${fmtDate(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ""}` : "Дедлайн"}</button> : null}
          {task.reminderStickerEnabled || task.reminderAt ? <button type="button" className="task-card-sticker" title="Изменить напоминание" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu("reminder"); }}><ReminderStickerIcon />{task.reminderAt ? fmtDate(dateTimeInOmsk(task.reminderAt).date) : "Напоминание"}</button> : null}
          <button type="button" className="task-card-tool" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu((current) => current === "stickers" ? null : "stickers"); }} onMouseDown={(event) => event.stopPropagation()}>＋ Стикер</button>
          <button type="button" className="task-card-tool task-card-tool--round" title="Назначить исполнителя" aria-label="Назначить исполнителя" onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu((current) => current === "assignee" ? null : "assignee"); }} onMouseDown={(event) => event.stopPropagation()}><AssigneeStickerIcon /></button>
          {task.commentCount > 0 ? <span className="task-card-comments" title="В задаче есть заметки">☵ <span>{task.commentCount}</span></span> : null}
          {task.assigneeStickerEnabled || targetAssignees(task).length > 0 ? (
            <button type="button" className={`task-card-assignee${targetAssignees(task).length > 0 ? "" : " is-empty"}`} title={targetAssignees(task).length > 0 ? `Исполнители: ${targetAssignees(task).map((person) => person.displayName).join(", ")}` : "Назначить исполнителей"} onClick={(event) => { event.stopPropagation(); setMenuAnchor(event.currentTarget); setOpenMenu("assignee"); }}>
              {targetAssignees(task).length > 0 ? <AssigneeAvatarStack people={targetAssignees(task)} /> : <AssigneeStickerIcon />}
            </button>
          ) : null}
        </div>
      </div>

      <TaskChecklistPanel
        task={task}
        expanded={expanded}
        newChecklistTitle={newChecklistTitle}
        onToggleExpanded={onToggleExpanded}
        onPatchChecklistItem={onPatchChecklistItem}
        onDeleteChecklistItem={onDeleteChecklistItem}
        onEditChecklistItem={(itemId) => onOpenSubtasks(task.id, itemId)}
        onNewChecklistTitleChange={setNewChecklistTitle}
        onAddChecklistItem={(title, parentId) => onAddChecklistItem(task.id, title, parentId)}
        users={users}
      />
    </article>
      {dropEdge === "after" ? <div className="task-drop-placeholder" style={{ height: dragPreviewHeight || 76 }} /> : null}
      {openMenu === "stickers" ? <TaskStickerMenu task={task} users={users} anchor={menuAnchor} onClose={() => setOpenMenu(null)} onPatch={(body) => onPatchTask(task.id, body)} /> : null}
      {openMenu === "priority" || openMenu === "deadline" || openMenu === "reminder" || openMenu === "assignee" ? <StickerQuickEditor target={task} initialMode={openMenu} users={users} anchor={menuAnchor} onClose={() => setOpenMenu(null)} onPatch={(body) => onPatchTask(task.id, body)} /> : null}
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
  const [assigneeUserIds, setAssigneeUserIds] = React.useState(() => task ? targetAssignees(task).map((person) => person.id) : []);
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
    setAssigneeUserIds(task ? targetAssignees(task).map((person) => person.id) : []);
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
        assigneeUserId: assigneeUserIds[0] ?? null,
        assigneeUserIds,
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
            <div className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Исполнители</span>
              <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-sm">
                {meta?.users.map((user) => {
                  const selected = assigneeUserIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-sm transition ${selected ? "bg-violet-100 text-violet-950" : "text-zinc-700 hover:bg-zinc-50"}`}
                      onClick={() => setAssigneeUserIds((current) => selected ? current.filter((id) => id !== user.id) : [...current, user.id])}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white">{initials(user.displayName)}</span>
                      <span className="min-w-0 flex-1 truncate">{user.displayName}</span>
                      <span aria-hidden className="font-bold text-violet-600">{selected ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
    focusSubtaskId?: string;
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
  const checklistQueueByItemRef = React.useRef<Map<string, Promise<void>>>(new Map());
  const checklistIdResolutionRef = React.useRef<Map<string, Promise<string>>>(new Map());
  const checklistQueueKeyByItemRef = React.useRef<Map<string, string>>(new Map());
  const taskIdResolutionRef = React.useRef<Map<string, Promise<string>>>(new Map());
  const taskQueueKeyByIdRef = React.useRef<Map<string, string>>(new Map());
  const transientErrorTimerRef = React.useRef<number | null>(null);
  const mutationSequenceRef = React.useRef(0);
  const latestMutationByTaskRef = React.useRef<Map<string, number>>(new Map());
  const latestMutationByChecklistItemRef = React.useRef<Map<string, number>>(new Map());
  const pendingMutationsRef = React.useRef(0);
  const isWowstorg = state.status === "authenticated" && state.user.role === "WOWSTORG";

  React.useEffect(() => {
    setArchivePortalHost(getModalPortalHost());
    const savedTheme = window.localStorage.getItem("wowstorg-task-board-theme");
    if (savedTheme === "dark" || savedTheme === "light") setBoardTheme(savedTheme);
  }, []);

  React.useEffect(() => () => {
    if (transientErrorTimerRef.current !== null) {
      window.clearTimeout(transientErrorTimerRef.current);
    }
  }, []);

  function showTransientError(message: string) {
    if (transientErrorTimerRef.current !== null) {
      window.clearTimeout(transientErrorTimerRef.current);
    }
    setError(message);
    transientErrorTimerRef.current = window.setTimeout(() => {
      setError((current) => current === message ? null : current);
      transientErrorTimerRef.current = null;
    }, 7_000);
  }

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
    setError(null);
    const queueKey = checklistQueueKeyByItemRef.current.get(itemId) ?? itemId;
    const mutationId = mutationSequenceRef.current + 1;
    mutationSequenceRef.current = mutationId;
    latestMutationByChecklistItemRef.current.set(queueKey, mutationId);
    const previousBoard = boardRef.current;
    const previousItem = previousBoard?.columns
      .flatMap((column) => column.tasks)
      .find((task) => task.id === taskId)
      ?.checklistItems.find((item) => item.id === itemId);
    const nextAssignees = body.assigneeUserIds !== undefined
      ? body.assigneeUserIds.map((userId) => meta?.users.find((user) => user.id === userId)).filter((user): user is TaskPerson => Boolean(user))
      : body.assigneeUserId !== undefined
        ? body.assigneeUserId
          ? [meta?.users.find((user) => user.id === body.assigneeUserId)].filter((user): user is TaskPerson => Boolean(user))
          : []
        : undefined;
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
            ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
            ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
            ...(body.dueTime !== undefined ? { dueTime: body.dueTime } : {}),
            ...(body.reminderAt !== undefined ? { reminderAt: body.reminderAt } : {}),
            ...(body.reminderText !== undefined ? { reminderText: body.reminderText } : {}),
            ...(body.priority !== undefined ? { priority: body.priority } : {}),
            ...(body.priorityStickerEnabled !== undefined ? { priorityStickerEnabled: body.priorityStickerEnabled } : {}),
            ...(body.priorityStickerConfigured !== undefined ? { priorityStickerConfigured: body.priorityStickerConfigured } : {}),
            ...(body.deadlineStickerEnabled !== undefined ? { deadlineStickerEnabled: body.deadlineStickerEnabled } : {}),
            ...(body.reminderStickerEnabled !== undefined ? { reminderStickerEnabled: body.reminderStickerEnabled } : {}),
            ...(body.assigneeStickerEnabled !== undefined ? { assigneeStickerEnabled: body.assigneeStickerEnabled } : {}),
            ...(body.priorityStickerEnabled === false ? { priority: "NORMAL" as Priority, priorityStickerConfigured: false } : {}),
            ...(body.deadlineStickerEnabled === false ? { startDate: null, dueDate: null, dueTime: null } : {}),
            ...(body.reminderStickerEnabled === false ? { reminderAt: null, reminderText: null } : {}),
            ...(body.assigneeStickerEnabled === false ? { assignee: null, assignees: [] } : {}),
            ...(body.color !== undefined ? { color: body.color } : {}),
            ...(nextAssignees !== undefined ? { assignee: nextAssignees[0] ?? null, assignees: nextAssignees } : {}),
          } : item);
          return { ...task, checklistItems, checklistDone: checklistItems.filter((item) => item.isDone).length };
        }),
      })),
    } : current);
    const sendMutation = async () => {
      let persistedItemId = itemId;
      let persistedTaskId = taskId;
      try {
        persistedItemId = await (checklistIdResolutionRef.current.get(itemId) ?? Promise.resolve(itemId));
        persistedTaskId = await (taskIdResolutionRef.current.get(taskId) ?? Promise.resolve(taskId));
        const data = await readApi<{ item: TaskChecklistItem }>(
          await fetch(`/api/tasks/checklist/${persistedItemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (latestMutationByChecklistItemRef.current.get(queueKey) === mutationId) {
          updateTaskInBoard(taskId, (task) => {
            const checklistItems = task.checklistItems.map((item) => (
              item.id === itemId || item.id === persistedItemId ? data.item : item
            ));
            return {
              ...task,
              checklistItems,
              checklistDone: checklistItems.filter((item) => item.isDone).length,
            };
          }, persistedTaskId);
          latestMutationByChecklistItemRef.current.delete(queueKey);
        }
      } catch (e) {
        if (latestMutationByChecklistItemRef.current.get(queueKey) !== mutationId) return;
        latestMutationByChecklistItemRef.current.delete(queueKey);
        if (previousItem) {
          updateTaskInBoard(taskId, (task) => {
            const checklistItems = task.checklistItems.map((item) => (
              item.id === itemId || item.id === persistedItemId
                ? { ...previousItem, id: persistedItemId }
                : item
            ));
            return {
              ...task,
              checklistItems,
              checklistDone: checklistItems.filter((item) => item.isDone).length,
            };
          }, persistedTaskId);
        } else {
          applyBoard(previousBoard);
        }
        showTransientError(e instanceof Error ? e.message : "Не удалось обновить подзадачу");
      }
    };
    const previousMutation = checklistQueueByItemRef.current.get(queueKey) ?? Promise.resolve();
    const queuedMutation = previousMutation.catch(() => undefined).then(sendMutation);
    checklistQueueByItemRef.current.set(queueKey, queuedMutation);
    pendingMutationsRef.current += 1;
    try {
      await queuedMutation;
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    }
    if (checklistQueueByItemRef.current.get(queueKey) === queuedMutation) {
      checklistQueueByItemRef.current.delete(queueKey);
    }
  }

  async function deleteChecklistItemInline(taskId: string, itemId: string, hasChildren: boolean) {
    const confirmation = hasChildren
      ? "Удалить подзадачу вместе со всеми вложенными подзадачами?"
      : "Удалить подзадачу?";
    if (!window.confirm(confirmation)) return;

    const previousBoard = boardRef.current;
    updateBoard((current) => current ? {
      ...current,
      columns: current.columns.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => {
          if (task.id !== taskId) return task;

          const removedIds = new Set([itemId]);
          let foundDescendant = true;
          while (foundDescendant) {
            foundDescendant = false;
            for (const item of task.checklistItems) {
              if (item.parentId && removedIds.has(item.parentId) && !removedIds.has(item.id)) {
                removedIds.add(item.id);
                foundDescendant = true;
              }
            }
          }

          const checklistItems = task.checklistItems.filter((item) => !removedIds.has(item.id));
          return {
            ...task,
            checklistItems,
            checklistDone: checklistItems.filter((item) => item.isDone).length,
            checklistTotal: checklistItems.length,
          };
        }),
      })),
    } : current);

    try {
      await readApi(await fetch(`/api/tasks/checklist/${itemId}`, { method: "DELETE" }));
    } catch (e) {
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось удалить подзадачу");
    }
  }

  function updateTaskInBoard(
    taskId: string,
    updater: (task: BoardTask) => BoardTask,
    resolvedTaskId?: string,
  ) {
    updateBoard((current) =>
      current
        ? {
            ...current,
            columns: current.columns.map((column) => ({
              ...column,
              tasks: column.tasks.map((task) => (
                task.id === taskId || (resolvedTaskId !== undefined && task.id === resolvedTaskId)
                  ? updater(task)
                  : task
              )),
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
    const idResolution = request.then(({ task }) => task.id);
    taskIdResolutionRef.current.set(tempId, idResolution);
    const assignees = draft.assigneeUserIds
      .map((userId) => meta?.users.find((user) => user.id === userId))
      .filter((user): user is TaskPerson => Boolean(user));
    const assignee = assignees[0] ?? null;
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
      startDate: null,
      dueDate: draft.dueDate,
      dueTime: null,
      reminderAt: draft.reminderAt,
      reminderText: null,
      priorityStickerEnabled: draft.priority !== "NORMAL",
      priorityStickerConfigured: draft.priority !== "NORMAL",
      deadlineStickerEnabled: Boolean(draft.dueDate),
      reminderStickerEnabled: Boolean(draft.reminderAt),
      assigneeStickerEnabled: Boolean(draft.assigneeUserId),
      completedAt: column.isDone ? new Date().toISOString() : null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignee,
      assignees,
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
        taskQueueKeyByIdRef.current.set(task.id, tempId);
        updateBoard((current) =>
          current
            ? {
                ...current,
                columns: current.columns.map((item) => ({
                  ...item,
                  tasks: item.tasks.map((currentTask) => (currentTask.id === tempId ? {
                    ...task,
                    ...currentTask,
                    id: task.id,
                    createdAt: task.createdAt,
                  } : currentTask)),
                })),
              }
            : current,
        );
      })
      .catch((e) => {
        taskIdResolutionRef.current.delete(tempId);
        applyBoard(previousBoard);
        setError(e instanceof Error ? e.message : "Не удалось создать задачу");
      });
  }

  async function patchTaskInline(taskId: string, body: TaskPatchBody) {
    const previousBoard = boardRef.current;
    if (!previousBoard) return;
    const sourceTask = previousBoard.columns.flatMap((column) => column.tasks).find((task) => task.id === taskId);
    if (!sourceTask) return;
    const queueKey = taskQueueKeyByIdRef.current.get(taskId) ?? taskId;
    const mutationId = mutationSequenceRef.current + 1;
    mutationSequenceRef.current = mutationId;
    latestMutationByTaskRef.current.set(queueKey, mutationId);
    pendingMutationsRef.current += 1;
    const nextAssignees = body.assigneeUserIds !== undefined
      ? body.assigneeUserIds.map((userId) => meta?.users.find((user) => user.id === userId)).filter((user): user is TaskPerson => Boolean(user))
      : body.assigneeUserId !== undefined
        ? body.assigneeUserId
          ? [meta?.users.find((user) => user.id === body.assigneeUserId)].filter((user): user is TaskPerson => Boolean(user))
          : []
        : sourceTask.assignees;
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
      ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
      ...(body.dueTime !== undefined ? { dueTime: body.dueTime } : {}),
      ...(body.reminderAt !== undefined ? { reminderAt: body.reminderAt } : {}),
      ...(body.reminderText !== undefined ? { reminderText: body.reminderText } : {}),
      ...(body.priorityStickerEnabled !== undefined ? { priorityStickerEnabled: body.priorityStickerEnabled } : {}),
      ...(body.priorityStickerConfigured !== undefined ? { priorityStickerConfigured: body.priorityStickerConfigured } : {}),
      ...(body.deadlineStickerEnabled !== undefined ? { deadlineStickerEnabled: body.deadlineStickerEnabled } : {}),
      ...(body.reminderStickerEnabled !== undefined ? { reminderStickerEnabled: body.reminderStickerEnabled } : {}),
      ...(body.assigneeStickerEnabled !== undefined ? { assigneeStickerEnabled: body.assigneeStickerEnabled } : {}),
      ...(body.priorityStickerEnabled === false ? { priority: "NORMAL" as Priority, priorityStickerConfigured: false } : {}),
      ...(body.deadlineStickerEnabled === false ? { startDate: null, dueDate: null, dueTime: null } : {}),
      ...(body.reminderStickerEnabled === false ? { reminderAt: null, reminderText: null } : {}),
      ...(body.assigneeStickerEnabled === false ? { assignee: null, assignees: [] } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.completed !== undefined ? { completedAt: body.completed ? (sourceTask.completedAt ?? new Date().toISOString()) : null } : {}),
      ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date().toISOString() : null } : {}),
      ...((body.assigneeUserId !== undefined || body.assigneeUserIds !== undefined)
        ? { assignee: nextAssignees[0] ?? null, assignees: nextAssignees }
        : {}),
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
      let persistedTaskId = taskId;
      try {
        persistedTaskId = await (taskIdResolutionRef.current.get(taskId) ?? Promise.resolve(taskId));
        const data = await readApi<{ task: BoardTask }>(
          await fetch(`/api/tasks/tasks/${persistedTaskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (latestMutationByTaskRef.current.get(queueKey) === mutationId) {
          if (!body.archived) {
            updateTaskInBoard(taskId, (currentTask) => ({ ...data.task, sortOrder: currentTask.sortOrder }), persistedTaskId);
          }
          latestMutationByTaskRef.current.delete(queueKey);
        }
      } catch (e) {
        if (latestMutationByTaskRef.current.get(queueKey) === mutationId) {
          latestMutationByTaskRef.current.delete(queueKey);
          const originalColumnId = previousBoard.columns.find((column) => column.tasks.some((task) => task.id === taskId))?.id;
          updateBoard((current) => current ? {
            ...current,
            columns: current.columns.map((column) => {
              const withoutTask = column.tasks.filter((task) => task.id !== taskId && task.id !== persistedTaskId);
              return column.id === originalColumnId
                ? { ...column, tasks: [...withoutTask, { ...sourceTask, id: persistedTaskId }].sort((left, right) => left.sortOrder - right.sortOrder) }
                : { ...column, tasks: withoutTask };
            }),
          } : current);
          setError(e instanceof Error ? e.message : "Не удалось обновить задачу");
        }
      } finally {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      }
    };
    const previousMutation = moveQueueByTaskRef.current.get(queueKey) ?? Promise.resolve();
    const queuedMutation = previousMutation.catch(() => undefined).then(sendMutation);
    moveQueueByTaskRef.current.set(queueKey, queuedMutation);
    await queuedMutation;
    if (moveQueueByTaskRef.current.get(queueKey) === queuedMutation) moveQueueByTaskRef.current.delete(queueKey);
  }

  async function addChecklistItemInline(taskId: string, title: string, parentId: string | null = null) {
    setError(null);
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
          startDate: null,
          dueDate: null,
          dueTime: null,
          reminderAt: null,
          reminderText: null,
          priorityStickerEnabled: false,
          priorityStickerConfigured: false,
          deadlineStickerEnabled: false,
          reminderStickerEnabled: false,
          assigneeStickerEnabled: false,
          completedAt: null,
          updatedAt: new Date().toISOString(),
          assignee: null,
          assignees: [],
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
    const createRequest = (async () => {
      const persistedTaskId = await (taskIdResolutionRef.current.get(taskId) ?? Promise.resolve(taskId));
      const persistedParentId = parentId
        ? await (checklistIdResolutionRef.current.get(parentId) ?? Promise.resolve(parentId))
        : null;
      return readApi<{ item: TaskChecklistItem }>(
        await fetch(`/api/tasks/tasks/${persistedTaskId}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, parentId: persistedParentId }),
        }),
      );
    })();
    checklistIdResolutionRef.current.set(tempId, createRequest.then((data) => data.item.id));
    try {
      const data = await createRequest;
      checklistQueueKeyByItemRef.current.set(data.item.id, tempId);
      const persistedTaskId = await (taskIdResolutionRef.current.get(taskId) ?? Promise.resolve(taskId));
      updateTaskInBoard(taskId, (task) => ({
        ...task,
        checklistItems: task.checklistItems.map((item) => item.id === tempId ? {
          ...data.item,
          ...item,
          id: data.item.id,
          parentId: data.item.parentId,
          sortOrder: data.item.sortOrder,
          updatedAt: data.item.updatedAt,
        } : item),
      }), persistedTaskId);
    } catch (e) {
      checklistIdResolutionRef.current.delete(tempId);
      applyBoard(previousBoard);
      setError(e instanceof Error ? e.message : "Не удалось добавить подзадачу");
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
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
          {board.columns.map((column) => (
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
                    onOpenSubtasks={(taskId, focusSubtaskId) => setActivityDrawer({ taskId, tab: "subtasks", focusSubtaskId })}
                    onDuplicate={(taskId) => void duplicateTask(taskId)}
                    onDelete={(taskId) => void deleteTask(taskId)}
                    onPatchTask={(taskId, body) => void patchTaskInline(taskId, body)}
                    onAddChecklistItem={(taskId, title, parentId) => void addChecklistItemInline(taskId, title, parentId)}
                    expanded={expandedTaskIds.has(task.id)}
                    onToggleExpanded={toggleTaskExpanded}
                    onPatchChecklistItem={(itemId, body) => void patchChecklistItem(task.id, itemId, body)}
                    onDeleteChecklistItem={(itemId, hasChildren) => void deleteChecklistItemInline(task.id, itemId, hasChildren)}
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
          key={`${activityDrawer.taskId}:${activityDrawer.tab}:${activityDrawer.focusSubtaskId ?? ""}`}
          taskId={activityDrawer.taskId}
          users={meta?.users ?? []}
          columns={(board?.columns ?? []).map((column) => ({
            id: column.id,
            title: column.title,
            isDone: column.isDone,
          }))}
          initialTab={activityDrawer.tab}
          initialFocusSubtaskId={activityDrawer.focusSubtaskId}
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
