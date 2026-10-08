"use client";

import Link from "next/link";
import React from "react";
import { DashboardSkeleton } from "@/app/_ui/Skeleton";
import { Column, date, Empty, Filters, Metrics, money, Panel, SmartTable } from "./AnalyticsUI";
import s from "./analytics.module.css";

type Row = { id?: string; rowNumber: number; projectName: string; revenue: number; expenses: number; profit: number; marginPercent: number; bonusPool: number; matchStatus: "MATCHED" | "UNMATCHED" | "CONFLICT" | "IGNORED"; matchedEntityType: "PROJECT" | "ORDER" | null; matchedEntityId: string | null; matchNote: string | null };
type Totals = { revenue: number; expenses: number; profit: number; bonusPool: number };
type Batch = { id: string; title: string; sourceFileName: string; sheetName: string; periodStart: string; periodEnd: string; createdAt: string; _count: { rows: number } };
type Selected = Batch & { rows: Row[]; summary: { external: Totals; site: Totals; delta: Totals; matched: number; conflicts: number; unmatched: number } };
type Preview = { fileName: string; sheetName: string; rows: Row[]; totals: Totals; matched: number; conflicts: number; unmatched: number };
const labels = { MATCHED: "Сопоставлено", UNMATCHED: "Не найдено", CONFLICT: "Конфликт", IGNORED: "Пропущено" };

