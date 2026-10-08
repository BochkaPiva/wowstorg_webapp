"use client";

import Link from "next/link";
import React from "react";
import { AppShell } from "@/app/_ui/AppShell";
import { LoadingRegion, Skeleton } from "@/app/_ui/Skeleton";
import { catalogRequest, CatalogIcon, ContractorPhoto, freshnessCopy, offerPrice, seedHref, type Category, type ContractorCard, type ContractorDetail } from "./catalog-ui";
import { CatalogInspector } from "./CatalogInspector";
import styles from "./contractors.module.css";

type Panel = { kind: "view"; id: string } | { kind: "create" | "category" } | null;
type CatalogPage = { contractors: ContractorCard[]; nextCursor: string | null };

function CatalogSkeleton() {
  return <LoadingRegion className={styles.catalogSkeleton} label="Загрузка каталога подрядчиков">
    {Array.from({ length: 3 }, (_, index) => <article className={styles.skeletonCard} key={index}>
      <Skeleton className={styles.skeletonMedia} /><div className={styles.skeletonBody}><Skeleton className={styles.skeletonTitle} /><Skeleton className={styles.skeletonDescription} /><div className={styles.skeletonOffers}><Skeleton /><Skeleton /></div></div>
    </article>)}
  </LoadingRegion>;
}

