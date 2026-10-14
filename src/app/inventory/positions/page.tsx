"use client";

import Link from "next/link";
import React from "react";
import { AppShell } from "@/app/_ui/AppShell";
import { SectionHeader } from "@/app/_ui/SectionHeader";
import { ListSkeleton } from "@/app/_ui/Skeleton";
import { ToggleSwitch } from "@/app/_ui/ToggleSwitch";
import { useAuth } from "@/app/providers";
import { useJsonResource } from "@/lib/use-json-resource";
import { readJsonSafe } from "@/lib/fetchJson";
import { PositionEditor } from "./PositionEditor";
import { PositionIcon } from "./PositionIcon";
import { availableStock, sortPositions, SORT_OPTIONS, type Position, type PositionSort } from "./position-form";
import styles from "./position-workspace.module.css";
import "../inventory.css";

export default function InventoryPositionsPage() {
  const { state } = useAuth();
  return <AppShell title="Инвентарь · Позиции">{state.status === "authenticated" ? state.user.role === "WOWSTORG" ? <PositionsWorkspace key={state.user.id} /> : <p>Этот раздел доступен только Wowstorg (склад).</p> : null}</AppShell>;
}

function PositionsWorkspace() {
  const [query, setQuery] = React.useState("");
  const [submittedQuery, setSubmittedQuery] = React.useState("");
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [visibility, setVisibility] = React.useState<"public" | "internal" | "all">("public");
  const [sort, setSort] = React.useState<PositionSort>("updated");
  const [editor, setEditor] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [savedHidden, setSavedHidden] = React.useState(false);
  React.useEffect(() => {
    if (query.trim() === submittedQuery || editor) return;
    const timer = setTimeout(() => setSubmittedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, submittedQuery, editor]);
  const search = new URLSearchParams();
  if (submittedQuery) search.set("query", submittedQuery);
  if (includeInactive) search.set("includeInactive", "true");
  if (visibility !== "all") search.set("internalOnly", String(visibility === "internal"));
  const resource = useJsonResource<{ items: Position[] }>(`/api/inventory/positions?${search}`, "Не удалось загрузить позиции.");
  const items = React.useMemo(() => sortPositions(resource.data?.items ?? [], sort), [resource.data, sort]);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  function closeEditor() { setEditor(null); trigger.current?.focus(); }
  function openEditor(value: string, button: HTMLButtonElement) { trigger.current = button; setEditor(value); setMessage(null); }
  function submitSearch(event?: React.FormEvent) { event?.preventDefault(); setSubmittedQuery(query.trim()); }
  async function saved(item: Position, created: boolean) {
    await resource.refresh(); closeEditor();
    setMessage(`«${item.name}» ${created ? "добавлена в инвентарь" : "сохранена"}.`);
    setSavedHidden(!includeInactive && !item.isActive || visibility === "public" && item.internalOnly || visibility === "internal" && !item.internalOnly || Boolean(submittedQuery) && !item.name.toLocaleLowerCase("ru").includes(submittedQuery.toLocaleLowerCase("ru")));
  }
  return <div className={`inventory-workspace ${styles.workspace}`}>
    <SectionHeader title="Позиции" description="Реквизит, цены и остатки. Редактируйте прямо в списке." mascot="inventory" actions={<div className={styles.headerActions}><button className="inv-button inv-primary" type="button" disabled={Boolean(editor)} onClick={e => openEditor("new", e.currentTarget)}><PositionIcon name="plus" />Новая позиция</button><Link href="/api/inventory/positions/export" className="inv-button">Скачать список</Link><button className="inv-button" type="button" onClick={() => void resource.refresh()} disabled={resource.loading || Boolean(editor)}>Обновить</button></div>} />
    {editor === "new" ? <div className={styles.creation}><PositionEditor internalOnly={visibility === "internal"} onCancel={closeEditor} onSaved={saved} /></div> : null}
    <div className={styles.toolbar}>
      <form className={styles.search} onSubmit={submitSearch}><PositionIcon name="search" /><input id="pos-list-search" aria-label="Поиск позиций" placeholder="Найти реквизит…" maxLength={200} value={query} disabled={Boolean(editor)} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } }} />{query ? <button type="button" aria-label="Очистить поиск" disabled={Boolean(editor)} onClick={() => { setQuery(""); setSubmittedQuery(""); }}><PositionIcon name="close" /></button> : null}<button type="submit" className={styles.searchSubmit} disabled={Boolean(editor)}>Найти</button></form>
      <div className={styles.segments} role="group" aria-label="Видимость">{([{ value: "public", label: "Каталог" }, { value: "internal", label: "Внутренние" }, { value: "all", label: "Все" }] as const).map(choice => <button key={choice.value} type="button" aria-pressed={visibility === choice.value} disabled={Boolean(editor)} onClick={() => { setSubmittedQuery(query.trim()); setVisibility(choice.value); }}>{choice.label}</button>)}</div>
      <label className={styles.sort}>Сортировка<select value={sort} disabled={Boolean(editor)} onChange={e => setSort(e.target.value as PositionSort)} aria-label="Сортировка позиций">{SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <div className={styles.inactive}><ToggleSwitch label="Неактивные" checked={includeInactive} disabled={Boolean(editor)} onChange={value => { setSubmittedQuery(query.trim()); setIncludeInactive(value); }} /></div>
    </div>
    {message ? <div className={styles.success} role="status"><span>{message}{savedHidden ? " Позиция не подходит под текущие фильтры." : ""}</span>{savedHidden ? <button type="button" className={styles.quiet} onClick={() => { setQuery(""); setSubmittedQuery(""); setVisibility("all"); setIncludeInactive(true); setSavedHidden(false); }}>Показать все</button> : null}</div> : null}
    <div className={styles.listCaption}><span>{resource.loading ? "Загружаем позиции…" : `Найдено: ${items.length}`}</span><span>Раскройте позицию для редактирования</span></div>
    {resource.loading ? <ListSkeleton rows={5} /> : resource.error ? <div className={styles.error} role="alert">{resource.error}<button type="button" className={styles.quiet} onClick={() => void resource.refresh()}>Повторить</button></div> : items.length ? <div className={styles.list}>
      <div className={styles.columns} aria-hidden="true"><span>Позиция</span><span>Исправно / всего</span><span>Аренда / сутки</span><span>Действия</span></div>
      {items.map(item => <PositionRow key={item.id} item={item} expanded={editor === item.id} otherEditor={Boolean(editor) && editor !== item.id} onEdit={button => openEditor(item.id, button)} onCancel={closeEditor} onSaved={saved} onDeleted={async () => { await resource.refresh(); setMessage(`«${item.name}» удалена.`); setSavedHidden(false); }} />)}
    </div> : <div className={styles.empty}><PositionIcon name="search" width={28} height={28} /><h2>Позиции не найдены</h2><p>{submittedQuery || visibility !== "all" || !includeInactive ? "Попробуйте другое название или измените фильтры." : "Добавьте первую позицию в инвентарь."}</p><button type="button" className={styles.secondary} disabled={Boolean(editor)} onClick={e => openEditor("new", e.currentTarget)}>Добавить позицию</button></div>}
  </div>;
}

