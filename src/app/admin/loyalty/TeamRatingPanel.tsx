"use client";

import * as React from "react";

import { readJsonSafe } from "@/lib/fetchJson";
import "./loyalty-team.css";

export type RatingEventRow = {
  id: string;
  type: string;
  delta: number;
  effectiveDelta: number;
  reason: string;
  recoveryStartsAt: string | null;
  recoveryEndsAt: string | null;
  createdAt: string;
  order?: { id: string; eventName: string | null; customer: { name: string } } | null;
};

export type LoyaltyTeamUser = {
  id: string;
  displayName: string;
  login: string;
  isActive: boolean;
  telegramChatId: string | null;
  greenwichRating: { baseScore: number; score: number; updatedAt: string } | null;
  month: { position: number; monthlyDelta: number; perfectReturns: number; penalties: number } | null;
  eventCount: number;
  recentEvents: RatingEventRow[];
};

type HistoryResponse = {
  user: { id: string; displayName: string; login: string; isActive: boolean; score: number };
  events: RatingEventRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type ApiError = { error?: { message?: string } };

const EVENT_LABELS: Record<string, string> = {
  CONFIRMATION_RESPONDED: "Подтверждение заявки",
  CONFIRMATION_REPEAT_MISSED: "Пропущено напоминание",
  CONFIRMATION_FINAL_MISSED: "Пропущено финальное напоминание",
  APPROVAL_WARNING_MISSED: "Просрочено согласование",
  RETURN_OVERDUE: "Просрочен возврат",
  PERFECT_RETURN: "Идеальный возврат",
  RETURN_DIRTY: "Возврат загрязнённым",
  RETURN_DAMAGED: "Повреждение при возврате",
  RETURN_MISSING: "Потеря при возврате",
  ADMIN_ADJUSTMENT: "Корректировка администратора",
};

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Omsk",
  }).format(new Date(value));
}

function DeltaBadge({ event }: { event: RatingEventRow }) {
  const delta = event.effectiveDelta;
  return (
    <span className={`loyalty-eventDelta ${delta >= 0 ? "is-positive" : "is-negative"}`}>
      {delta > 0 ? "+" : ""}{delta}
      {delta !== event.delta ? <small>из {event.delta > 0 ? "+" : ""}{event.delta}</small> : null}
    </span>
  );
}