export function AnalyticsReconciliation({ scope }: { scope: { from: string; to: string } }) {
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [selected, setSelected] = React.useState<Selected | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("Сверка");
  const [preview, setPreview] = React.useState<{ data: Preview; context: string; period: typeof scope } | null>(null);
  const [busy, setBusy] = React.useState<"load" | "preview" | "commit" | null>("load");
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("all");
  const [commitUncertain, setCommitUncertain] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  const mounted = React.useRef(true);
  const context = JSON.stringify([scope.from, scope.to, title.trim(), file?.name, file?.size, file?.lastModified]);
  const load = React.useCallback(async (id?: string) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setBusy("load"); setError(null);
    try {
      const response = await fetch(`/api/admin/analytics/reconciliation?${new URLSearchParams(id ? { id } : {})}`, { cache: "no-store", signal: request.signal });
      const result = await response.json().catch(() => null) as { batches?: Batch[]; selected?: Selected | null; error?: { message?: string } } | null;
      if (!response.ok || !result) throw new Error(result?.error?.message ?? "Не удалось загрузить сверки.");
      if (request.signal.aborted) return;
      setBatches(result.batches ?? []); setSelected(result.selected ?? null);
    } catch (reason) { if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : "Ошибка загрузки."); }
    finally { if (!request.signal.aborted) setBusy(null); }
  }, []);
  React.useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; controller.current?.abort(); }; }, [load]);
  async function submit(mode: "preview" | "commit") {
    if (!file || busy || mode === "commit" && (!preview || preview.context !== context || commitUncertain)) return;
    const request = new AbortController(); controller.current?.abort(); controller.current = request;
    setBusy(mode); setError(null);
    let received = false;
    try {
      const form = new FormData(); form.set("file", file); form.set("title", title.trim() || file.name.replace(/\.[^.]+$/, "")); form.set("from", scope.from); form.set("to", scope.to); form.set("mode", mode);
      const response = await fetch("/api/admin/analytics/reconciliation", { method: "POST", body: form, signal: request.signal });
      const result = await response.json().catch(() => null) as { preview?: Preview; batchId?: string; error?: { message?: string } } | null;
      received = !!result;
      if (!response.ok || !result) throw new Error(result?.error?.message ?? "Ответ сервера не получен.");
      if (!mounted.current) return;
      if (mode === "preview") {
        if (!result.preview) throw new Error("Сервер не вернул предварительную сверку.");
        setPreview({ data: result.preview, context, period: { ...scope } }); setCommitUncertain(false);
      } else {
        if (!result.batchId) { received = false; throw new Error("Не удалось подтвердить сохранение снимка."); }
        setPreview(null); await load(result.batchId);
      }
    } catch (reason) {
      if (!mounted.current || request.signal.aborted) return;
      if (mode === "commit" && !received) { setCommitUncertain(true); setError("Сохранение не подтверждено. Обновите список снимков и проверьте его перед повторным импортом — снимок мог сохраниться."); }
      else setError(reason instanceof Error ? reason.message : "Не удалось обработать Excel.");
    } finally { if (mounted.current) setBusy(null); }
  }
  const visiblePreview = preview?.data;
  const rows = visiblePreview?.rows ?? selected?.rows ?? [];
  const filtered = rows.filter(row => filter === "all" || row.matchStatus === filter);
  const columns: Column<Row>[] = [
    { key: "row", label: "Строка", numeric: true, sort: row => row.rowNumber, render: row => row.rowNumber },
    { key: "name", label: "Проект / заявка", minWidth: 190, sort: row => row.projectName, render: row => row.matchedEntityId && row.matchedEntityType ? <Link className={s.cellTitle} href={`/${row.matchedEntityType === "PROJECT" ? "projects" : "orders"}/${row.matchedEntityId}`}>{row.projectName || "Без названия"}</Link> : <strong>{row.projectName || "Без названия"}</strong> },
    { key: "revenue", label: "Выручка", numeric: true, sort: row => row.revenue, render: row => money(row.revenue) },
    { key: "profit", label: "Прибыль в файле", numeric: true, sort: row => row.profit, render: row => money(row.profit) },
    { key: "status", label: "Сопоставление", sort: row => labels[row.matchStatus], render: row => <span className={`${s.badge} ${row.matchStatus === "CONFLICT" || row.matchStatus === "UNMATCHED" ? s.warning : ""}`}>{labels[row.matchStatus]}</span> },
  ];
  return <div className={s.stack}><Panel title="Сверка с Excel" action={<button className={s.quiet} type="button" disabled={busy != null} onClick={() => void load()}>Обновить снимки</button>}><p className={s.note}>Предпросмотр сопоставляет строки. Сохранение создаёт отдельный снимок и не меняет проекты, заявки или сметы.</p><div className={s.importFields}><label>Название<input className={s.field} value={title} disabled={busy != null} onChange={event => setTitle(event.target.value)} /></label><label>Файл Excel<input className={s.field} type="file" accept=".xlsx,.xls" disabled={busy != null} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} /></label><label>Сохранённый снимок<select className={s.field} disabled={busy != null} value={selected?.id ?? ""} onChange={event => { setPreview(null); setFilter("all"); if (event.target.value) void load(event.target.value); else setSelected(null); }}><option value="">Выбрать снимок</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.title} · {date(batch.periodStart)} — {date(batch.periodEnd)}</option>)}</select></label></div><div className={s.controls}><button className={s.button} type="button" disabled={!file || busy != null || commitUncertain} onClick={() => void submit("preview")}>{busy === "preview" ? "Проверяем…" : "Проверить файл"}</button>{preview && <button className={s.primary} type="button" disabled={busy != null || preview.context !== context || commitUncertain} onClick={() => void submit("commit")}>{busy === "commit" ? "Сохраняем…" : "Сохранить снимок"}</button>}<span className={s.note}>Импорт за {date(scope.from)} — {date(scope.to)}</span></div>{preview && preview.context !== context && <p className={s.note}>Параметры изменились. Проверьте файл повторно, прежде чем сохранять.</p>}{error && <div className={s.error} role="alert">{error}</div>}</Panel>{busy === "load" ? <DashboardSkeleton /> : !visiblePreview && !selected ? <Empty>Загрузите Excel или выберите сохранённый снимок.</Empty> : <><Metrics items={[{ label: "Строк в файле", value: rows.length }, { label: "Сопоставлено", value: rows.filter(row => row.matchStatus === "MATCHED").length }, { label: "Нужна проверка", value: rows.filter(row => row.matchStatus === "CONFLICT" || row.matchStatus === "UNMATCHED").length }, { label: "Пропущено", value: rows.filter(row => row.matchStatus === "IGNORED").length }]} />{selected && !visiblePreview && <Panel title="Разница с сайтом"><p className={s.note}>Период снимка: {date(selected.periodStart)} — {date(selected.periodEnd)}. Сравниваются все строки файла и весь факт сайта за этот период — не только сопоставленные работы.</p><div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">Показатель</th><th scope="col" className={s.number}>Excel</th><th scope="col" className={s.number}>Весь факт сайта</th><th scope="col" className={s.number}>Excel − сайт</th></tr></thead><tbody>{(["revenue", "expenses", "profit", "bonusPool"] as const).map(key => <tr key={key}><td>{{ revenue: "Выручка", expenses: "Расходы", profit: "Прибыль", bonusPool: "Бонусный пул" }[key]}</td><td className={s.number}>{money(selected.summary.external[key])}</td><td className={s.number}>{money(selected.summary.site[key])}</td><td className={`${s.number} ${Math.abs(selected.summary.delta[key]) > 1 ? s.negative : s.positive}`}>{money(selected.summary.delta[key])}</td></tr>)}</tbody></table></div><p className={s.note}>{selected.title} · {date(selected.periodStart)} — {date(selected.periodEnd)}</p></Panel>}<Panel title={visiblePreview ? "Предварительное сопоставление" : "Строки снимка"}><SmartTable rows={filtered} columns={columns} rowKey={row => row.id ?? String(row.rowNumber)} searchText={row => row.projectName} searchLabel="Найти строку по названию" toolbar={<Filters value={filter} onChange={setFilter} items={[{ value: "all", label: "Все" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} />} details={row => <><div><span className={s.label}>Расходы</span><strong>{money(row.expenses)}</strong></div><div><span className={s.label}>Бонусный пул</span><strong>{money(row.bonusPool)}</strong></div><div><span className={s.label}>Результат сопоставления</span>{row.matchNote ?? labels[row.matchStatus]}</div></>} /><p className={s.note}>{visiblePreview ? `${visiblePreview.fileName} · ${visiblePreview.sheetName} · ${date(preview!.period.from)} — ${date(preview!.period.to)}` : `${selected?.sourceFileName} · ${selected?.sheetName}`}</p></Panel></>}</div>;
}