export default function ContractorsPage() {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [contractors, setContractors] = React.useState<ContractorCard[]>([]);
  const [categoryId, setCategoryId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [moreLoading, setMoreLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [panel, setPanel] = React.useState<Panel>(null);
  const [detail, setDetail] = React.useState<ContractorDetail | null>(null);
  const [detailError, setDetailError] = React.useState("");
  const [detailReload, setDetailReload] = React.useState(0);
  const [panelEpoch, setPanelEpoch] = React.useState(0);
  const panelRef = React.useRef<HTMLElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const dirty = React.useRef(false);
  const saving = React.useRef(false);
  const generation = React.useRef(0);
  const moreFlight = React.useRef(false);

  React.useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  React.useEffect(() => {
    const controller = new AbortController();
    void catalogRequest<{ categories: Category[] }>("/api/contractor-categories", { signal: controller.signal }).then((data) => setCategories(data.categories)).catch(() => { if (!controller.signal.aborted) setError("Категории не загрузились. Обновите страницу."); });
    return () => controller.abort();
  }, [reload]);
  const catalogUrl = React.useCallback((cursor?: string) => `/api/contractors?${new URLSearchParams({ paged: "1", limit: "24", search: query, categoryId, ...(cursor ? { cursor } : {}) })}`, [query, categoryId]);
  React.useEffect(() => {
    const controller = new AbortController(); generation.current += 1;
    setLoading(true); setError(""); setNextCursor(null);
    void catalogRequest<CatalogPage>(catalogUrl(), { signal: controller.signal }).then((data) => { setContractors(data.contractors); setNextCursor(data.nextCursor); }).catch((cause) => { if (!controller.signal.aborted) { setContractors([]); setError(cause instanceof Error ? cause.message : "Каталог не загрузился"); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [catalogUrl, reload]);
  const detailId = panel?.kind === "view" ? panel.id : null;
  React.useEffect(() => {
    setDetail(null); setDetailError(""); if (!detailId) return;
    const controller = new AbortController();
    void catalogRequest<{ contractor: ContractorDetail }>(`/api/contractors/${detailId}`, { signal: controller.signal }).then((data) => setDetail(data.contractor)).catch((cause) => { if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : "Карточка не загрузилась"); });
    return () => controller.abort();
  }, [detailId, detailReload]);
  function switchPanel(next: Panel) {
    if (saving.current) return;
    if (dirty.current && !window.confirm("Есть несохранённые поля. Продолжить без сохранения?")) return;
    dirty.current = false;
    if (next) opener.current = document.activeElement as HTMLElement;
    setPanel(next); setPanelEpoch((value) => value + 1);
    if (!next) opener.current?.focus();
  }
  React.useEffect(() => { if (panel) { panelRef.current?.focus(); panelRef.current?.scrollIntoView({ block: "nearest" }); } }, [panel]);
  React.useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty.current || saving.current) { event.preventDefault(); event.returnValue = ""; } };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") switchPanel(null); };
    window.addEventListener("beforeunload", leave); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("beforeunload", leave); window.removeEventListener("keydown", key); };
  }, []);
  async function loadMore() {
    if (!nextCursor || moreFlight.current || loading) return;
    const version = generation.current; moreFlight.current = true; setMoreLoading(true); setError("");
    try {
      const data = await catalogRequest<CatalogPage>(catalogUrl(nextCursor));
      if (version === generation.current) { setContractors((current) => [...current, ...data.contractors.filter((row) => !current.some((old) => old.id === row.id))]); setNextCursor(data.nextCursor); }
    } catch (cause) { if (version === generation.current) setError(cause instanceof Error ? cause.message : "Не удалось загрузить ещё"); }
    finally { moreFlight.current = false; setMoreLoading(false); }
  }
  function saved(id?: string, message?: string) {
    dirty.current = false; setReload((value) => value + 1); setDetailReload((value) => value + 1);
    setNotice(message ?? "Сохранено.");
    if (id) setPanel({ kind: "view", id });
    else setPanel(null);
  }
  function guardLink(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a") && (saving.current || (dirty.current && !window.confirm("Есть несохранённые поля. Перейти без сохранения?")))) event.preventDefault();
  }
  return <AppShell title="Подрядчики"><div className={styles.page} onClickCapture={guardLink}>
    <header className={styles.hero}><div><h2>Подрядчики и услуги</h2><p>Выберите услугу и начните КП. Для контактов и деталей откройте карточку.</p></div><div className={styles.heroActions}><button className={styles.secondary} onClick={() => switchPanel({ kind: "create" })}>Добавить подрядчика</button><Link className={styles.primary} href="/proposals?new=1">Составить КП</Link></div></header>
    <nav className={styles.sectionTabs} aria-label="Подрядчики"><Link href="/contractors" aria-current="page">Каталог</Link><Link href="/proposals">Коммерческие предложения</Link></nav>
    <section className={styles.toolbar} aria-label="Поиск и категории"><input className={styles.search} value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Подрядчик или услуга" aria-label="Поиск подрядчиков" /><div className={styles.chips}><button className={styles.chip} aria-pressed={!categoryId} data-active={!categoryId} onClick={() => setCategoryId("")}>Все</button>{categories.map((category) => <button key={category.id} className={styles.chip} aria-pressed={category.id === categoryId} data-active={category.id === categoryId} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}<button className={styles.quiet} onClick={() => switchPanel({ kind: "category" })} aria-label="Добавить категорию">+ Категория</button></div></section>
    {error ? <div className={styles.error} role="alert">{error} <button className={styles.quiet} onClick={() => setReload((value) => value + 1)}>Повторить</button></div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    <div className={styles.catalogLayout} data-inspecting={Boolean(panel)}>
      <div className={styles.catalogContent}>
        {loading ? <CatalogSkeleton /> : contractors.length ? <><div className={styles.catalogSummary}>Показано подрядчиков: <strong>{contractors.length}</strong>{nextCursor ? <span>· ниже есть ещё</span> : null}</div><section className={styles.catalogGrid} aria-label="Каталог подрядчиков">{contractors.map((contractor) => <article key={contractor.id} className={styles.contractorCard} data-selected={detailId === contractor.id}>
          <button className={styles.cardMedia} onClick={() => switchPanel({ kind: "view", id: contractor.id })} aria-label={`Открыть карточку: ${contractor.name}`}><ContractorPhoto src={contractor.photoUrl} name={contractor.name} /></button>
          <div className={styles.cardBody}><div className={styles.cardHead}><div><h3><button onClick={() => switchPanel({ kind: "view", id: contractor.id })}>{contractor.name}</button></h3>{contractor.shortDescription ? <p>{contractor.shortDescription}</p> : null}</div>{contractor.city ? <span className={styles.city}>{contractor.city}</span> : null}</div>
            <div className={styles.offerList}>{contractor.offers.slice(0, 3).map((offer) => <div key={offer.id} className={styles.offerRow}><div className={styles.offerMain}><span className={styles.offerCategory}>{offer.category.name}</span><strong>{offer.title}</strong><span className={styles.freshness}>{freshnessCopy(offer)}</span></div><div className={styles.offerSide}><strong>{offerPrice(offer)}</strong><Link className={styles.serviceAction} href={seedHref(contractor, offer)} aria-label={`Составить КП: ${offer.title}, ${contractor.name}`}>В новое КП</Link></div></div>)}{!contractor.offers.length ? <div className={styles.noOffers}>Услуги ещё не добавлены</div> : null}</div>
            <button className={styles.cardDetails} onClick={() => switchPanel({ kind: "view", id: contractor.id })}>{contractor.offers.length > 3 ? `Все услуги (${contractor.offers.length}) и контакты` : "Подробнее и контакты"}<CatalogIcon kind="open" /></button>
          </div>
        </article>)}</section>{nextCursor ? <div className={styles.loadMore}><button className={styles.secondary} disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? "Загружаем…" : "Показать ещё"}</button></div> : null}</> : !error ? <div className={styles.catalogEmpty}><strong>{query || categoryId ? "Ничего не найдено" : "Соберите свою базу подрядчиков"}</strong><span>{query || categoryId ? "Попробуйте другой запрос или категорию." : "Добавьте первого подрядчика и его услуги — они появятся здесь."}</span><button className={styles.secondary} onClick={() => query || categoryId ? (setSearch(""), setCategoryId("")) : switchPanel({ kind: "create" })}>{query || categoryId ? "Сбросить поиск" : "Добавить подрядчика"}</button></div> : null}
      </div>
      {panel ? <aside className={styles.inspector} ref={panelRef} tabIndex={-1} aria-label="Карточка подрядчика"><CatalogInspector key={`${panel.kind === "view" ? panel.id : panel.kind}:${panelEpoch}`} kind={panel.kind} contractor={detail?.id === detailId ? detail : null} categories={categories} loadError={detailError} onClose={() => switchPanel(null)} onRetry={() => setDetailReload((value) => value + 1)} onSaved={saved} dirty={dirty} saving={saving} /></aside> : null}
    </div>
  </div></AppShell>;
}
