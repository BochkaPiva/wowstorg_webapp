"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";
import { LoadingRegion, Skeleton } from "@/app/_ui/Skeleton";
import { CONTRACTOR_PRICE_TYPE_LABEL, type ContractorPriceType } from "@/lib/contractor-offers";
import { catalogRequest, CatalogIcon, ContractorPhoto, freshnessCopy, offerPrice, seedHref, type Category, type ContractorDetail, type Offer } from "./catalog-ui";
import styles from "./contractors.module.css";

type Props = {
  kind: "view" | "create" | "category"; contractor: ContractorDetail | null; categories: Category[]; loadError: string;
  onClose: () => void; onRetry: () => void; onSaved: (id?: string, notice?: string) => void;
  dirty: React.RefObject<boolean>; saving: React.RefObject<boolean>;
};
type Edit = { kind: "contractor" } | { kind: "offer"; offer: Offer | null } | null;

export function CatalogInspector({ kind, contractor, categories, loadError, onClose, onRetry, onSaved, dirty, saving }: Props) {
  const [edit, setEdit] = React.useState<Edit>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = React.useState(0);
  const [priceType, setPriceType] = React.useState<ContractorPriceType>("FIXED");
  const [conflict, setConflict] = React.useState(false);
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function changeEdit(next: Edit) {
    if (saving.current) return;
    if (dirty.current && !window.confirm("Есть несохранённые поля. Продолжить без сохранения?")) return;
    dirty.current = false; setError(""); setEdit(next); setConflict(false);
    setPriceType(next?.kind === "offer" ? next.offer?.priceType ?? "FIXED" : "FIXED");
  }
  async function request<T>(url: string, method: string, body: unknown): Promise<T> {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) { if (response.status === 409 && method === "PATCH") setConflict(true); throw new Error(data?.error?.message ?? "Не удалось сохранить. Попробуйте ещё раз."); }
    return data as T;
  }
  async function run(action: () => Promise<void>) {
    if (saving.current || conflict) return;
    saving.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Проверьте соединение и попробуйте ещё раз."); }
    finally { saving.current = false; setBusy(false); }
  }
  function choosePhoto(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) { setError("Выберите PNG, JPEG или WebP размером до 10 МБ."); return; }
    dirty.current = true; setPhoto(file); setPreview(URL.createObjectURL(file)); setError("");
  }
  async function sendPhoto(id: string, file: File) {
    const form = new FormData(); form.set("file", file);
    await catalogRequest(`/api/contractors/${id}/assets/upload`, { method: "POST", body: form });
  }
  async function submitContractor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => {
      const payload = { name: fields.get("name"), shortDescription: fields.get("description") || null, websiteUrl: fields.get("website") || null, city: fields.get("city") || null, internalNotes: fields.get("notes") || null };
      if (kind === "create") {
        const result = await request<{ contractor: { id: string } }>("/api/contractors", "POST", { ...payload, ...(fields.get("phone") || fields.get("email") ? { contact: { personName: fields.get("person") || null, phone: fields.get("phone") || null, email: fields.get("email") || null } } : {}) });
        let notice = "Подрядчик добавлен. Теперь добавьте первую услугу.";
        if (photo) { try { await sendPhoto(result.contractor.id, photo); } catch { notice = "Карточка создана, но фото не загрузилось. Повторите загрузку в карточке — не создавайте подрядчика заново."; } }
        dirty.current = false; onSaved(result.contractor.id, notice);
      } else if (contractor) {
        await request(`/api/contractors/${contractor.id}`, "PATCH", { ...payload, expectedRevision: contractor.revision });
        dirty.current = false; setEdit(null); onSaved(contractor.id, "Карточка сохранена.");
      }
    });
  }
  async function submitCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => { await request("/api/contractor-categories", "POST", { name: fields.get("name"), description: fields.get("description") || null }); dirty.current = false; onSaved(undefined, "Категория добавлена."); });
  }
  async function submitOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!contractor || edit?.kind !== "offer") return;
    const fields = new FormData(event.currentTarget);
    const number = (key: string) => fields.get(key) == null || fields.get(key) === "" ? null : Number(fields.get(key));
    await run(async () => {
      const payload = { categoryId: fields.get("categoryId"), title: fields.get("title"), description: fields.get("description") || null, priceType, clientPrice: priceType === "ON_REQUEST" ? null : number("clientPrice"), clientPriceMax: priceType === "RANGE" ? number("clientPriceMax") : null, internalCost: number("internalCost"), unitLabel: fields.get("unitLabel") || null };
      const offer = edit.offer;
      await request(`/api/contractors/${contractor.id}/offers${offer ? `/${offer.id}` : ""}`, offer ? "PATCH" : "POST", { ...payload, ...(offer ? { expectedRevision: offer.revision } : {}) });
      dirty.current = false; setEdit(null); onSaved(contractor.id, "Услуга сохранена. Её уже можно добавить в КП.");
    });
  }
  function refreshConflict() {
    if (dirty.current && !window.confirm("Загрузить актуальную карточку? Несохранённые поля будут сброшены.")) return;
    dirty.current = false; setEdit(null); setConflict(false); setError(""); onRetry();
  }
  const editingContractor = kind === "create" || edit?.kind === "contractor";
  const editingOffer = edit?.kind === "offer";
  const title = kind === "category" ? "Новая категория" : kind === "create" ? "Новый подрядчик" : editingOffer ? edit.offer ? "Изменить услугу" : "Новая услуга" : edit ? "Редактировать карточку" : contractor?.name ?? "Карточка подрядчика";
  const currentPhoto = contractor?.photos[photoIndex]?.url ?? contractor?.photoUrl ?? null;
  return <>
    <header className={styles.inspectorHead}><div><h3>{title}</h3>{contractor && edit ? <p>{contractor.name}</p> : null}</div><button className={styles.closeButton} disabled={busy} onClick={onClose} aria-label="Закрыть карточку"><CatalogIcon kind="close" /></button></header>
    {error ? <div className={styles.error} role="alert">{error}{conflict ? <><p>Поля сохранены в форме. Не отправляем их поверх изменений коллеги.</p><button className={styles.quiet} onClick={refreshConflict}>Загрузить актуальную карточку</button></> : null}</div> : null}
    {kind === "view" && !contractor ? loadError ? <div className={styles.error} role="alert">{loadError}<button className={styles.quiet} onClick={onRetry}>Повторить</button></div> : <LoadingRegion label="Загрузка карточки подрядчика" className={styles.detailSkeleton}><Skeleton className={styles.skeletonMedia} /><Skeleton className={styles.skeletonTitle} /><Skeleton /><Skeleton /></LoadingRegion> : null}
    {kind === "category" ? <form className={styles.form} onSubmit={submitCategory} onChange={() => { dirty.current = true; }}><fieldset disabled={busy || conflict}><label>Название<input className={styles.input} name="name" minLength={2} maxLength={120} required placeholder="Например, Музыканты" /></label><label>Описание<textarea className={styles.textarea} name="description" /></label><button className={styles.primary}>{busy ? "Сохраняем…" : "Добавить категорию"}</button></fieldset></form> : null}
    {editingContractor ? <form key={kind} className={styles.form} onSubmit={submitContractor} onChange={() => { dirty.current = true; }}><fieldset disabled={busy || conflict}>
      {kind === "create" ? <label className={styles.photoPicker}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />{preview ? <Image src={preview} alt="Фото нового подрядчика" fill sizes="360px" unoptimized /> : <span className={styles.photoPlaceholder}><strong>Добавить фото</strong><small>PNG, JPEG или WebP · до 10 МБ</small></span>}</label> : null}
      <label>Название<input className={styles.input} name="name" required minLength={2} maxLength={200} defaultValue={kind === "create" ? "" : contractor?.name} /></label><label>Чем полезен<textarea className={styles.textarea} name="description" maxLength={1000} defaultValue={kind === "create" ? "" : contractor?.shortDescription ?? ""} /></label><div className={styles.formGrid}><label>Город<input className={styles.input} name="city" maxLength={120} defaultValue={kind === "create" ? "" : contractor?.city ?? ""} /></label><label>Сайт<input className={styles.input} name="website" type="url" placeholder="https://" defaultValue={kind === "create" ? "" : contractor?.websiteUrl ?? ""} /></label></div>
      {kind === "create" ? <><label>Контактное лицо<input className={styles.input} name="person" /></label><div className={styles.formGrid}><label>Телефон<input className={styles.input} name="phone" type="tel" /></label><label>Email<input className={styles.input} name="email" type="email" /></label></div></> : null}
      <label>Внутренние заметки<textarea className={styles.textarea} name="notes" maxLength={5000} defaultValue={kind === "create" ? "" : contractor?.internalNotes ?? ""} /><small>Только для команды, не попадают в клиентское КП.</small></label><div className={styles.formActions}><button className={styles.primary}>{busy ? "Сохраняем…" : kind === "create" ? "Создать карточку" : "Сохранить"}</button>{kind !== "create" ? <button className={styles.quiet} type="button" onClick={() => changeEdit(null)}>Назад</button> : null}</div>
    </fieldset></form> : null}
    {editingOffer && contractor ? <form key={edit.offer?.id ?? "new"} className={styles.form} onSubmit={submitOffer} onChange={() => { dirty.current = true; }}><fieldset disabled={busy || conflict}>
      <label>Название услуги<input className={styles.input} name="title" minLength={2} maxLength={200} required defaultValue={edit.offer?.title ?? ""} placeholder="Например, ведение корпоратива" /></label><label>Категория<select className={styles.select} name="categoryId" required defaultValue={edit.offer?.category.id ?? ""}><option value="">Выберите категорию</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Что входит<textarea className={styles.textarea} name="description" defaultValue={edit.offer?.description ?? ""} /></label><label>Как считается цена<select className={styles.select} value={priceType} onChange={(event) => setPriceType(event.target.value as ContractorPriceType)}>{Object.entries(CONTRACTOR_PRICE_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {priceType !== "ON_REQUEST" ? <div className={styles.formGrid}><label>{priceType === "FROM" || priceType === "RANGE" ? "Цена от" : "Цена клиенту"}<input className={styles.input} name="clientPrice" type="number" required min="0" step="0.01" defaultValue={edit.offer?.clientPrice ?? ""} /></label>{priceType === "RANGE" ? <label>Цена до<input className={styles.input} name="clientPriceMax" type="number" required min="0" step="0.01" defaultValue={edit.offer?.clientPriceMax ?? ""} /></label> : null}</div> : <p className={styles.help}>Цена по запросу не считается нулём. В КП будет видно, что её нужно уточнить.</p>}
      <div className={styles.formGrid}><label>Внутренняя стоимость<input className={styles.input} name="internalCost" type="number" min="0" step="0.01" defaultValue={edit.offer?.internalCost ?? ""} /></label><label>Единица<input className={styles.input} name="unitLabel" placeholder="час, человек, мероприятие" defaultValue={edit.offer?.unitLabel ?? ""} /></label></div><p className={styles.help}>Сохранение фиксирует дату подтверждения цены. Уже собранные КП не изменятся.</p><div className={styles.formActions}><button className={styles.primary}>{busy ? "Сохраняем…" : "Сохранить услугу"}</button><button className={styles.quiet} type="button" onClick={() => changeEdit(null)}>Назад</button></div>
    </fieldset></form> : null}
    {kind === "view" && contractor && !edit ? <>
      <div className={styles.detailMedia}><ContractorPhoto src={currentPhoto} name={contractor.name} /></div>
      {contractor.photos.length > 1 ? <div className={styles.galleryChoices}>{contractor.photos.map((asset, index) => <button key={asset.id} aria-pressed={index === photoIndex} onClick={() => setPhotoIndex(index)}>Фото {index + 1}</button>)}</div> : null}
      <div className={styles.detailActions}><label className={styles.secondary}>Добавить фото<input className={styles.photoInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void run(async () => { await sendPhoto(contractor.id, file); onSaved(contractor.id, "Фото добавлено."); }); }} /></label><button className={styles.quiet} disabled={busy} onClick={() => changeEdit({ kind: "contractor" })}>Редактировать</button></div>
      {contractor.shortDescription ? <p className={styles.detailDescription}>{contractor.shortDescription}</p> : null}
      <section className={styles.detailSection}><div className={styles.detailSectionHead}><h4>Услуги</h4><button className={styles.quiet} disabled={busy} onClick={() => changeEdit({ kind: "offer", offer: null })}>+ Услуга</button></div>{contractor.offers.length ? contractor.offers.map((offer) => <div key={offer.id} className={styles.detailOffer}><span className={styles.offerCategory}>{offer.category.name}</span><h5>{offer.title}</h5>{offer.description ? <p>{offer.description}</p> : null}<strong>{offerPrice(offer)}</strong><span className={styles.freshness}>{freshnessCopy(offer)}{offer.priceConfirmedAt ? ` · ${new Date(offer.priceConfirmedAt).toLocaleDateString("ru-RU")}` : ""}</span><div className={styles.detailActions}><Link className={styles.serviceAction} href={seedHref(contractor, offer)}>В новое КП</Link><button className={styles.quiet} disabled={busy} onClick={() => changeEdit({ kind: "offer", offer })}>Изменить</button></div></div>) : <p className={styles.help}>Добавьте первую услугу с ценой — её можно будет выбрать при сборке КП.</p>}</section>
      <section className={styles.detailSection}><h4>Контакты{contractor.city ? ` · ${contractor.city}` : ""}</h4>{contractor.websiteUrl ? <a className={styles.contactLink} href={contractor.websiteUrl} target="_blank" rel="noreferrer">Открыть сайт</a> : null}{contractor.contacts.map((contact) => <div className={styles.contactBlock} key={contact.id}>{contact.personName ? <strong>{contact.personName}</strong> : null}{contact.role ? <span>{contact.role}</span> : null}{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}{contact.telegram ? <span>Telegram: {contact.telegram}</span> : null}</div>)}{!contractor.contacts.length && !contractor.websiteUrl ? <p className={styles.help}>Контакты пока не заполнены.</p> : null}</section>
      {contractor.internalNotes ? <section className={styles.detailSection}><h4>Заметки команды</h4><p className={styles.detailDescription}>{contractor.internalNotes}</p></section> : null}
    </> : null}
  </>;
}