function PositionRow({ item, expanded, otherEditor, onEdit, onCancel, onSaved, onDeleted }: {
  item: Position; expanded: boolean; otherEditor: boolean; onEdit: (button: HTMLButtonElement) => void;
  onCancel: () => void; onSaved: (item: Position, created: boolean) => Promise<void>; onDeleted: () => Promise<void>;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const alive = React.useRef(true);
  const deleting = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function remove() {
    if (deleting.current) return; deleting.current = true; setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/inventory/positions/${item.id}`, { method: "DELETE" });
      const result = await readJsonSafe<{ error?: { message?: string } }>(res);
      if (!res.ok) throw new Error(result?.error?.message ?? "Не удалось удалить позицию.");
      if (alive.current) await onDeleted();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Не удалось удалить позицию."); }
    finally { deleting.current = false; if (alive.current) setBusy(false); }
  }
  return <article className={`${styles.row} ${expanded ? styles.rowExpanded : ""}`}>
    <div className={styles.rowSummary}>
      <div className={styles.identity}><div className={styles.thumbnail}>{item.photo1Key ? <img src={`/api/inventory/positions/${item.id}/photo?w=160&v=${encodeURIComponent(item.updatedAt)}`} alt="" loading="lazy" decoding="async" /> : <PositionIcon name="photo" width={24} height={24} />}</div><div className={styles.itemCopy}><Link href={`/inventory/positions/${item.id}`}>{item.name}</Link>{item.description ? <p>{item.description}</p> : null}<div className={styles.badges}><span>{item.type === "ASSET" ? "Штучный" : item.type === "BULK" ? "Мерный" : "Расходник"}</span>{item.internalOnly ? <span>Для склада</span> : null}{!item.isActive ? <span>Неактивна</span> : null}{item.categories.slice(0, 2).map(category => category.category ? <span key={category.categoryId}>{category.category.name}</span> : null)}</div></div></div>
      <div className={styles.stock}><strong>{availableStock(item)} <span>/ {item.total}</span></strong><small>{item.inRepair + item.broken + item.missing ? `Ремонт ${item.inRepair} · Поломки ${item.broken} · Потери ${item.missing}` : "Всё исправно"}</small></div>
      <div className={styles.price}><strong>{Number(item.pricePerDay).toLocaleString("ru-RU")} ₽</strong>{item.purchasePricePerUnit != null ? <small>Закупка {Number(item.purchasePricePerUnit).toLocaleString("ru-RU")} ₽</small> : null}</div>
      <div className={styles.rowActions}><button type="button" className={styles.editButton} aria-label={`Редактировать ${item.name}`} aria-expanded={expanded} disabled={expanded || otherEditor || busy} onClick={e => { setConfirming(false); onEdit(e.currentTarget); }}><PositionIcon name="edit" /><span>Редактировать</span></button><button type="button" className={styles.iconButton} aria-label={`Удалить ${item.name}`} title="Удалить позицию" disabled={expanded || otherEditor || busy} onClick={() => { setConfirming(true); setError(null); }}><PositionIcon name="trash" /></button></div>
    </div>
    {expanded ? <PositionEditor id={item.id} onCancel={onCancel} onSaved={onSaved} /> : null}
    {confirming ? <div className={styles.deleteConfirm}><div><strong>Удалить «{item.name}»?</strong><p>Удаление доступно, если позиция ещё не используется в заявках и истории.</p>{error ? <p role="alert" className={styles.error}>{error}</p> : null}</div><button type="button" className={styles.danger} disabled={busy || otherEditor} onClick={() => void remove()}>{busy ? "Удаляем…" : "Удалить"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setConfirming(false)}>Отмена</button></div> : null}
  </article>;
}
