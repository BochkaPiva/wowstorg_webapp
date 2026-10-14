"use client";

import * as React from "react";
import { useAuth } from "@/app/providers";
import { readJsonSafe } from "@/lib/fetchJson";
import { useJsonResource } from "@/lib/use-json-resource";
import styles from "./director-settings.module.css";

type Settings = { revision: number; directorUserId: string | null; telegramChatId: string | null; boardId: string | null; columnId: string | null };
type DirectorData = { settings: Settings; users: Array<{ id: string; displayName: string; telegramChatId: string | null }>; boards: Array<{ id: string; title: string; columns: Array<{ id: string; title: string }> }> };

async function writeSettings(method: "PATCH" | "POST", body?: unknown) {
  const response = await fetch("/api/admin/telegram/director", { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await readJsonSafe<{ error?: { message?: string } }>(response);
  if (!response.ok || !result) throw new Error(result?.error?.message ?? "Не удалось выполнить запрос");
}

export function DirectorSettingsPanel({ botReady }: { botReady: boolean }) {
  const { state } = useAuth();
  const owner = state.status === "authenticated" && state.user.role === "WOWSTORG" ? state.user.id : null;
  return owner ? <DirectorSettingsResource key={owner} botReady={botReady} /> : null;
}

function DirectorSettingsResource({ botReady }: { botReady: boolean }) {
  const resource = useJsonResource<DirectorData>("/api/admin/telegram/director", "Не удалось загрузить настройки директора");
  const [notice, setNotice] = React.useState<string | null>(null);
  return <section className={styles.panel} aria-labelledby="director-settings-title">
    <div className={styles.heading}><div><h2 id="director-settings-title">Поручения директора</h2><p>Задачи из личного чата с ботом сразу попадают на рабочую доску.</p></div><span className={styles.badge}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 6 4 4 5-7 5 7 4-4-2 13H5L3 6Z" /><path d="M5 22h14" /></svg>Директор</span></div>
    {resource.error ? <div role="alert" className={styles.message}><p>{resource.error}</p><button type="button" onClick={() => void resource.refresh()}>Повторить загрузку</button></div> : null}
    {!resource.data && resource.loading ? <p role="status" className={styles.loading}>Загружаем настройки…</p> : null}
    {notice ? <p role="status" className={`${styles.success} ${styles.notice}`}>{notice}</p> : null}
    {resource.data ? <DirectorSettingsForm key={resource.data.settings.revision} data={resource.data} botReady={botReady} onSaved={async enabled => { setNotice(enabled ? "Сохранено. Директору нужно открыть личный чат с ботом и отправить /start." : "Постановка задач через бота отключена."); await resource.refresh(); }} /> : null}
  </section>;
}

function DirectorSettingsForm({ data, botReady, onSaved }: { data: DirectorData; botReady: boolean; onSaved: (enabled: boolean) => Promise<void> }) {
  const [userId, setUserId] = React.useState(data.settings.directorUserId ?? "");
  const [chatId, setChatId] = React.useState(data.settings.telegramChatId ?? "");
  const [boardId, setBoardId] = React.useState(data.settings.boardId ?? data.boards[0]?.id ?? "");
  const currentBoard = data.boards.find(board => board.id === boardId);
  const [columnId, setColumnId] = React.useState(data.settings.columnId ?? currentBoard?.columns[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const changed = userId !== (data.settings.directorUserId ?? "") || chatId !== (data.settings.telegramChatId ?? "") || Boolean(userId) && (boardId !== data.settings.boardId || columnId !== data.settings.columnId);
  const ready = !userId || Boolean(/^[1-9]\d{0,15}$/u.test(chatId.trim()) && currentBoard?.columns.some(column => column.id === columnId));
  const stillMounted = React.useRef(true);
  React.useEffect(() => { stillMounted.current = true; return () => { stillMounted.current = false; }; }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !ready) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await writeSettings("PATCH", { expectedRevision: data.settings.revision, directorUserId: userId || null, telegramChatId: userId ? chatId.trim() : null, boardId: userId ? boardId : null, columnId: userId ? columnId : null });
      if (!stillMounted.current) return;
      await onSaved(Boolean(userId));
    } catch (cause) { if (stillMounted.current) setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки"); }
    finally { if (stillMounted.current) setBusy(false); }
  }
  async function syncMenu() {
    if (busy) return; setBusy(true); setError(null); setMessage(null);
    try {
      await writeSettings("POST");
      if (stillMounted.current) setMessage("Меню команд подключено для личного чата директора.");
    } catch (cause) { if (stillMounted.current) setError(cause instanceof Error ? cause.message : "Не удалось подключить меню"); }
    finally { if (stillMounted.current) setBusy(false); }
  }
  return <div className={styles.content}>
    <form onSubmit={save}>
      <fieldset disabled={busy} className={styles.fields}>
        <label>Директор<select aria-label="Директор" value={userId} onChange={event => { const id = event.target.value; setUserId(id); setChatId(data.users.find(user => user.id === id)?.telegramChatId ?? ""); }}><option value="">Не назначен</option>{data.users.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
        <label>Личный Telegram ID<input aria-label="Личный Telegram ID" value={chatId} disabled={!userId} inputMode="numeric" autoComplete="off" placeholder="Например, 123456789" onChange={event => setChatId(event.target.value)} /></label>
        <label>Доска<select aria-label="Доска" value={boardId} disabled={!userId} onChange={event => { setBoardId(event.target.value); setColumnId(data.boards.find(board => board.id === event.target.value)?.columns[0]?.id ?? ""); }}><option value="">Выберите доску</option>{data.boards.map(board => <option key={board.id} value={board.id}>{board.title}</option>)}</select></label>
        <label>Входящая колонка<select aria-label="Входящая колонка" value={columnId} disabled={!userId} onChange={event => setColumnId(event.target.value)}><option value="">Выберите колонку</option>{currentBoard?.columns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
      </fieldset>
      <p className={styles.hint}>Telegram ID бот показывает в ответ на /start до подключения. Только выбранный директор сможет ставить задачи. Первая строка сообщения — название, остальные — описание.</p>
      {!botReady ? <p className={styles.warning}>Для работы поручений должны быть подключены токен бота и защищённый webhook.</p> : null}
      {!data.boards.some(board => board.columns.length) ? <p className={styles.warning}>Сначала создайте на рабочей доске хотя бы одну незавершённую колонку.</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {message ? <p role="status" className={styles.success}>{message}</p> : null}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={busy || !changed || !ready}>{busy ? "Сохраняем…" : userId ? "Сохранить назначение" : "Отключить поручения"}</button>
        <button type="button" disabled={busy || !botReady || !data.settings.directorUserId || changed} onClick={() => void syncMenu()}>Проверить меню бота</button>
      </div>
    </form>
    <aside className={styles.guide}><h3>В личном чате директора</h3><dl><div><dt>/task</dt><dd>Поставить задачу</dd></div><div><dt>/mytasks</dt><dd>Посмотреть свои поручения</dd></div><div><dt>/cancel</dt><dd>Отменить ввод</dd></div></dl><p>Поручение получает золотой цвет и постоянную метку «Директор». При переносе между колонками бот сообщает новый статус в ЛС.</p></aside>
  </div>;
}
