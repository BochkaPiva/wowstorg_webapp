"use client";

import React from "react";
import { catalogRequest } from "@/app/contractors/catalog-ui";
import { CONTRACTOR_COMMUNICATION_LABEL, CONTRACTOR_COMMUNICATION_STATUSES, type ContractorCommunicationEntry, type ContractorEntriesPayload, type ProjectContractorRow } from "@/lib/projects/project-contractors";
import styles from "./project-contractors.module.css";

export function communicationDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ContractorCommunication({ projectId, row, readOnly, refresh, close }: {
  projectId: string; row: ProjectContractorRow; readOnly: boolean; refresh: () => Promise<void>; close: () => void;
}) {
  const [entries, setEntries] = React.useState<ContractorCommunicationEntry[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [body, setBody] = React.useState("");
  const [status, setStatus] = React.useState(row.latestEntry?.status ?? "DISCUSSING");
  const [baseRevision, setBaseRevision] = React.useState(row.revision);
  const [notice, setNotice] = React.useState<string | null>(null);
  const receipt = React.useRef<{ id: string; signature: string } | null>(null);
  const sequence = React.useRef(0);
  const invalidate = React.useCallback(() => { ++sequence.current; }, []);
  const endpoint = `/api/projects/${projectId}/contractors/${row.id}/entries`;
  const load = React.useCallback((after?: string, signal?: AbortSignal) => {
    const request = ++sequence.current;
    return catalogRequest<ContractorEntriesPayload>(`${endpoint}${after ? `?cursor=${encodeURIComponent(after)}` : ""}`, { signal }).then((result) => {
      if (signal?.aborted || request !== sequence.current) return;
      setEntries((current) => after ? [...current, ...result.entries.filter((entry) => !current.some((old) => old.id === entry.id))] : result.entries);
      setCursor(result.nextCursor);
    }).catch((cause: unknown) => {
      if (!signal?.aborted && request === sequence.current) setError(cause instanceof Error ? cause.message : "Не удалось загрузить историю общения");
    }).finally(() => { if (!signal?.aborted && request === sequence.current) setLoading(false); });
  }, [endpoint]);
  React.useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => { controller.abort(); invalidate(); };
  }, [load, row.latestEntry?.id, invalidate]);
  React.useEffect(() => {
    if (!body.trim() && !busy) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    const closeGuard = (event: Event) => { if (busy || (body.trim() && !window.confirm("Продолжить без сохранения записи разговора?"))) event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    window.addEventListener("project-contractors:close", closeGuard);
    return () => { window.removeEventListener("beforeunload", guard); window.removeEventListener("project-contractors:close", closeGuard); };
  }, [body, busy]);
  const canWrite = !readOnly && row.status !== "CANCELLED";
  return <section className={styles.communication} aria-label={`Общение: ${row.name}`}>
    <div className={styles.journalHeader}><h4>Общение и договорённости</h4><button type="button" className={styles.quiet} disabled={busy} onClick={() => { if (!body.trim() || window.confirm("Закрыть журнал без сохранения записи?")) close(); }}>Свернуть</button></div>
    {canWrite ? <form className={styles.journalForm} onSubmit={async (event) => {
      event.preventDefault(); if (busy || !body.trim()) return;
      setBusy(true); setError(null); setNotice(null);
      const signature = JSON.stringify({ body: body.trim(), status });
      if (receipt.current?.signature !== signature) receipt.current = { id: crypto.randomUUID(), signature };
      try {
        await catalogRequest(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: receipt.current.id, expectedRevision: baseRevision, body: body.trim(), status }) });
        receipt.current = null; setBody(""); setNotice("Запись сохранена");
        await refresh(); await load();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить запись. Текст остался в форме."); }
      finally { setBusy(false); }
    }}>
      <label className={styles.journalBody}>Последний разговор<textarea aria-label={`Итог разговора: ${row.name}`} rows={2} required maxLength={5000} placeholder="Что обсудили, на чём остановились и какой следующий шаг" value={body} disabled={busy} onChange={(event) => { if (!body && !busy) setBaseRevision(row.revision); setBody(event.target.value); }} /></label>
      <div className={styles.journalFooter}><label>Статус общения<select aria-label={`Статус общения: ${row.name}`} value={status} disabled={busy} onChange={(event) => { if (!body) setBaseRevision(row.revision); setStatus(event.target.value as typeof status); }}>{CONTRACTOR_COMMUNICATION_STATUSES.map((value) => <option key={value} value={value}>{CONTRACTOR_COMMUNICATION_LABEL[value]}</option>)}</select></label><button type="submit" className={styles.primary} disabled={busy || !body.trim() || baseRevision !== row.revision}>{busy ? "Сохраняем…" : "Записать итог"}</button></div>
      {baseRevision !== row.revision && body.trim() ? <div className={styles.conflict} role="status">Данные подрядчика обновились. Сверьте последний разговор ниже, затем продолжите.<button type="button" className={styles.quiet} disabled={busy} onClick={() => setBaseRevision(row.revision)}>Сверил, продолжить</button></div> : null}
    </form> : null}
    {error ? <div className={styles.error} role="alert">{error}<button className={styles.quiet} type="button" disabled={loading || busy} onClick={() => { setError(null); void refresh(); void load(); }}>Обновить журнал</button></div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <ol className={styles.journalList}>{entries.map((entry) => <li key={entry.id}><div className={styles.journalMeta}><strong>{CONTRACTOR_COMMUNICATION_LABEL[entry.status]}</strong><span>{entry.author.displayName} · <time dateTime={entry.createdAt}>{communicationDate(entry.createdAt)}</time></span></div><p>{entry.body}</p></li>)}</ol>
    {loading ? <p className={styles.help} role="status">Загружаем историю…</p> : !entries.length ? <p className={styles.help}>Разговоры ещё не записаны. Итоги видны всей команде проекта, но не попадают в клиентское КП.</p> : null}
    {cursor ? <button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => { setLoading(true); void load(cursor); }}>Предыдущие записи</button> : null}
  </section>;
}
