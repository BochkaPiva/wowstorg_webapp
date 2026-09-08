"use client";

import Image from "next/image";
import React from "react";

import { AppShell } from "@/app/_ui/AppShell";
import { CONTRACTOR_PRICE_TYPE_LABEL, priceFreshness, type ContractorPriceType } from "@/lib/contractor-offers";
import styles from "./contractors.module.css";

type Category = { id: string; name: string; description: string | null; sortOrder: number; _count?: { offers: number } };
type Offer = { id: string; title: string; description: string | null; priceType: ContractorPriceType; clientPrice: number | null; clientPriceMax: number | null; internalCost: number | null; currencyCode: string; unitLabel: string | null; priceConfirmedAt: string | null; validUntil: string | null; isActive: boolean; revision: number; category: { id: string; name: string } };
type Contractor = { id: string; name: string; shortDescription: string | null; websiteUrl: string | null; city: string | null; internalNotes: string | null; isActive: boolean; revision: number; updatedAt: string; photoUrl: string | null; contacts: Array<{ id: string; personName: string | null; role: string | null; phone: string | null; email: string | null; telegram: string | null; isPrimary: boolean }>; offers: Offer[] };

function money(value: number | null) { return value == null ? "По запросу" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value); }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU"); }
function offerPrice(offer: Offer) {
  if (offer.priceType === "ON_REQUEST") return "По запросу";
  const base = money(offer.clientPrice);
  if (offer.priceType === "FROM") return `от ${base}`;
  if (offer.priceType === "RANGE" && offer.clientPriceMax != null) return `${base} — ${money(offer.clientPriceMax)}`;
  return offer.unitLabel ? `${base} / ${offer.unitLabel}` : base;
}
function freshnessCopy(value: ReturnType<typeof priceFreshness>) {
  if (value === "FRESH") return "Актуально";
  if (value === "AGING") return "Пора проверить";
  if (value === "STALE") return "Устарело";
  return "Не подтверждено";
}
async function readError(response: Response) { const body = await response.json().catch(() => null) as { error?: { message?: string } } | null; return body?.error?.message ?? "Не удалось выполнить действие"; }

