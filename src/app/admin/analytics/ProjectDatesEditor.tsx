"use client";

import React from "react";
import { ContextPopover } from "@/app/_ui/ContextPopover";
import { readJsonSafe } from "@/lib/fetchJson";
import type { ProjectAnalyticsRow } from "@/server/admin-analytics";
import s from "./analytics.module.css";

export function ProjectDatesEditor({ row, onSaved }: { row: ProjectAnalyticsRow; onSaved: () => void }) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [start, setStart] = React.useState(row.eventStartDate ?? row.eventEndDate ?? "");
  const [end, setEnd] = React.useState(row.eventEndDate ?? row.eventStartDate ?? "");
  const inFlight = React.useRef(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!start || !end || end < start) { setError("Укажите начало и окончание мероприятия в правильном порядке."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${row.projectId}/event-dates`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventStartDate: start, eventEndDate: end, expectedStartDate: row.eventStartDate, expectedEndDate: row.eventEndDate }) });
      const result = await readJsonSafe<{ ok?: boolean; error?: { message?: string } }>(response);
      if (!response.ok || !result?.ok) throw new Error(result?.error?.message ?? "Ответ не получен. Обновите аналитику и проверьте даты перед повторным сохранением.");
      setAnchor(null); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить даты. Обновите аналитику и проверьте результат."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (row.status !== "COMPLETED") return null;
  return <>
    <button className={s.quiet} type="button" aria-label={`Уточнить даты: ${row.title}`} onClick={event => { setStart(row.eventStartDate ?? row.eventEndDate ?? ""); setEnd(row.eventEndDate ?? row.eventStartDate ?? ""); setError(""); setAnchor(event.currentTarget); }}>Уточнить даты</button>
    {anchor ? <ContextPopover anchor={anchor} className={s.projectDates} label={`Даты мероприятия: ${row.title}`} dismissOutside={!busy} onClose={() => { if (!inFlight.current) setAnchor(null); }}>
      <header className={s.panelHeader}><h2>Когда прошло мероприятие?</h2><button className={s.quiet} type="button" disabled={busy} onClick={() => setAnchor(null)}>Закрыть</button></header>
      <p className={s.note}>{row.title}</p>
      <p className={s.note}>Дата окончания определяет период аналитики. Дату можно уточнить после закрытия — остальные данные проекта не изменятся.</p>
      <form onSubmit={save}>
        <div className={s.period}><label>Начало<input type="date" required aria-label="Начало мероприятия" value={start} disabled={busy} onChange={event => { setStart(event.target.value); if (!end || end === start || end < event.target.value) setEnd(event.target.value); }} /></label><label>Окончание<input type="date" required min={start || undefined} aria-label="Окончание мероприятия" value={end} disabled={busy} onChange={event => setEnd(event.target.value)} /></label></div>
        {error ? <p role="alert" className={s.negative}>{error}</p> : null}
        <div className={s.controls}><button className={s.primary} type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить даты"}</button><button className={s.button} type="button" disabled={busy} onClick={() => setAnchor(null)}>Отмена</button></div>
      </form>
    </ContextPopover> : null}
  </>;
}