function EventList({ events, emptyText }: { events: RatingEventRow[]; emptyText: string }) {
  if (events.length === 0) return <p className="loyalty-eventsEmpty">{emptyText}</p>;
  return (
    <div className="loyalty-eventList">
      {events.map((event) => (
        <article className="loyalty-event" key={event.id}>
          <DeltaBadge event={event} />
          <div className="loyalty-event__body">
            <div className="loyalty-event__topline">
              <strong>{EVENT_LABELS[event.type] ?? event.type}</strong>
              <time dateTime={event.createdAt}>{formatEventDate(event.createdAt)}</time>
            </div>
            <p>{event.reason}</p>
            {event.order ? (
              <span className="loyalty-event__order">
                Заявка: {event.order.eventName || event.order.customer.name}
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function TeamRatingPanel({
  users,
  startingScore,
  onAdjusted,
}: {
  users: LoyaltyTeamUser[];
  startingScore: number;
  onAdjusted: () => Promise<void>;
}) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [targetScore, setTargetScore] = React.useState(startingScore);
  const [reason, setReason] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [historyUserId, setHistoryUserId] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  const selectedUser = users.find((user) => user.id === expandedId) ?? null;

  React.useEffect(() => {
    if (!historyUserId) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryUserId(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [historyUserId]);

  function toggleUser(user: LoyaltyTeamUser) {
    setMessage(null);
    setReason("");
    setTargetScore(user.greenwichRating?.score ?? startingScore);
    setExpandedId((current) => current === user.id ? null : user.id);
  }

  const loadHistory = React.useCallback(async (userId: string, page = 1) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/admin/loyalty/users/${userId}/history?page=${page}&pageSize=20`, { cache: "no-store" });
      const payload = await readJsonSafe<HistoryResponse | ApiError>(response);
      if (!response.ok || !payload || !("events" in payload)) {
        throw new Error((payload as ApiError | null)?.error?.message ?? "Не удалось загрузить историю");
      }
      setHistory((current) => page > 1 && current
        ? { ...payload, events: [...current.events, ...payload.events] }
        : payload);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "Не удалось загрузить историю");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  async function openHistory(userId: string) {
    setHistoryUserId(userId);
    setHistory(null);
    await loadHistory(userId, 1);
  }

  async function adjustRating(user: LoyaltyTeamUser) {
    if (!reason.trim() || reason.trim().length < 3) {
      setMessage("Укажите короткую причину изменения — она попадёт в историю сотрудника.");
      return;
    }
    setSavingId(user.id);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADJUST_RATING", userId: user.id, targetScore, reason: reason.trim() }),
      });
      const payload = await readJsonSafe<{ adjustment?: { score: number } } | ApiError>(response);
      if (!response.ok) throw new Error((payload as ApiError | null)?.error?.message ?? "Не удалось изменить рейтинг");
      setMessage(`Рейтинг ${user.displayName} установлен на ${targetScore}. Корректировка добавлена в историю.`);
      setReason("");
      await onAdjusted();
      if (historyUserId === user.id) await loadHistory(user.id, 1);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Не удалось изменить рейтинг");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <section className="loyalty-team">
        <header className="loyalty-team__header">
          <div>
            <h2>Команда Grinvich</h2>
            <p>Выберите сотрудника, чтобы увидеть последние изменения и скорректировать рейтинг.</p>
          </div>
          <span>Стартовое значение — {startingScore}</span>
        </header>

        <div className="loyalty-team__list">
          {users.map((user) => {
            const score = user.greenwichRating?.score ?? startingScore;
            const expanded = expandedId === user.id;
            return (
              <article className={`loyalty-person${expanded ? " is-expanded" : ""}`} key={user.id}>
                <button
                  type="button"
                  className="loyalty-person__summary"
                  aria-expanded={expanded}
                  onClick={() => toggleUser(user)}
                >
                  <span className="loyalty-person__identity">
                    <strong>{user.displayName}</strong>
                    <small>@{user.login} · {user.isActive ? "активен" : "заблокирован"}</small>
                  </span>
                  <span className="loyalty-person__month">
                    {user.month ? <><strong>#{user.month.position}</strong> в этом месяце · {user.month.monthlyDelta > 0 ? "+" : ""}{user.month.monthlyDelta}</> : "Без активности в месяце"}
                  </span>
                  <span className="loyalty-person__score">
                    <strong>{score}</strong><small>из 100</small>
                  </span>
                  <span className="loyalty-person__chevron" aria-hidden>⌄</span>
                </button>

                {expanded ? (
                  <div className="loyalty-person__details">
                    <div className="loyalty-person__historyPreview">
                      <div className="loyalty-subhead">
                        <div><strong>Последние начисления</strong><span>{user.eventCount} событий всего</span></div>
                        <button type="button" onClick={() => void openHistory(user.id)}>Вся история</button>
                      </div>
                      <EventList events={user.recentEvents} emptyText="Начислений пока не было." />
                    </div>

                    <form
                      className="loyalty-adjust"
                      onSubmit={(event) => { event.preventDefault(); void adjustRating(user); }}
                    >
                      <div className="loyalty-adjust__intro">
                        <strong>Изменить рейтинг</strong>
                        <span>Создаст прозрачную корректировку. Автоматический расчёт продолжит работать.</span>
                      </div>
                      <label>
                        Новое значение
                        <input type="number" min={0} max={100} value={targetScore} onChange={(event) => setTargetScore(Number(event.target.value))} />
                      </label>
                      <label className="loyalty-adjust__reason">
                        Причина
                        <input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Например, стартовая корректировка команды" />
                      </label>
                      <button type="submit" disabled={savingId === user.id || targetScore === score || !reason.trim()}>
                        {savingId === user.id ? "Сохраняем…" : `Установить ${targetScore}`}
                      </button>
                      {message && selectedUser?.id === user.id ? <p role="status" className="loyalty-adjust__message">{message}</p> : null}
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {historyUserId ? (
        <div className="loyalty-historyLayer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setHistoryUserId(null); }}>
          <aside className="loyalty-historyDrawer" role="dialog" aria-modal="true" aria-labelledby="loyalty-history-title">
            <header>
              <div>
                <span>Полная история</span>
                <h2 id="loyalty-history-title">{history?.user.displayName ?? users.find((user) => user.id === historyUserId)?.displayName}</h2>
                {history ? <p>Текущий рейтинг {history.user.score} · {history.pagination.total} событий</p> : null}
              </div>
              <button type="button" aria-label="Закрыть историю" onClick={() => setHistoryUserId(null)}>×</button>
            </header>
            <div className="loyalty-historyDrawer__body">
              {historyError ? <div className="loyalty-historyError" role="alert">{historyError}<button type="button" onClick={() => void loadHistory(historyUserId, 1)}>Повторить</button></div> : null}
              {history ? <EventList events={history.events} emptyText="У сотрудника ещё нет рейтинговых событий." /> : null}
              {historyLoading && !history ? <div className="loyalty-historyLoading">Загружаем историю…</div> : null}
              {history && history.pagination.page < history.pagination.totalPages ? (
                <button className="loyalty-historyMore" type="button" disabled={historyLoading} onClick={() => void loadHistory(historyUserId, history.pagination.page + 1)}>
                  {historyLoading ? "Загружаем…" : "Показать более ранние события"}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
