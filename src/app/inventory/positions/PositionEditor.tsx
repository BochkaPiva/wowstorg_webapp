"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers";
import { useReadResource } from "@/lib/use-json-resource";
import { readJsonSafe } from "@/lib/fetchJson";
import { PositionIcon } from "./PositionIcon";
import { availableStock, positionFormValues, positionPayload, type Position, type PositionData, type PositionFormValues } from "./position-form";
import styles from "./position-workspace.module.css";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await readJsonSafe<T & { error?: { message?: string } }>(response);
  if (!response.ok || !data) throw new Error(data?.error?.message ?? "Не удалось выполнить запрос. Попробуйте ещё раз.");
  return data;
}

type EditorProps = {
  id?: string; internalOnly?: boolean; onCancel: () => void;
  onSaved: (item: Position, created: boolean) => Promise<void> | void;
};
export function PositionEditor(props: EditorProps) {
  const { state } = useAuth();
  const allowed = state.status === "authenticated" && state.user.role === "WOWSTORG";
  const url = props.id ? `/api/inventory/positions/${props.id}` : "/api/inventory/positions?options=true";
  const read = React.useCallback((signal?: AbortSignal) => request<PositionData>(url, { signal }), [url]);
  const resource = useReadResource(allowed ? url : null, read, "Не удалось открыть форму.");
  if (!allowed) return null;
  if (resource.error) return <div className={styles.editor}><p role="alert" className={styles.error}>{resource.error}</p><div className={styles.formActions}><button type="button" onClick={() => void resource.refresh()} className={styles.secondary}>Попробовать снова</button><button type="button" onClick={props.onCancel} className={styles.quiet}>Закрыть</button></div></div>;
  if (!resource.data) return <div className={styles.editor} role="status">Открываем форму…</div>;
  if (props.id && !resource.data.item) return <div className={styles.editor} role="alert">Позиция не найдена.<button type="button" onClick={props.onCancel} className={styles.quiet}>Закрыть</button></div>;
  return <PositionForm key={`${props.id ?? "new"}:${resource.data.item?.updatedAt ?? "new"}`} {...props} data={resource.data} />;
}

