"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ArchiveControls.module.css";

type Kind = "project" | "order";
type FileInfo = { id: string; originalName: string; sizeBytes: number; createdAt: string };
type Data = { recorded: boolean; files: FileInfo[] };
type BatchedFile = FileInfo & { projectId: string | null; orderId: string | null };
type BatchedMark = { projectId: string | null; orderId: string | null; recorded: boolean };
type Pending = { kind: Kind; id: string; resolve: (value: Data) => void; reject: (error: Error) => void };
const pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
function loadRecord(kind: Kind, id: string): Promise<Data> {
  return new Promise((resolve, reject) => {
    pending.push({ kind, id, resolve, reject });
    if (timer) return;
    timer = setTimeout(() => {
      const batch = pending.splice(0); timer = undefined;
      for (let i = 0; i < batch.length; i += 200) {
        const part = batch.slice(i, i + 200);
        void fetch("/api/archive-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: part.map(({kind, id}) => ({kind, id})) }) })
          .then(async (r) => { if (!r.ok) throw new Error("Не удалось загрузить документы"); return r.json() as Promise<{ files: BatchedFile[]; marks: BatchedMark[] }>; })
          .then(({files, marks}) => part.forEach((record) => {
            const matches = (v: {projectId: string | null; orderId: string | null}) => record.kind === "project" ? v.projectId === record.id : v.orderId === record.id;
            record.resolve({ recorded: marks.find(matches)?.recorded ?? false, files: files.filter(matches) });
          })).catch((error: Error) => part.forEach((record) => record.reject(error)));
      }
    }, 0);
  });
}
async function responseError(response: Response) {
  const result = await response.json().catch(() => null);
  return result?.error?.message || "Не удалось сохранить изменения";
}
export function ArchiveControls({ kind, id }: { kind: Kind; id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<(files: FileList) => void>(() => {});
  const base = `/api/archive-records/${kind}/${encodeURIComponent(id)}`;
  useEffect(() => {
    let active = true;
    loadRecord(kind, id).then((value) => { if (active) setData(value); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [kind, id]);
  async function upload(files: FileList | File[]) {
    if (busy || !data) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch(base, { method: "POST", body: form });
        if (!response.ok) throw new Error(await responseError(response));
        const result: {file: FileInfo} = await response.json();
        setData((prev) => prev ? {...prev, files: [result.file, ...prev.files]} : prev);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить документ"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  useEffect(() => { uploadRef.current = (files) => { void upload(files); }; });
  useEffect(() => {
    const card = root.current?.closest("li.group, article.queue-order, article.work-card, section.work-progressRow");
    if (!card) return;
    const over = (event: Event) => {
      const drag = event as DragEvent;
      if (Array.from(drag.dataTransfer?.types ?? []).includes("Files")) { drag.preventDefault(); setDragging(true); }
    };
    const leave = (event: Event) => {
      if (!card.contains((event as DragEvent).relatedTarget as Node | null)) setDragging(false);
    };
    const drop = (event: Event) => {
      const drag = event as DragEvent;
      if (!drag.dataTransfer?.files.length) return;
      drag.preventDefault(); drag.stopPropagation(); setDragging(false); uploadRef.current(drag.dataTransfer.files);
    };
    card.addEventListener("dragover", over); card.addEventListener("dragleave", leave); card.addEventListener("drop", drop);
    return () => { card.removeEventListener("dragover", over); card.removeEventListener("dragleave", leave); card.removeEventListener("drop", drop); };
  }, []);
  async function mark(recorded: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({recorded}) });
      if (!response.ok) throw new Error(await responseError(response));
      setData((prev) => prev ? {...prev, recorded} : prev);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить отметку"); }
    finally { setBusy(false); }
  }
  async function remove(file: FileInfo) {
    if (!window.confirm(`Удалить документ «${file.originalName}»?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setData((prev) => prev ? {...prev, files: prev.files.filter((item) => item.id !== file.id)} : prev);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось удалить документ"); }
    finally { setBusy(false); }
  }
  return (
    <div ref={root} className={styles.root} data-dragging={dragging || undefined} data-documents={Boolean(data?.files.length) || undefined} data-recorded={data?.recorded || undefined} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); void upload(e.dataTransfer.files); }}>
      <div className={styles.bar}>
        <div className={styles.documentGroup}>
          <span className={styles.documentIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 3.75h7.5L18 8.25v11.5H6zM13.5 3.75v4.5H18M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          <span className={styles.documentText}><span className={styles.title}>Закрывающие</span><span className={styles.status}>{!data ? error ? "Нет данных" : "Загрузка…" : data.files.length ? `Документов: ${data.files.length}` : "Нет документов"}</span></span>
          <button type="button" className={styles.attach} disabled={!data || busy} onClick={() => input.current?.click()} title="Выбрать файлы или перетащить их сюда, до 4 МБ каждый" aria-label="Добавить закрывающий документ">{busy ? "…" : "+"}</button>
        </div>
        <input ref={input} className={styles.hidden} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" onChange={(e) => { if (e.target.files) void upload(e.target.files); }} />
        <label className={styles.check}><input type="checkbox" disabled={!data || busy} checked={data?.recorded ?? false} onChange={(e) => void mark(e.target.checked)} aria-label="Внесено в общую таблицу" /><span className={styles.checkIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className={styles.checkText}><span className={styles.title}>Общая таблица</span><span className={styles.status}>{!data ? error ? "Нет данных" : "Загрузка…" : data.recorded ? "Внесено" : "Не внесено"}</span></span></label>
      </div>
      {data?.files.length ? <ul className={styles.files}>{data.files.map((file) => <li key={file.id}><a href={`${base}/files/${encodeURIComponent(file.id)}`} title={`Скачать ${file.originalName}`}>{file.originalName}</a><button type="button" disabled={busy} onClick={() => void remove(file)} aria-label={`Удалить ${file.originalName}`}>×</button></li>)}</ul> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </div>
  );
}
