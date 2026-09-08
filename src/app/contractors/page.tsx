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
async function readError(response: Response) { const body = await response.json().catch(() => null) as { error?: { message?: string } } | null; return body?.error?.message ?? "Не удалось выполнить действие"; }

export default function ContractorsPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [contractors, setContractors] = React.useState<Contractor[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [modal, setModal] = React.useState<"contractor" | "category" | "offer" | null>(null);
  const [editingOffer, setEditingOffer] = React.useState<Offer | null>(null);
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

  async function submitContractor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/contractors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      name: data.get("name"), shortDescription: data.get("description") || null, websiteUrl: data.get("website") || null, city: data.get("city") || null,
      contact: data.get("phone") || data.get("email") ? { personName: data.get("person") || null, phone: data.get("phone") || null, email: data.get("email") || null } : undefined,
    }) });
    if (!response.ok) { setError(await readError(response)); setBusy(false); return; }
    const body = await response.json() as { contractor: { id: string } }; await load(); setSelectedId(body.contractor.id); setModal(null); setBusy(false);
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

  async function uploadPhoto(file: File) {
    if (!selected) return; setBusy(true); setError(null); const form = new FormData(); form.set("file", file);
    const response = await fetch(`/api/contractors/${selected.id}/assets/upload`, { method: "POST", body: form });
    if (!response.ok) setError(await readError(response)); else await load();
    setBusy(false);
  }

  async function confirmOffer(offer: Offer) {
    if (!selected) return; setBusy(true); setError(null);
    const response = await fetch(`/api/contractors/${selected.id}/offers/${offer.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: offer.revision, confirmPrice: true }) });
    if (!response.ok) setError(await readError(response)); else await load();
    setBusy(false);
  }

  return <AppShell title="Подрядчики">
    <div className={styles.page}>
      <section className={styles.hero}>
        <div><h2>Каталог для быстрых концепций</h2><p>Единая база локаций, ведущих, шоу, техники и кейтеринга. Цена с датой подтверждения сразу доступна в конструкторе проекта.</p></div>
        <div className={styles.heroActions}><button className={styles.secondary} onClick={() => setModal("category")}>Новая категория</button><button className={styles.primary} onClick={() => setModal("contractor")}>Добавить подрядчика</button></div>
      </section>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      <section className={styles.toolbar}>
        <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, услуга или специализация" aria-label="Поиск подрядчиков" />
        <div className={styles.chips}><button className={styles.chip} data-active={!categoryId} onClick={() => setCategoryId("")}>Все</button>{categories.map((category) => <button key={category.id} className={styles.chip} data-active={category.id === categoryId} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div>
      </section>
      <section className={styles.workspace}>
        <div className={styles.list}><div className={styles.listHeader}>{filtered.length} подрядчиков</div>{filtered.map((contractor) => <button key={contractor.id} className={styles.row} data-active={contractor.id === selectedId} onClick={() => setSelectedId(contractor.id)}><span className={styles.monogram}>{initials(contractor.name)}</span><span><span className={styles.rowTitle}>{contractor.name}</span><span className={styles.rowMeta}>{contractor.city || contractor.shortDescription || "Описание не заполнено"}</span></span><span className={styles.count}>{contractor.offers.length}</span></button>)}</div>
        {selected ? <div className={styles.detail}>
          <div className={styles.detailHead}><label className={styles.photo} title="Загрузить фотографию">{selected.photoUrl ? <Image src={selected.photoUrl} alt="" fill sizes="96px" unoptimized /> : initials(selected.name)}<input className={styles.photoInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); event.currentTarget.value = ""; }} /></label><div><h3>{selected.name}</h3><p>{selected.shortDescription || "Добавьте короткое описание, чтобы быстрее выбирать подрядчика во время звонка."}</p><div className={styles.contacts}>{selected.websiteUrl ? <a href={selected.websiteUrl} target="_blank" rel="noreferrer">Сайт ↗</a> : null}{selected.contacts[0]?.phone ? <a href={`tel:${selected.contacts[0].phone}`}>{selected.contacts[0].phone}</a> : null}{selected.contacts[0]?.email ? <a href={`mailto:${selected.contacts[0].email}`}>{selected.contacts[0].email}</a> : null}</div></div><button className={styles.primary} onClick={() => { setEditingOffer(null); setModal("offer"); }}>Добавить услугу</button></div>
          <div className={styles.offersHead}><h4>Предложения</h4><span>{selected.offers.length}</span></div>
          {selected.offers.length ? selected.offers.map((offer) => { const freshness = priceFreshness(offer.priceConfirmedAt); return <article key={offer.id} className={styles.offer}><div><div className={styles.offerCategory}>{offer.category.name}</div><div className={styles.offerTitle}>{offer.title}</div>{offer.description ? <div className={styles.offerDescription}>{offer.description}</div> : null}<button className={styles.quiet} onClick={() => { setEditingOffer(offer); setModal("offer"); }}>Изменить</button></div><div><div className={styles.price}>{offer.priceType === "FROM" ? "от " : ""}{money(offer.clientPrice)}{offer.priceType === "RANGE" && offer.clientPriceMax != null ? ` — ${money(offer.clientPriceMax)}` : ""}</div><div className={styles.freshness} data-state={freshness}>{freshness === "FRESH" ? "Цена актуальна" : freshness === "AGING" ? "Стоит перепроверить" : freshness === "STALE" ? "Цена устарела" : "Цена не подтверждена"}</div>{freshness !== "FRESH" ? <button className={styles.quiet} disabled={busy} onClick={() => void confirmOffer(offer)}>Подтвердить сегодня</button> : null}</div></article>; }) : <div className={styles.empty}>Услуг пока нет. Добавьте хотя бы одно предложение с ориентиром по цене.</div>}
        </div> : <div className={styles.empty}>Добавьте первого подрядчика — он сразу появится в конструкторах проектов.</div>}
      </section>
    </div>
    {modal ? <div className={styles.modal} role="dialog" aria-modal="true"><div className={styles.dialog}><div className={styles.dialogHead}><h3>{modal === "contractor" ? "Новый подрядчик" : modal === "category" ? "Новая категория" : `${editingOffer ? "Изменить услугу" : "Новая услуга"} · ${selected?.name}`}</h3><button className={styles.quiet} onClick={() => { setModal(null); setEditingOffer(null); setError(null); }}>Закрыть</button></div>
      {error ? <div className={styles.error}>{error}</div> : null}
      {modal === "contractor" ? <form className={styles.form} onSubmit={submitContractor}><label>Название<input className={styles.input} name="name" required /></label><label>Чем полезен<textarea className={styles.textarea} name="description" /></label><div className={styles.formGrid}><label>Город<input className={styles.input} name="city" /></label><label>Сайт<input className={styles.input} name="website" type="url" placeholder="https://" /></label><label>Контактное лицо<input className={styles.input} name="person" /></label><label>Телефон<input className={styles.input} name="phone" /></label></div><label>Email<input className={styles.input} name="email" type="email" /></label><button className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : "Создать карточку"}</button></form> : null}
      {modal === "category" ? <form className={styles.form} onSubmit={submitCategory}><label>Название<input className={styles.input} name="name" required placeholder="Например, Ведущие" /></label><label>Описание<textarea className={styles.textarea} name="description" /></label><button className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : "Добавить категорию"}</button></form> : null}
      {modal === "offer" ? <form key={editingOffer?.id ?? "new-offer"} className={styles.form} onSubmit={submitOffer}><div className={styles.formGrid}><label>Категория<select className={styles.select} name="categoryId" required defaultValue={editingOffer?.category.id ?? ""}><option value="">Выберите</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Модель цены<select className={styles.select} name="priceType" defaultValue={editingOffer?.priceType ?? "FIXED"}>{Object.entries(CONTRACTOR_PRICE_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>Название услуги<input className={styles.input} name="title" required defaultValue={editingOffer?.title ?? ""} /></label><label>Что входит<textarea className={styles.textarea} name="description" defaultValue={editingOffer?.description ?? ""} /></label><div className={styles.formGrid}><label>Цена клиенту<input className={styles.input} name="clientPrice" type="number" min="0" step="0.01" defaultValue={editingOffer?.clientPrice ?? ""} /></label><label>Верхняя граница<input className={styles.input} name="clientPriceMax" type="number" min="0" step="0.01" defaultValue={editingOffer?.clientPriceMax ?? ""} /></label><label>Внутренняя стоимость<input className={styles.input} name="internalCost" type="number" min="0" step="0.01" defaultValue={editingOffer?.internalCost ?? ""} /></label><label>Единица<input className={styles.input} name="unitLabel" placeholder="мероприятие, час, человек" defaultValue={editingOffer?.unitLabel ?? ""} /></label></div><button className={styles.primary} disabled={busy}>{busy ? "Сохраняю…" : editingOffer ? "Сохранить и подтвердить цену" : "Добавить предложение"}</button></form> : null}
    </div></div> : null}
  </AppShell>;
}