function PositionForm({ id, internalOnly, data, onSaved, onCancel }: EditorProps & { data: PositionData }) {
  const [form, setForm] = React.useState(() => positionFormValues(data.item, internalOnly));
  const [initial] = React.useState(() => JSON.stringify(form));
  const [photo, setPhoto] = React.useState<{ file: File; url: string } | null>(null);
  const [removePhoto, setRemovePhoto] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedData, setSavedData] = React.useState(false);
  const [photoDone, setPhotoDone] = React.useState(false);
  const inputId = React.useId();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const alive = React.useRef(true);
  const flight = React.useRef(false);
  const committed = React.useRef<{ id: string; payload: string } | null>(null);
  const revision = React.useRef(data.item?.updatedAt);
  const dirty = JSON.stringify(form) !== initial || Boolean(photo) || removePhoto;
  const stock = { total: Number(form.total), inRepair: Number(form.inRepair), broken: Number(form.broken), missing: Number(form.missing) };
  const stockValid = Object.values(stock).every(value => Number.isInteger(value) && value >= 0) && stock.inRepair + stock.broken + stock.missing <= stock.total;
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update<K extends keyof PositionFormValues>(key: K, value: PositionFormValues[K]) { setForm(current => ({ ...current, [key]: value })); setError(null); }
  function toggle(key: "categoryIds" | "collectionIds", value: string) { setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(entry => entry !== value) : [...current[key], value] })); }
  function close() {
    if (busy) return;
    if ((dirty || committed.current && !id) && !window.confirm(committed.current && !id ? "Позиция уже создана. Закрыть форму?" : "Закрыть форму без сохранения изменений?")) return;
    onCancel();
  }
  function choosePhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Выберите JPG, PNG, WebP или GIF размером до 5 МБ."); return; }
    setPhoto({ file, url: URL.createObjectURL(file) }); setRemovePhoto(false); setPhotoDone(false); setError(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (flight.current) return;
    let payload: ReturnType<typeof positionPayload>;
    try { payload = positionPayload(form); } catch (cause) { setError(cause instanceof Error ? cause.message : "Проверьте поля формы."); return; }
    flight.current = true; setBusy(true); setError(null);
    try {
      const serialized = JSON.stringify(payload);
      let target = committed.current?.id ?? id;
      if (committed.current?.payload !== serialized) {
        if (committed.current) {
          const latest = await request<PositionData>(`/api/inventory/positions/${target}`);
          if (!latest.item) throw new Error("Позиция больше недоступна.");
          // Preserve the revision acknowledged by our previous write. Do not silently accept another editor's changes.
          if (revision.current && latest.item.updatedAt !== revision.current) throw new Error("Карточка уже изменилась. Закройте и откройте форму заново перед сохранением.");
          revision.current = latest.item.updatedAt;
        }
        const result = await request<{ id?: string; updatedAt?: string }>(target ? `/api/inventory/positions/${target}` : "/api/inventory/positions", {
          method: target ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, ...(target ? { expectedUpdatedAt: revision.current } : {}) }),
        });
        target = target ?? result.id;
        if (!target) throw new Error("Сервер не подтвердил создание позиции. Обновите список перед повтором.");
        committed.current = { id: target, payload: serialized };
        revision.current = result.updatedAt;
        if (alive.current) setSavedData(true);
      }
      if (!target) throw new Error("Позиция не найдена.");
      if ((photo || removePhoto) && !photoDone) {
        const body = new FormData(); if (photo) body.set("file", photo.file);
        await request(`/api/inventory/positions/${target}/photo`, photo ? { method: "POST", body } : { method: "DELETE" });
        if (alive.current) setPhotoDone(true);
      }
      const latest = await request<PositionData>(`/api/inventory/positions/${target}`);
      if (!latest.item) throw new Error("Данные сохранены, но список не удалось обновить. Повторите сохранение.");
      revision.current = latest.item.updatedAt;
      if (alive.current) await onSaved(latest.item, !id);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Не удалось сохранить. Попробуйте ещё раз."); }
    finally { flight.current = false; if (alive.current) setBusy(false); }
  }
  const photoSrc = photo?.url ?? (!removePhoto && data.item?.photo1Key ? `/api/inventory/positions/${data.item.id}/photo?w=320&v=${encodeURIComponent(data.item.updatedAt)}` : null);
  const prefix = (field: string) => `${inputId}-${field}`;
  return <form className={styles.editor} onSubmit={save} aria-label={id ? `Редактирование: ${data.item?.name}` : "Новая позиция"}>
    <div className={styles.editorHeading}><div><h2>{id ? "Редактировать позицию" : "Новая позиция"}</h2><p>{id ? "Изменения появятся в списке после сохранения." : "Заполните карточку и добавьте её в инвентарь."}</p></div><button type="button" className={styles.iconButton} onClick={close} disabled={busy} aria-label="Закрыть форму"><PositionIcon name="close" /></button></div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {savedData && error ? <p role="status" className={styles.hint}>Данные позиции уже сохранены. Повторная попытка продолжит сохранение этой же позиции.</p> : null}
    <fieldset disabled={busy} className={styles.formLayout}>
      <div className={styles.mainFields}>
        <div className={styles.fields}>
          <label className={styles.full} htmlFor={prefix("name")}>Название<input id={prefix("name")} autoFocus value={form.name} onChange={e => update("name", e.target.value)} required maxLength={200} placeholder="Например, стул складной" /></label>
          <label className={styles.full} htmlFor={prefix("description")}>Описание<textarea id={prefix("description")} value={form.description} onChange={e => update("description", e.target.value)} maxLength={4000} rows={3} placeholder="Размеры, материал, комплектация…" /></label>
          <label htmlFor={prefix("type")}>Тип позиции<select id={prefix("type")} value={form.type} onChange={e => update("type", e.target.value as PositionFormValues["type"])}><option value="ASSET">Штучный</option><option value="BULK">Мерный</option><option value="CONSUMABLE">Расходник</option></select></label>
          <label htmlFor={prefix("price")}>Цена аренды / сутки, ₽<input id={prefix("price")} inputMode="decimal" value={form.pricePerDay} onChange={e => update("pricePerDay", e.target.value)} required placeholder="0" /></label>
          <label htmlFor={prefix("purchase")}>Закупка / единицу, ₽<input id={prefix("purchase")} inputMode="decimal" value={form.purchasePricePerUnit} onChange={e => update("purchasePricePerUnit", e.target.value)} placeholder="Не указана" /></label>
        </div>
        <section className={styles.stockSection} aria-labelledby={prefix("stock-title")}><div className={styles.sectionHeading}><h3 id={prefix("stock-title")}>Склад и остатки</h3><span>Исправно: <strong>{stockValid ? availableStock(stock) : "—"}</strong></span></div>
          <div className={styles.stockFields}>{([{ key: "total", label: "Всего" }, { key: "inRepair", label: "В ремонте" }, { key: "broken", label: "Сломано" }, { key: "missing", label: "Утеряно" }] as const).map(field => <label key={field.key} htmlFor={prefix(field.key)}>{field.label}<input id={prefix(field.key)} value={form[field.key]} onChange={e => update(field.key, e.target.value)} type="number" min="0" step="1" required /></label>)}</div>
          {id && data.item && data.item.inRepair + data.item.broken + data.item.missing > 0 ? <p className={styles.hint}>Возврат из ремонта и найденное имущество оформляются в <Link href="/inventory/repair">ремонте</Link> и <Link href="/inventory/losses">утерянном</Link>.</p> : null}
        </section>
        <details className={styles.associations} open={form.categoryIds.length > 0 || undefined}><summary>Категории <span>{form.categoryIds.length || "Не выбраны"}</span><PositionIcon name="chevron" /></summary><div className={styles.choices}>{(data.categories ?? []).length ? data.categories.map(choice => <label key={choice.id}><input type="checkbox" checked={form.categoryIds.includes(choice.id)} onChange={() => toggle("categoryIds", choice.id)} /><span>{choice.name}</span></label>) : <p className={styles.hint}>Категорий пока нет.</p>}</div></details>
        {(data.collections ?? []).length ? <details className={styles.associations}><summary>Подборки <span>{form.collectionIds.length || "Не выбраны"}</span><PositionIcon name="chevron" /></summary><div className={styles.choices}>{data.collections.map(choice => <label key={choice.id}><input type="checkbox" checked={form.collectionIds.includes(choice.id)} onChange={() => toggle("collectionIds", choice.id)} /><span>{choice.name}{choice.isActive === false ? " · неактивная" : ""}</span></label>)}</div></details> : null}
      </div>
      <aside className={styles.sideFields}>
        <section className={styles.photoSection}><h3>Фото позиции</h3><div className={styles.photoPreview}>{photoSrc ? <img src={photoSrc} alt="Фото позиции" /> : <PositionIcon name="photo" width={36} height={36} />}</div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={e => { choosePhoto(e.target.files?.[0]); e.target.value = ""; }} /><div className={styles.photoActions}><button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>{photoSrc ? "Заменить фото" : "Добавить фото"}</button>{photoSrc ? <button type="button" className={styles.iconButton} aria-label="Убрать фото" onClick={() => { setPhoto(null); setRemovePhoto(Boolean(data.item?.photo1Key)); setPhotoDone(false); }}><PositionIcon name="trash" /></button> : null}</div><p className={styles.hint}>{photo ? photo.file.name : "JPG, PNG, WebP, GIF · до 5 МБ"}</p></section>
        <section className={styles.visibility}><h3>Видимость</h3><label><input type="checkbox" checked={form.isActive} onChange={e => update("isActive", e.target.checked)} /><span><strong>Позиция активна</strong><small>Доступна для новых заявок</small></span></label><label><input type="checkbox" checked={form.internalOnly} onChange={e => update("internalOnly", e.target.checked)} /><span><strong>Только для склада</strong><small>Скрыта в каталоге Grinvich</small></span></label></section>
      </aside>
    </fieldset>
    <div className={styles.formActions}><button type="submit" className={styles.primary} disabled={busy || Boolean(id) && !dirty && !savedData}>{busy ? "Сохраняем…" : id || savedData ? "Сохранить" : "Добавить позицию"}</button><button type="button" className={styles.quiet} onClick={close} disabled={busy}>Отмена</button>{id ? <Link className={styles.cardLink} href={`/inventory/positions/${id}`} onClick={e => { if (dirty && !window.confirm("Перейти в карточку без сохранения изменений?")) e.preventDefault(); }}>Открыть полную карточку</Link> : <span className={styles.hint}>Сохранение вернёт вас к списку</span>}</div>
  </form>;
}