function ContractorPhoto({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <span className={styles.cardMonogram}>{initials(name)}</span>;
  return <Image src={src} alt="" fill sizes="(max-width: 720px) 100vw, 420px" unoptimized onError={() => setFailed(true)} />;
}

export default function ContractorsPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [contractors, setContractors] = React.useState<Contractor[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [modal, setModal] = React.useState<"contractor" | "category" | "offer" | null>(null);
  const [editingOffer, setEditingOffer] = React.useState<Offer | null>(null);
  const [contractorPhoto, setContractorPhoto] = React.useState<File | null>(null);
  const [contractorPhotoPreview, setContractorPhotoPreview] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [categoriesResponse, contractorsResponse] = await Promise.all([
      fetch("/api/contractor-categories", { cache: "no-store" }),
      fetch("/api/contractors", { cache: "no-store" }),
    ]);
    if (!categoriesResponse.ok || !contractorsResponse.ok) throw new Error("Не удалось загрузить каталог");
    const categoriesData = await categoriesResponse.json() as { categories: Category[] };
    const contractorsData = await contractorsResponse.json() as { contractors: Contractor[] };
    setCategories(categoriesData.categories); setContractors(contractorsData.contractors);
    setSelectedId((current) => current && contractorsData.contractors.some((item) => item.id === current) ? current : contractorsData.contractors[0]?.id ?? null);
  }, []);

  React.useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Ошибка загрузки")); }, [load]);
  const filtered = contractors.filter((contractor) => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    return (!needle || `${contractor.name} ${contractor.shortDescription ?? ""} ${contractor.offers.map((offer) => offer.title).join(" ")}`.toLocaleLowerCase("ru-RU").includes(needle))
      && (!categoryId || contractor.offers.some((offer) => offer.category.id === categoryId));
  });
  const selected = contractors.find((contractor) => contractor.id === selectedId) ?? null;

  React.useEffect(() => () => {
    if (contractorPhotoPreview) URL.revokeObjectURL(contractorPhotoPreview);
  }, [contractorPhotoPreview]);

  function closeModal() {
    setModal(null);
    setEditingOffer(null);
    setError(null);
    setContractorPhoto(null);
    setContractorPhotoPreview(null);
  }

  function chooseContractorPhoto(file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Для фотографии подойдут PNG, JPEG или WebP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Фотография должна быть не больше 10 МБ");
      return;
    }
    setError(null);
    setContractorPhoto(file);
    setContractorPhotoPreview(URL.createObjectURL(file));
  }

  async function submitContractor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/contractors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        name: data.get("name"), shortDescription: data.get("description") || null, websiteUrl: data.get("website") || null, city: data.get("city") || null,
        contact: data.get("phone") || data.get("email") ? { personName: data.get("person") || null, phone: data.get("phone") || null, email: data.get("email") || null } : undefined,
      }) });
      if (!response.ok) { setError(await readError(response)); return; }
      const body = await response.json() as { contractor: { id: string } };
      let photoError: string | null = null;
      if (contractorPhoto) {
        const photoForm = new FormData();
        photoForm.set("file", contractorPhoto);
        const photoResponse = await fetch(`/api/contractors/${body.contractor.id}/assets/upload`, { method: "POST", body: photoForm });
        if (!photoResponse.ok) photoError = await readError(photoResponse);
      }
      await load();
      setSelectedId(body.contractor.id);
      setModal(null);
      setContractorPhoto(null);
      setContractorPhotoPreview(null);
      if (photoError) setError(`Карточка создана, но фотография не загрузилась: ${photoError}`);
    } catch {
      setError("Не удалось создать карточку. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    const response = await fetch("/api/contractor-categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), description: data.get("description") || null }) });
    if (!response.ok) { setError(await readError(response)); setBusy(false); return; }
    await load(); setModal(null); setBusy(false);
  }

  async function submitOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    const priceType = String(data.get("priceType")) as ContractorPriceType;
    const toNumber = (key: string) => data.get(key) === "" ? null : Number(data.get(key));
    const offerPayload = {
      categoryId: data.get("categoryId"), title: data.get("title"), description: data.get("description") || null, priceType,
      clientPrice: toNumber("clientPrice"), clientPriceMax: toNumber("clientPriceMax"), internalCost: toNumber("internalCost"), unitLabel: data.get("unitLabel") || null,
    };
    const response = await fetch(editingOffer ? `/api/contractors/${selected.id}/offers/${editingOffer.id}` : `/api/contractors/${selected.id}/offers`, { method: editingOffer ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editingOffer ? { ...offerPayload, expectedRevision: editingOffer.revision } : offerPayload) });
    if (!response.ok) { setError(await readError(response)); setBusy(false); return; }
    await load(); setModal(null); setEditingOffer(null); setBusy(false);
  }

  async function uploadPhoto(contractorId: string, file: File) {
    setBusy(true); setError(null); const form = new FormData(); form.set("file", file);
    const response = await fetch(`/api/contractors/${contractorId}/assets/upload`, { method: "POST", body: form });
    if (!response.ok) setError(await readError(response)); else await load();
    setBusy(false);
  }

  async function confirmOffer(contractorId: string, offer: Offer) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/contractors/${contractorId}/offers/${offer.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: offer.revision, confirmPrice: true }) });
    if (!response.ok) setError(await readError(response)); else await load();
    setBusy(false);
  }

  return <AppShell title="Подрядчики">
    <div className={styles.page}>
      <section className={styles.hero}>
        <div><h2>Подрядчики и услуги</h2><p>Фото, предложения и актуальные цены в одном каталоге. Всё, что видно здесь, доступно в конструкторе проекта.</p></div>
        <div className={styles.heroActions}><button className={styles.secondary} onClick={() => setModal("category")}>Новая категория</button><button className={styles.primary} onClick={() => setModal("contractor")}>Добавить подрядчика</button></div>
      </section>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <section className={styles.toolbar}>
        <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, услуга или специализация" aria-label="Поиск подрядчиков" />
        <div className={styles.chips}><button className={styles.chip} data-active={!categoryId} onClick={() => setCategoryId("")}>Все</button>{categories.map((category) => <button key={category.id} className={styles.chip} data-active={category.id === categoryId} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div>
      </section>
      <div className={styles.catalogSummary}><strong>{filtered.length}</strong><span>{filtered.length === 1 ? "подрядчик" : "подрядчиков"}</span><span>·</span><span>{filtered.reduce((sum, contractor) => sum + contractor.offers.length, 0)} предложений</span></div>
      {filtered.length ? <section className={styles.catalogGrid} aria-label="Каталог подрядчиков">
        {filtered.map((contractor) => <article key={contractor.id} className={styles.contractorCard}>
          <div className={styles.cardMedia}>
            <ContractorPhoto src={contractor.photoUrl} name={contractor.name} />
            <label className={styles.changePhoto} title="Заменить фотографию">
              <span>{contractor.photoUrl ? "Заменить фото" : "Добавить фото"}</span>
              <input className={styles.photoInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(contractor.id, file); event.currentTarget.value = ""; }} />
            </label>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.cardHead}>
              <div><h3>{contractor.name}</h3><p>{contractor.shortDescription || "Описание пока не добавлено"}</p></div>
              {contractor.city ? <span className={styles.city}>{contractor.city}</span> : null}
            </div>
            <div className={styles.contacts}>
              {contractor.websiteUrl ? <a href={contractor.websiteUrl} target="_blank" rel="noreferrer">Сайт ↗</a> : null}
              {contractor.contacts[0]?.phone ? <a href={`tel:${contractor.contacts[0].phone}`}>{contractor.contacts[0].phone}</a> : null}
              {contractor.contacts[0]?.email ? <a href={`mailto:${contractor.contacts[0].email}`}>Email</a> : null}
            </div>
            <div className={styles.offerList}>
              {contractor.offers.length ? contractor.offers.map((offer) => {
                const freshness = priceFreshness(offer.priceConfirmedAt);
                return <div key={offer.id} className={styles.offerRow}>
                  <button className={styles.offerMain} type="button" onClick={() => { setSelectedId(contractor.id); setEditingOffer(offer); setModal("offer"); }}>
                    <span className={styles.offerCategory}>{offer.category.name}</span>
                    <strong>{offer.title}</strong>
                    {offer.description ? <span className={styles.offerDescription}>{offer.description}</span> : null}
                  </button>
                  <div className={styles.offerSide}>
                    <strong>{offerPrice(offer)}</strong>
                    <span className={styles.freshness} data-state={freshness}>{freshnessCopy(freshness)}</span>
                    {freshness !== "FRESH" ? <button className={styles.confirmPrice} disabled={busy} onClick={() => void confirmOffer(contractor.id, offer)}>Подтвердить цену</button> : null}
                  </div>
                </div>;
              }) : <div className={styles.noOffers}><span>Услуг пока нет</span><button onClick={() => { setSelectedId(contractor.id); setEditingOffer(null); setModal("offer"); }}>Добавить первую</button></div>}
            </div>
            <button className={styles.addOfferButton} onClick={() => { setSelectedId(contractor.id); setEditingOffer(null); setModal("offer"); }}>+ Добавить услугу</button>
          </div>
        </article>)}
      </section> : <div className={styles.catalogEmpty}><strong>Ничего не найдено</strong><span>Измените запрос или выберите другую категорию.</span></div>}
    </div>
    {modal ? <div className={styles.modal} role="dialog" aria-modal="true"><div className={styles.dialog}><div className={styles.dialogHead}><div><h3>{modal === "contractor" ? "Новый подрядчик" : modal === "category" ? "Новая категория" : `${editingOffer ? "Изменить услугу" : "Новая услуга"} · ${selected?.name}`}</h3>{modal === "contractor" ? <p>Контакты и фотография сразу попадут в каталог проекта.</p> : null}</div><button className={styles.closeButton} type="button" aria-label="Закрыть" onClick={closeModal}>×</button></div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {modal === "contractor" ? <form className={styles.form} onSubmit={submitContractor}><label className={styles.photoPicker}><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { chooseContractorPhoto(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />{contractorPhotoPreview ? <Image src={contractorPhotoPreview} alt="Предпросмотр фотографии подрядчика" fill sizes="112px" unoptimized /> : <span className={styles.photoPlaceholder}><span className={styles.photoPlus}>+</span><strong>Добавить фото</strong><small>PNG, JPEG или WebP · до 10 МБ</small></span>}<span className={styles.photoEdit}>{contractorPhotoPreview ? "Заменить" : "Выбрать"}</span></label><label>Название<input className={styles.input} name="name" required autoFocus /></label><label>Чем полезен<textarea className={styles.textarea} name="description" /></label><div className={styles.formGrid}><label>Город<input className={styles.input} name="city" /></label><label>Сайт<input className={styles.input} name="website" type="url" placeholder="https://" /></label><label>Контактное лицо<input className={styles.input} name="person" /></label><label>Телефон<input className={styles.input} name="phone" /></label></div><label>Email<input className={styles.input} name="email" type="email" /></label><button className={styles.primary} disabled={busy}>{busy ? contractorPhoto ? "Создаю и загружаю фото…" : "Создаю…" : "Создать карточку"}</button></form> : null}
      {modal === "category" ? <form className={styles.form} onSubmit={submitCategory}><label>Название<input className={styles.input} name="name" required placeholder="Например, Ведущие" /></label><label>Описание<textarea className={styles.textarea} name="description" /></label><button className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : "Добавить категорию"}</button></form> : null}
      {modal === "offer" ? <form key={editingOffer?.id ?? "new-offer"} className={styles.form} onSubmit={submitOffer}><div className={styles.formGrid}><label>Категория<select className={styles.select} name="categoryId" required defaultValue={editingOffer?.category.id ?? ""}><option value="">Выберите</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Модель цены<select className={styles.select} name="priceType" defaultValue={editingOffer?.priceType ?? "FIXED"}>{Object.entries(CONTRACTOR_PRICE_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>Название услуги<input className={styles.input} name="title" required defaultValue={editingOffer?.title ?? ""} /></label><label>Что входит<textarea className={styles.textarea} name="description" defaultValue={editingOffer?.description ?? ""} /></label><div className={styles.formGrid}><label>Цена клиенту<input className={styles.input} name="clientPrice" type="number" min="0" step="0.01" defaultValue={editingOffer?.clientPrice ?? ""} /></label><label>Верхняя граница<input className={styles.input} name="clientPriceMax" type="number" min="0" step="0.01" defaultValue={editingOffer?.clientPriceMax ?? ""} /></label><label>Внутренняя стоимость<input className={styles.input} name="internalCost" type="number" min="0" step="0.01" defaultValue={editingOffer?.internalCost ?? ""} /></label><label>Единица<input className={styles.input} name="unitLabel" placeholder="мероприятие, час, человек" defaultValue={editingOffer?.unitLabel ?? ""} /></label></div><button className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : editingOffer ? "Сохранить и подтвердить цену" : "Добавить предложение"}</button></form> : null}
    </div></div> : null}
  </AppShell>;
}
