"use client";

import React from "react";
import { createPortal } from "react-dom";

import { readJsonSafe } from "@/lib/fetchJson";

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type UserOption = { id: string; displayName: string };
type ColumnOption = { id: string; title: string; isDone: boolean };

type Activity = {
  id: string;
  kind: string;
  message: string | null;
  createdAt: string;
  actor: UserOption;
};

type Subtask = {
  id: string;
  title: string;
  description: string | null;
  isDone: boolean;
  priority: Priority;
  color: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  assignee: UserOption | null;
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  color: string | null;
  dueDate: string | null;
  reminderAt: string | null;
  completedAt: string | null;
  assignee: UserOption | null;
  column: ColumnOption;
  checklistItems: Subtask[];
  activities: Activity[];
};

type Tab = "activity" | "details" | "subtasks";

const PRIORITIES: Array<{ value: Priority; label: string }> = [
  { value: "LOW", label: "Низкий" },
  { value: "NORMAL", label: "Обычный" },
  { value: "HIGH", label: "Важно" },
  { value: "URGENT", label: "Срочно" },
];

function initials(name: string): string {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return date.toLocaleString("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await readJsonSafe<T | { error?: { message?: string } }>(response);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? payload.error?.message
      : undefined;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return payload as T;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="task-drawer__label">{children}</span>;
}

export function TaskActivityDrawer({
  taskId,
  users,
  columns,
  initialTab = "activity",
  onClose,
  onChanged,
}: {
  taskId: string;
  users: UserOption[];
  columns: ColumnOption[];
  initialTab?: Tab;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [task, setTask] = React.useState<TaskDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [comment, setComment] = React.useState("");
  const [newSubtask, setNewSubtask] = React.useState("");
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    try {
      setHost(window.parent && window.parent !== window ? window.parent.document.body : document.body);
    } catch {
      setHost(document.body);
    }
  }, []);

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await api<{ task: TaskDetail }>(`/api/tasks/tasks/${taskId}`);
      setTask(data.task);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить задачу");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const refresh = () => { if (!busy && document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 12_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [busy, load]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function patchTask(body: Record<string, unknown>, optimistic: (current: TaskDetail) => TaskDetail) {
    if (!task) return;
    const before = task;
    setTask(optimistic(task));
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tasks/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load(true);
      onChanged();
    } catch (cause) {
      setTask(before);
      setError(cause instanceof Error ? cause.message : "Не удалось обновить задачу");
    } finally {
      setBusy(false);
    }
  }

  async function patchSubtask(item: Subtask, body: Record<string, unknown>, optimistic: (current: Subtask) => Subtask) {
    if (!task) return;
    const before = task;
    setTask({ ...task, checklistItems: task.checklistItems.map((row) => row.id === item.id ? optimistic(row) : row) });
    setBusy(true);
    try {
      await api(`/api/tasks/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load(true);
      onChanged();
    } catch (cause) {
      setTask(before);
      setError(cause instanceof Error ? cause.message : "Не удалось обновить подзадачу");
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    const message = comment.trim();
    if (!message || busy) return;
    setBusy(true);
    try {
      await api(`/api/tasks/tasks/${taskId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setComment("");
      await load(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить заметку");
    } finally {
      setBusy(false);
    }
  }

  async function createSubtask() {
    const title = newSubtask.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await api(`/api/tasks/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setNewSubtask("");
      await load(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать подзадачу");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSubtask(item: Subtask) {
    if (!window.confirm(`Удалить подзадачу «${item.title}»?`)) return;
    setBusy(true);
    try {
      await api(`/api/tasks/checklist/${item.id}`, { method: "DELETE" });
      await load(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось удалить подзадачу");
    } finally {
      setBusy(false);
    }
  }

  if (!host) return null;
  return createPortal(
    <div className="task-drawer-layer" role="presentation">
      <button type="button" className="task-drawer-backdrop" onClick={onClose} aria-label="Закрыть задачу" />
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-label="Рабочее пространство задачи">
        <header className="task-drawer__header">
          <div className="task-drawer__headline">
            <button type="button" className="task-drawer__done" onClick={() => task && void patchTask(
              { completed: !task.completedAt },
              (current) => ({ ...current, completedAt: current.completedAt ? null : new Date().toISOString() }),
            )} aria-label={task?.completedAt ? "Вернуть в работу" : "Отметить выполненной"}>
              {task?.completedAt ? "✓" : ""}
            </button>
            <div>
              <strong>{task?.title ?? "Задача"}</strong>
              <span>{busy ? "Сохраняем…" : "История и рабочие заметки"}</span>
            </div>
          </div>
          <button type="button" className="task-drawer__close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <nav className="task-drawer__tabs" aria-label="Разделы задачи">
          <button type="button" className={tab === "activity" ? "is-active" : ""} onClick={() => setTab("activity")}>История</button>
          <button type="button" className={tab === "details" ? "is-active" : ""} onClick={() => setTab("details")}>Детали</button>
          <button type="button" className={tab === "subtasks" ? "is-active" : ""} onClick={() => setTab("subtasks")}>Подзадачи <span>{task?.checklistItems.length ?? 0}</span></button>
        </nav>

        {error ? <div className="task-drawer__error" role="alert">{error}</div> : null}
        {loading ? <div className="task-drawer__loading">Загружаю задачу…</div> : null}

        {!loading && task && tab === "activity" ? (
          <div className="task-drawer__activity">
            <div className="task-activity-list">
              {task.activities.length === 0 ? (
                <div className="task-activity-empty"><strong>Здесь пока тихо</strong><span>Оставьте первую рабочую заметку — она не потеряется в карточке.</span></div>
              ) : [...task.activities].reverse().map((entry) => entry.kind === "COMMENT" ? (
                <article key={entry.id} className="task-comment">
                  <span className="task-avatar">{initials(entry.actor.displayName)}</span>
                  <div><header><strong>{entry.actor.displayName}</strong><time>{formatActivityTime(entry.createdAt)}</time></header><p>{entry.message}</p></div>
                </article>
              ) : (
                <div key={entry.id} className="task-system-event">
                  <span>{entry.message ?? "Задача обновлена"}</span><time>{entry.actor.displayName} · {formatActivityTime(entry.createdAt)}</time>
                </div>
              ))}
            </div>
            <div className="task-comment-compose">
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Зафиксировать результат, вопрос или важную деталь…" rows={2} onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void addComment();
              }} />
              <button type="button" onClick={() => void addComment()} disabled={!comment.trim() || busy}>Отправить</button>
              <small>Ctrl + Enter</small>
            </div>
          </div>
        ) : null}

        {!loading && task && tab === "details" ? (
          <div className="task-drawer__details">
            <label className="task-drawer__field task-drawer__field--wide"><FieldLabel>Название</FieldLabel><textarea value={task.title} rows={2} onChange={(event) => setTask({ ...task, title: event.target.value })} onBlur={(event) => {
              const value = event.target.value.trim(); if (value) void patchTask({ title: value }, (current) => ({ ...current, title: value }));
            }} /></label>
            <label className="task-drawer__field task-drawer__field--wide"><FieldLabel>Описание</FieldLabel><textarea value={task.description ?? ""} rows={5} onChange={(event) => setTask({ ...task, description: event.target.value })} onBlur={(event) => {
              const value = event.target.value.trim(); void patchTask({ description: value || null }, (current) => ({ ...current, description: value || null }));
            }} /></label>
            <label className="task-drawer__field"><FieldLabel>Исполнитель</FieldLabel><select value={task.assignee?.id ?? ""} onChange={(event) => {
              const id = event.target.value; const assignee = users.find((user) => user.id === id) ?? null;
              void patchTask({ assigneeUserId: id || null }, (current) => ({ ...current, assignee }));
            }}><option value="">Не назначен</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
            <label className="task-drawer__field"><FieldLabel>Статус</FieldLabel><select value={task.column.id} onChange={(event) => {
              const target = columns.find((column) => column.id === event.target.value); if (!target) return;
              void patchTask({ columnId: target.id, completed: target.isDone }, (current) => ({ ...current, column: target, completedAt: target.isDone ? new Date().toISOString() : null }));
            }}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
            <label className="task-drawer__field"><FieldLabel>Дедлайн</FieldLabel><input type="date" value={task.dueDate ?? ""} onChange={(event) => {
              const value = event.target.value || null; void patchTask({ dueDate: value }, (current) => ({ ...current, dueDate: value }));
            }} /></label>
            <label className="task-drawer__field"><FieldLabel>Напоминание</FieldLabel><input type="datetime-local" value={toLocalDateTime(task.reminderAt)} onChange={(event) => {
              const value = fromLocalDateTime(event.target.value); void patchTask({ reminderAt: value }, (current) => ({ ...current, reminderAt: value }));
            }} /></label>
            <label className="task-drawer__field"><FieldLabel>Приоритет</FieldLabel><select value={task.priority} onChange={(event) => {
              const priority = event.target.value as Priority; void patchTask({ priority }, (current) => ({ ...current, priority }));
            }}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <div className="task-drawer__field task-drawer__field--wide"><FieldLabel>Цвет карточки</FieldLabel><div className="task-drawer-colors">{["#334155", "#365a83", "#6d3b7d", "#7b6b2e", "#315f2f", "#7f2f5f"].map((color) => <button key={color} type="button" className={task.color === color ? "is-active" : ""} style={{ backgroundColor: color }} aria-label={`Выбрать цвет ${color}`} onClick={() => void patchTask({ color }, (current) => ({ ...current, color }))} />)}</div></div>
          </div>
        ) : null}

        {!loading && task && tab === "subtasks" ? (
          <div className="task-drawer__subtasks">
            <div className="task-subtask-create"><input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createSubtask(); }} placeholder="Новая подзадача" /><button type="button" onClick={() => void createSubtask()} disabled={!newSubtask.trim() || busy}>Добавить</button></div>
            {task.checklistItems.map((item) => (
              <details key={item.id} className="task-subtask-detail">
                <summary><button type="button" className={item.isDone ? "is-done" : ""} onClick={(event) => { event.preventDefault(); void patchSubtask(item, { isDone: !item.isDone }, (current) => ({ ...current, isDone: !current.isDone })); }}>{item.isDone ? "✓" : ""}</button><span className={item.isDone ? "is-done" : ""}>{item.title}</span><small>{item.assignee?.displayName ?? "Без исполнителя"}</small></summary>
                <div className="task-subtask-detail__body">
                  <label className="task-drawer__field task-drawer__field--wide"><FieldLabel>Название</FieldLabel><input defaultValue={item.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== item.title) void patchSubtask(item, { title }, (current) => ({ ...current, title })); }} /></label>
                  <label className="task-drawer__field task-drawer__field--wide"><FieldLabel>Описание / заметка</FieldLabel><textarea defaultValue={item.description ?? ""} rows={3} onBlur={(event) => { const description = event.target.value.trim() || null; if (description !== item.description) void patchSubtask(item, { description }, (current) => ({ ...current, description })); }} /></label>
                  <label className="task-drawer__field"><FieldLabel>Исполнитель</FieldLabel><select value={item.assignee?.id ?? ""} onChange={(event) => { const id = event.target.value; const assignee = users.find((user) => user.id === id) ?? null; void patchSubtask(item, { assigneeUserId: id || null }, (current) => ({ ...current, assignee })); }}><option value="">Не назначен</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
                  <label className="task-drawer__field"><FieldLabel>Дедлайн</FieldLabel><input type="date" value={item.dueDate ?? ""} onChange={(event) => { const dueDate = event.target.value || null; void patchSubtask(item, { dueDate }, (current) => ({ ...current, dueDate })); }} /></label>
                  <label className="task-drawer__field"><FieldLabel>Приоритет</FieldLabel><select value={item.priority} onChange={(event) => { const priority = event.target.value as Priority; void patchSubtask(item, { priority }, (current) => ({ ...current, priority })); }}>{PRIORITIES.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
                  <label className="task-drawer__field"><FieldLabel>Напоминание</FieldLabel><input type="datetime-local" value={toLocalDateTime(item.reminderAt)} onChange={(event) => { const reminderAt = fromLocalDateTime(event.target.value); void patchSubtask(item, { reminderAt }, (current) => ({ ...current, reminderAt })); }} /></label>
                  <div className="task-drawer__field task-drawer__field--wide"><FieldLabel>Цвет подзадачи</FieldLabel><div className="task-drawer-colors">{["#334155", "#365a83", "#6d3b7d", "#7b6b2e", "#315f2f", "#7f2f5f"].map((color) => <button key={color} type="button" className={item.color === color ? "is-active" : ""} style={{ backgroundColor: color }} aria-label={`Выбрать цвет ${color}`} onClick={() => void patchSubtask(item, { color }, (current) => ({ ...current, color }))} />)}</div></div>
                  <button type="button" className="task-subtask-delete" onClick={() => void deleteSubtask(item)}>Удалить подзадачу</button>
                </div>
              </details>
            ))}
            {task.checklistItems.length === 0 ? <div className="task-activity-empty"><strong>Подзадач пока нет</strong><span>Разбейте задачу на небольшие самостоятельные шаги.</span></div> : null}
          </div>
        ) : null}
      </aside>
    </div>,
    host,
  );
}
