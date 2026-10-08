"use client";

import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from "recharts";
import s from "./analytics.module.css";

export const money = (value: number) => `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
export const percent = (value: number | null) => value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
export const date = (value: string | null) => value ? new Intl.DateTimeFormat("ru-RU").format(new Date(`${value.slice(0, 10)}T00:00:00`)) : "Без даты";
export const status = (value: string) => ({ NEW: "Новая", ESTIMATE_SENT: "Смета отправлена", CHANGES: "Правки", APPROVED: "Согласована", ASSEMBLY: "Сборка", ISSUED: "Выдана", ACCEPTANCE: "Приёмка", CLOSED: "Закрыта", LEAD: "Лид", IN_PROGRESS: "В работе", COMPLETED: "Завершён", CANCELLED: "Отменён" }[value] ?? value);

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className={s.panel}><header className={s.panelHeader}><h2>{title}</h2>{action}</header><div className={s.body}>{children}</div></section>;
}
export function Metrics({ items }: { items: Array<{ label: string; value: React.ReactNode; note?: string; positive?: boolean }> }) {
  return <div className={s.metrics}>{items.map(item => <div className={s.metric} key={item.label}><span className={s.label}>{item.label}{item.note && <span className={s.metricNote}>{item.note}</span>}</span><strong className={`${s.value} ${item.positive === true ? s.positive : item.positive === false ? s.negative : ""}`}>{item.value}</strong></div>)}</div>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <div className={s.empty}>{children}</div>; }
export function Methodology({ children }: { children: React.ReactNode }) {
  return <details className={s.methodology}><summary>Как считаются показатели</summary><p className={s.note}>{children}</p></details>;
}
export function Filters({ value, onChange, items }: { value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }> }) {
  return <div className={s.filters}>{items.map(item => <button type="button" key={item.value} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}
export function Trend({ points, profitLabel = "Прибыль" }: { points: Array<{ month: string; revenue: number; profit: number }>; profitLabel?: string }) {
  if (!points.length) return <Empty>За этот период завершённых работ нет. Выберите другой период.</Empty>;
  return <><div className={s.legend}><span><i className={s.swatch} />Выручка</span><span><i className={`${s.swatch} ${s.profitSwatch}`} />{profitLabel}</span></div><div className={s.chart} role="img" aria-label={points.map(p => `${p.month}: выручка ${money(p.revenue)}, ${profitLabel.toLowerCase()} ${money(p.profit)}`).join("; ")}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={points} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="#eeecef" /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#66616d" }} tickFormatter={value => new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" }).format(new Date(`${value}-01T00:00:00`))} /><YAxis width={65} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#66616d" }} domain={["auto", "auto"]} tickFormatter={value => new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value)} /><Tooltip formatter={value => money(Number(value))} labelFormatter={value => new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(`${value}-01T00:00:00`))} /><Bar name="Выручка" dataKey="revenue" fill="#c8c4ce" maxBarSize={34} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Line name={profitLabel} dataKey="profit" type="linear" stroke="#662abb" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: "white" }} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div></>;
}
export function Sources({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const colors = ["#662abb", "#b295de", "#e9c13b", "#19806c"];
  return <div className={s.sources}>{total > 0 && rows.every(row => row.value >= 0) && <div className={s.donut} role="img" aria-label={rows.map(row => `${row.label}: ${percent(row.value / total * 100)}`).join("; ")}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="value" innerRadius="65%" outerRadius="95%" stroke="white" strokeWidth={3} isAnimationActive={false}>{rows.map((row, i) => <Cell key={row.label} fill={colors[i % colors.length]} />)}</Pie></PieChart></ResponsiveContainer><div className={s.donutTotal}>{money(total)}<span>всего</span></div></div>}<div className={s.sourceRows}>{total > 0 && rows.every(row => row.value >= 0) && <div className={s.sourceTotal}><span className={s.label}>Выручка · всего</span><strong>{money(total)}</strong></div>}{rows.map((row, i) => <div key={row.label}><span className={s.label}><i className={s.swatch} style={{ background: colors[i % colors.length], marginRight: 6 }} />{row.label}{total > 0 && rows.every(r => r.value >= 0) ? ` · ${percent(row.value / total * 100)}` : ""}</span><strong>{money(row.value)}</strong></div>)}</div></div>;
}

export type Column<T> = { key: string; label: string; render: (row: T) => React.ReactNode; sort?: (row: T) => string | number | null; numeric?: boolean; minWidth?: number };
export function SmartTable<T>({ rows, columns, rowKey, searchText, details, defaultSort, toolbar, searchLabel = "Поиск", empty = "Нет данных за этот период." }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; searchText: (row: T) => string; details?: (row: T) => React.ReactNode; defaultSort?: string; toolbar?: React.ReactNode; searchLabel?: string; empty?: string }) {
  const [query, setQuery] = React.useState("");
  const [sorting, setSorting] = React.useState({ key: defaultSort ?? "", descending: true });
  const [page, setPage] = React.useState(0);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const id = React.useId();
  const filtered = React.useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase("ru-RU").split(/\s+/).filter(Boolean);
    const accessor = columns.find(column => column.key === sorting.key)?.sort;
    const result = rows.filter(row => tokens.every(token => searchText(row).toLocaleLowerCase("ru-RU").includes(token)));
    if (accessor) result.sort((a, b) => { const left = accessor(a), right = accessor(b); if (left == null) return right == null ? 0 : 1; if (right == null) return -1; const compared = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "ru-RU"); return sorting.descending ? -compared : compared; });
    return result;
  }, [rows, columns, sorting, query, searchText]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));
  const visible = filtered.slice(currentPage * 10, currentPage * 10 + 10);
  return <><div className={s.tableToolbar}><input type="search" className={s.field} aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />{toolbar}</div>{filtered.length ? <><div className={s.tableWrap} tabIndex={0} role="region" aria-label="Таблица результатов"><table className={s.table}><thead><tr>{columns.map(column => <th key={column.key} scope="col" style={{ minWidth: column.minWidth }} className={column.numeric ? s.number : ""} aria-sort={sorting.key === column.key ? sorting.descending ? "descending" : "ascending" : undefined}>{column.sort ? <button type="button" aria-label={`Сортировать: ${column.label}`} onClick={() => { setSorting(current => ({ key: column.key, descending: current.key === column.key ? !current.descending : column.numeric === true })); setPage(0); }}>{column.label}{sorting.key === column.key && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: sorting.descending ? undefined : "rotate(180deg)" }}><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>}</button> : column.label}</th>)}{details && <th scope="col"><span className="sr-only">Подробности</span></th>}</tr></thead><tbody>{visible.map((row, index) => { const key = rowKey(row); const detailId = `${id}-${currentPage}-${index}`; return <React.Fragment key={key}><tr>{columns.map(column => <td key={column.key} style={{ minWidth: column.minWidth }} className={column.numeric ? s.number : ""}>{column.render(row)}</td>)}{details && <td><button type="button" className={s.quiet} aria-label={`${expanded === key ? "Скрыть" : "Показать"} подробности: ${searchText(row)}`} aria-expanded={expanded === key} aria-controls={expanded === key ? detailId : undefined} onClick={() => setExpanded(expanded === key ? null : key)}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: expanded === key ? "rotate(180deg)" : undefined }}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></button></td>}</tr>{details && expanded === key && <tr id={detailId}><td colSpan={columns.length + 1}><div className={s.detail}>{details(row)}</div></td></tr>}</React.Fragment>; })}</tbody></table></div><div className={s.tableFooter}><span>{currentPage * 10 + 1}–{Math.min((currentPage + 1) * 10, filtered.length)} из {filtered.length}</span><div className={s.controls}><button className={s.button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} type="button">Назад</button><button className={s.button} disabled={(currentPage + 1) * 10 >= filtered.length} onClick={() => setPage(currentPage + 1)} type="button">Далее</button></div></div></> : <Empty>{query ? "По вашему запросу ничего не найдено. Измените поиск или фильтр." : empty}</Empty>}</>;
}
