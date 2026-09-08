"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { LoadingRegion, Skeleton } from "@/app/_ui/Skeleton";
import { priceFreshness, proposalLineTotal, type ContractorPriceType } from "@/lib/contractor-offers";
import styles from "./ProjectEventBuilderPanel.module.css";

type SelectionRole = "PRIMARY" | "ALTERNATIVE" | "OPTIONAL" | "EXCLUDED";
type AssetSnapshot = { id?: string; url: string; caption?: string | null; focalX?: string | null; focalY?: string | null };
type ProposalItem = {
  id: string;
  offerId: string | null;
  selectionRole: SelectionRole;
  qty: number;
  clientUnitPrice: number | null;
  internalUnitCost: number | null;
  unitLabel: string | null;
  contractorNameSnapshot: string;
  offerTitleSnapshot: string;
  offerDescriptionSnapshot: string | null;
  sourcePriceConfirmedAt: string | null;
  assetSnapshot?: AssetSnapshot[] | null;
};
type ProposalSection = { id: string; title: string; description: string | null; category: { id: string; name: string } | null; items: ProposalItem[] };
type ProposalVariant = { id: string; title: string; description: string | null; isRecommended: boolean; sections: ProposalSection[] };
type Proposal = { id: string; title: string; status: string; revision: number; variants: ProposalVariant[] };
type Category = { id: string; name: string };
type CatalogOffer = { id: string; title: string; description: string | null; priceType: ContractorPriceType; clientPrice: number | null; clientPriceMax: number | null; internalCost: number | null; unitLabel: string | null; priceConfirmedAt: string | null; category: Category };
type Contractor = { id: string; name: string; shortDescription: string | null; photoUrl: string | null; offers: CatalogOffer[] };

const ROLE_LABEL: Record<SelectionRole, string> = {
  PRIMARY: "Основной",
  ALTERNATIVE: "Альтернатива",
  OPTIONAL: "Опция",
  EXCLUDED: "Не включать",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Черновик",
  READY: "Готово",
  SENT: "Отправлено",
  APPROVED: "Согласовано",
  ARCHIVED: "Архив",
};

function money(value: number | null) {
  return value == null
    ? "По запросу"
    : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");
}

function freshnessLabel(value: ReturnType<typeof priceFreshness>) {
  if (value === "FRESH") return "Актуально";
  if (value === "AGING") return "Проверить скоро";
  if (value === "STALE") return "Цена устарела";
  return "Без проверки";
}

function catalogPrice(offer: CatalogOffer) {
  if (offer.priceType === "ON_REQUEST") return "По запросу";
  const base = money(offer.clientPrice);
  if (offer.priceType === "FROM") return `от ${base}`;
  if (offer.priceType === "RANGE" && offer.clientPriceMax != null) return `${base} — ${money(offer.clientPriceMax)}`;
  return offer.unitLabel ? `${base} / ${offer.unitLabel}` : base;
}

async function apiError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "Не удалось сохранить изменение";
}

function Thumbnail({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return <span className={styles.thumbnail} style={{ width: size, height: size }}>
    {src && !failed
      ? <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} unoptimized onError={() => setFailed(true)} />
      : <span>{initials(name)}</span>}
  </span>;
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg>;
}

function ChevronIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg>;
}

function MoreIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="4" cy="10" r="1.2" /><circle cx="10" cy="10" r="1.2" /><circle cx="16" cy="10" r="1.2" /></svg>;
}

function EventBuilderSkeleton() {
  return <LoadingRegion className={styles.builderSkeleton} label="Загрузка конструктора мероприятия">
    <div className={styles.skeletonTop}>
      <div><Skeleton /><Skeleton /></div>
      <div><Skeleton /><Skeleton /><Skeleton /></div>
    </div>
    <div className={styles.skeletonToolbar}><Skeleton /><Skeleton /><Skeleton /></div>
    <div className={styles.skeletonPicker}>
      <Skeleton />
      <div><Skeleton /><Skeleton /><Skeleton /></div>
      <div><Skeleton /><Skeleton /></div>
    </div>
    <div className={styles.skeletonSection}>
      <div><Skeleton /><Skeleton /></div>
      <Skeleton />
    </div>
  </LoadingRegion>;
}

export function ProjectEventBuilderPanel({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [contractors, setContractors] = React.useState<Contractor[]>([]);
  const [activeVariantId, setActiveVariantId] = React.useState<string | null>(null);
  const [targetSectionId, setTargetSectionId] = React.useState<string | null>(null);
  const [catalogCategory, setCatalogCategory] = React.useState("");
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [newSectionTitle, setNewSectionTitle] = React.useState("");
  const [newSectionCategory, setNewSectionCategory] = React.useState("");
  const [manualTitle, setManualTitle] = React.useState("");
  const [manualPrice, setManualPrice] = React.useState("");
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [sectionComposerOpen, setSectionComposerOpen] = React.useState(false);
  const [manualComposerOpen, setManualComposerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const catalogRef = React.useRef<HTMLElement>(null);

  const load = React.useCallback(async () => {
    const [proposalResponse, categoriesResponse, contractorsResponse] = await Promise.all([
      fetch(`/api/projects/${projectId}/proposals`, { cache: "no-store" }),
      fetch("/api/contractor-categories", { cache: "no-store" }),
      fetch("/api/contractors", { cache: "no-store" }),
    ]);
    if (!proposalResponse.ok || !categoriesResponse.ok || !contractorsResponse.ok) throw new Error("Не удалось загрузить конструктор");
    const proposalData = await proposalResponse.json() as { proposal: Proposal | null };
    const categoriesData = await categoriesResponse.json() as { categories: Category[] };
    const contractorsData = await contractorsResponse.json() as { contractors: Contractor[] };
    setProposal(proposalData.proposal);
    setCategories(categoriesData.categories);
    setContractors(contractorsData.contractors);
    setActiveVariantId((current) => current && proposalData.proposal?.variants.some((variant) => variant.id === current)
      ? current
      : proposalData.proposal?.variants[0]?.id ?? null);
    setLoading(false);
  }, [projectId]);

  React.useEffect(() => {
    void load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Ошибка загрузки");
      setLoading(false);
    });
  }, [load]);

  const activeVariant = proposal?.variants.find((variant) => variant.id === activeVariantId) ?? proposal?.variants[0] ?? null;
  const targetSection = activeVariant?.sections.find((section) => section.id === targetSectionId) ?? null;

  React.useEffect(() => {
    if (activeVariant && !activeVariant.sections.some((section) => section.id === targetSectionId)) {
      setTargetSectionId(activeVariant.sections[0]?.id ?? null);
    }
  }, [activeVariant, targetSectionId]);

  function openCatalogFor(sectionId?: string) {
    if (sectionId) setTargetSectionId(sectionId);
    setSectionComposerOpen(false);
    setCatalogOpen(true);
    window.setTimeout(() => catalogRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    }), 0);
  }

  async function createProposal() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Концепция мероприятия" }),
    });
    if (!response.ok) setError(await apiError(response));
    else {
      const body = await response.json() as { proposal: Proposal };
      setProposal(body.proposal);
      setActiveVariantId(body.proposal.variants[0]?.id ?? null);
    }
    setBusy(false);
  }

  async function mutate(payload: Record<string, unknown>) {
    if (!proposal) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/projects/${projectId}/proposals/${proposal.id}/structure`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, expectedRevision: proposal.revision }),
    });
    if (!response.ok) {
      const message = await apiError(response);
      setError(message);
      if (response.status === 409) await load().catch(() => null);
      setBusy(false);
      return false;
    }
    const body = await response.json() as { proposal: Proposal };
    setProposal(body.proposal);
    setBusy(false);
    return true;
  }

  async function addSection() {
    if (!activeVariant || !newSectionTitle.trim()) return;
    const okay = await mutate({
      action: "ADD_SECTION",
      variantId: activeVariant.id,
      categoryId: newSectionCategory || null,
      title: newSectionTitle.trim(),
    });
    if (okay) {
      setNewSectionTitle("");
      setNewSectionCategory("");
      setSectionComposerOpen(false);
    }
  }

  async function addOffer(offerId: string) {
    if (!targetSectionId) {
      setError("Сначала выберите раздел концепции");
      return;
    }
    const selectedOffer = contractors.flatMap((contractor) => contractor.offers.map((offer) => ({ ...offer, contractorName: contractor.name }))).find((offer) => offer.id === offerId);
    const okay = await mutate({ action: "ADD_CATALOG_ITEM", sectionId: targetSectionId, offerId, selectionRole: "PRIMARY" });
    if (okay) setNotice(`${selectedOffer?.title ?? "Позиция"} добавлена в раздел «${targetSection?.title ?? "Концепция"}».`);
  }

  async function addManualItem() {
    if (!targetSectionId || !manualTitle.trim()) return;
    const okay = await mutate({
      action: "ADD_MANUAL_ITEM",
      sectionId: targetSectionId,
      title: manualTitle.trim(),
      clientUnitPrice: manualPrice.trim() ? Number(manualPrice) : null,
    });
    if (okay) {
      setManualTitle("");
      setManualPrice("");
      setManualComposerOpen(false);
    }
  }

  async function transfer() {
    if (!proposal || !activeVariant) return;
    const itemIds = activeVariant.sections.flatMap((section) => section.items
      .filter((item) => item.selectionRole === "PRIMARY" || item.selectionRole === "OPTIONAL")
      .map((item) => item.id));
    if (!itemIds.length) {
      setError("В варианте нет включённых позиций");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/projects/${projectId}/proposals/${proposal.id}/transfer-to-estimate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mutationId: crypto.randomUUID(),
        expectedProposalRevision: proposal.revision,
        variantId: activeVariant.id,
        itemIds,
      }),
    });
    if (!response.ok) setError(await apiError(response));
    else {
      const body = await response.json() as { result: { transferred?: number; skipped?: number } };
      setNotice(`Перенесено в смету: ${body.result.transferred ?? 0}. Уже было: ${body.result.skipped ?? 0}.`);
    }
    setBusy(false);
  }

  if (loading) return <EventBuilderSkeleton />;
  if (!proposal) return <div className={styles.empty}>
    <div className={styles.emptyInner}>
      <h3>Соберите первый вариант</h3>
      <p>Добавьте разделы и подрядчиков, сравните стоимость и перенесите выбранное в смету.</p>
      {error ? <div className={styles.error}>{error}</div> : null}
      {!readOnly ? <button className={styles.primary} onClick={createProposal} disabled={busy}>{busy ? "Создаю…" : "Начать"}</button> : null}
    </div>
  </div>;

  const includedItems = activeVariant?.sections.flatMap((section) => section.items)
    .filter((item) => item.selectionRole === "PRIMARY" || item.selectionRole === "OPTIONAL") ?? [];
  const clientTotal = includedItems.reduce((sum, item) => sum + (proposalLineTotal(item.clientUnitPrice, item.qty) ?? 0), 0);
  const internalTotal = includedItems.reduce((sum, item) => sum + (proposalLineTotal(item.internalUnitCost, item.qty) ?? 0), 0);
  const offers = contractors.flatMap((contractor) => contractor.offers.map((offer) => ({
    ...offer,
    contractorName: contractor.name,
    photoUrl: contractor.photoUrl,
  }))).filter((offer) =>
    (!catalogCategory || offer.category.id === catalogCategory)
    && (!catalogSearch.trim() || `${offer.title} ${offer.contractorName}`.toLocaleLowerCase("ru-RU").includes(catalogSearch.trim().toLocaleLowerCase("ru-RU"))),
  );

  return <div className={styles.root}>
    <div className={styles.topbar}>
      <div className={styles.proposalMeta}>
        <div className={styles.proposalTitleRow}>
          <h3>{proposal.title}</h3>
          <span>{STATUS_LABEL[proposal.status] ?? proposal.status}</span>
        </div>
        <p>{activeVariant?.sections.length ?? 0} разделов · {includedItems.length} позиций</p>
      </div>
      <dl className={styles.summary}>
        <div><dt>Итого</dt><dd>{money(clientTotal)}</dd></div>
        <div data-tone={clientTotal - internalTotal >= 0 ? "positive" : "negative"}><dt>Маржа</dt><dd>{money(clientTotal - internalTotal)}</dd></div>
      </dl>
      {!readOnly ? <button className={styles.primary} onClick={transfer} disabled={busy || !includedItems.length}>{busy ? "Сохраняю…" : "Перенести в смету"}</button> : null}
    </div>

    {notice ? <div className={styles.notice}>{notice}</div> : null}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}

    <div className={styles.commandbar}>
      <div className={styles.variants} role="tablist" aria-label="Варианты концепции">
        {proposal.variants.map((variant) => <button
          key={variant.id}
          className={styles.variant}
          data-active={variant.id === activeVariant?.id}
          onClick={() => setActiveVariantId(variant.id)}
          role="tab"
          aria-selected={variant.id === activeVariant?.id}
        >
          {variant.title}
          {variant.isRecommended ? <span className={styles.variantMark} title="Рекомендуемый вариант">●</span> : null}
        </button>)}
      </div>
      <div className={styles.tools}>
        {!readOnly ? <button className={styles.newSectionAction} onClick={() => {
          setSectionComposerOpen((value) => !value);
          setCatalogOpen(false);
        }}><PlusIcon /><span>Раздел</span></button> : null}
        <details className={styles.moreMenu}>
          <summary aria-label="Действия с вариантом"><MoreIcon /></summary>
          <div className={styles.moreMenuPopover}>
            {!readOnly ? <button onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              void mutate({
                action: "ADD_VARIANT",
                title: `Вариант ${proposal.variants.length + 1}`,
                sourceVariantId: activeVariant?.id,
              });
            }} disabled={busy}>Дублировать вариант</button> : null}
            <Link href="/contractors">Открыть каталог подрядчиков</Link>
          </div>
        </details>
      </div>
    </div>

    {sectionComposerOpen && !readOnly ? <div className={styles.sectionComposer}>
      <input className={styles.field} value={newSectionTitle} onChange={(event) => setNewSectionTitle(event.target.value)} placeholder="Название раздела" autoFocus />
      <select className={styles.field} value={newSectionCategory} onChange={(event) => setNewSectionCategory(event.target.value)}>
        <option value="">Без категории</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
      <button className={styles.primaryCompact} onClick={addSection} disabled={!newSectionTitle.trim() || busy}>Добавить</button>
      <button className={styles.iconButton} aria-label="Закрыть добавление раздела" onClick={() => setSectionComposerOpen(false)}>×</button>
    </div> : null}

    {!readOnly ? <button
      className={styles.catalogDisclosure}
      type="button"
      aria-expanded={catalogOpen}
      disabled={!activeVariant?.sections.length}
      onClick={() => catalogOpen ? setCatalogOpen(false) : openCatalogFor()}
    >
      <span className={styles.disclosureIcon}><PlusIcon /></span>
      <span className={styles.disclosureCopy}>
        <strong>Подбор предложений</strong>
        <span>{activeVariant?.sections.length ? `Добавить подрядчика или услугу в «${targetSection?.title ?? activeVariant.sections[0]?.title}»` : "Сначала создайте раздел концепции"}</span>
      </span>
      <span className={styles.disclosureChevron} data-open={catalogOpen}><ChevronIcon /></span>
    </button> : null}

    {catalogOpen && activeVariant?.sections.length ? <section ref={catalogRef} className={styles.catalogPanel} aria-label="Добавление позиций в концепцию">
      <div className={styles.catalogPanelIntro}>
        <strong>Выберите готовое предложение</strong>
        <span>Фото, состав и актуальная цена видны сразу.</span>
      </div>
      <div className={styles.catalogControls}>
        <label className={styles.targetSelect}><span>Добавляем в</span><select className={styles.field} value={targetSectionId ?? ""} onChange={(event) => setTargetSectionId(event.target.value)}>
          {activeVariant.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
        </select></label>
        <input className={styles.field} value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Найти подрядчика или услугу" aria-label="Поиск в каталоге" />
        <select className={styles.field} value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} aria-label="Категория каталога">
          <option value="">Все категории</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        {!readOnly ? <button className={styles.manualToggle} onClick={() => setManualComposerOpen((value) => !value)}>+ Своя позиция</button> : null}
      </div>

      {manualComposerOpen && !readOnly ? <div className={styles.manual}>
        <input className={styles.field} value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Название своей позиции" autoFocus />
        <input className={styles.field} value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} type="number" min="0" step="0.01" placeholder="Цена клиенту" />
        <button className={styles.primaryCompact} disabled={!targetSectionId || !manualTitle.trim() || busy} onClick={addManualItem}>Добавить</button>
      </div> : null}

      <div className={styles.catalogGrid}>
        {offers.map((offer) => {
          const freshness = priceFreshness(offer.priceConfirmedAt);
          const alreadyAdded = targetSection?.items.some((item) => item.offerId === offer.id) ?? false;
          return <article key={offer.id} className={styles.catalogCard}>
            <Thumbnail src={offer.photoUrl} name={offer.contractorName} size={68} />
            <div className={styles.catalogCardBody}>
              <span className={styles.catalogCategory}>{offer.category.name}</span>
              <strong>{offer.title}</strong>
              <span className={styles.catalogVendor}>{offer.contractorName}</span>
              {offer.description ? <p>{offer.description}</p> : null}
            </div>
            <div className={styles.catalogCardSide}>
              <strong>{catalogPrice(offer)}</strong>
              <span className={styles.freshness} data-state={freshness}>{freshnessLabel(freshness)}</span>
              {!readOnly ? <button className={styles.addOffer} disabled={!targetSectionId || busy || alreadyAdded} onClick={() => void addOffer(offer.id)}>{alreadyAdded ? "Добавлено" : "Добавить"}</button> : null}
            </div>
          </article>;
        })}
        {!offers.length ? <div className={styles.catalogEmpty}><strong>Ничего не найдено</strong><span>Измените поиск или категорию.</span></div> : null}
      </div>
    </section> : null}

    <div className={styles.canvas}>
        {activeVariant?.sections.map((section, sectionIndex) => <section
          key={section.id}
          className={styles.section}
          data-targeted={catalogOpen && section.id === targetSectionId}
        >
          <div className={styles.sectionHead}>
            <div className={styles.sectionIdentity}>
              <span className={styles.sectionIndex}>{String(sectionIndex + 1).padStart(2, "0")}</span>
              <div><h4>{section.title}</h4><p>{section.category?.name ?? "Свободный раздел"} · {section.items.length}</p></div>
            </div>
            <div className={styles.sectionActions}>
              {catalogOpen && section.id === targetSectionId ? <span className={styles.targetBadge}>Добавляем сюда</span> : null}
              {!readOnly ? <button className={styles.iconButton} aria-label={`Удалить раздел ${section.title}`} onClick={(event) => {
                event.stopPropagation();
                void mutate({ action: "REMOVE_SECTION", sectionId: section.id });
              }}>×</button> : null}
            </div>
          </div>

          {section.items.length ? <div className={styles.items}>{section.items.map((item) => <div key={item.id} className={styles.item} data-role={item.selectionRole}>
            <Thumbnail src={item.assetSnapshot?.[0]?.url} name={item.contractorNameSnapshot} size={48} />
            <div className={styles.itemTitle}>
              <strong>{item.offerTitleSnapshot}</strong>
              <span>{item.contractorNameSnapshot}{item.unitLabel ? ` · ${item.unitLabel}` : ""}</span>
              {item.offerDescriptionSnapshot ? <p>{item.offerDescriptionSnapshot}</p> : null}
            </div>
            <label className={styles.inlineField}><span>Количество</span><input className={styles.field} type="number" min="0.01" step="0.01" defaultValue={item.qty} disabled={readOnly} aria-label={`Количество ${item.offerTitleSnapshot}`} onBlur={(event) => {
              const qty = Number(event.currentTarget.value);
              if (qty > 0 && qty !== item.qty) void mutate({ action: "UPDATE_ITEM", itemId: item.id, qty });
            }} /></label>
            <label className={styles.inlineField}><span>Цена клиенту</span><input className={styles.field} type="number" min="0" step="0.01" defaultValue={item.clientUnitPrice ?? ""} disabled={readOnly} aria-label={`Цена ${item.offerTitleSnapshot}`} placeholder="Цена" onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              const price = value ? Number(value) : null;
              if (price !== item.clientUnitPrice) void mutate({ action: "UPDATE_ITEM", itemId: item.id, clientUnitPrice: price });
            }} /></label>
            <label className={styles.inlineField}><span>Вариант</span><select className={styles.field} value={item.selectionRole} disabled={readOnly} aria-label={`Роль ${item.offerTitleSnapshot}`} onChange={(event) => void mutate({ action: "UPDATE_ITEM", itemId: item.id, selectionRole: event.target.value })}>
              {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <div className={styles.itemPrice}>{money(proposalLineTotal(item.clientUnitPrice, item.qty))}</div>
            {!readOnly ? <button className={styles.removeItem} aria-label={`Удалить ${item.offerTitleSnapshot}`} onClick={() => void mutate({ action: "REMOVE_ITEM", itemId: item.id })}>×</button> : null}
          </div>)}</div> : <button className={styles.emptySection} type="button" onClick={() => {
            openCatalogFor(section.id);
          }}>
            <span>Добавить подрядчика или услугу</span>
            <small>Откроется каталог с фото и ценами</small>
          </button>}
        </section>)}

        {!activeVariant?.sections.length ? <div className={styles.zeroState}>
          <h4>Пока нет разделов</h4>
          <p>Создайте структуру мероприятия: например, локация, программа и оборудование.</p>
          {!readOnly ? <button className={styles.primaryCompact} onClick={() => setSectionComposerOpen(true)}>Добавить раздел</button> : null}
        </div> : null}

        <div className={styles.totals}>
          <div><span>Клиенту</span><strong>{money(clientTotal)}</strong></div>
          <div><span>Расходы</span><strong>{money(internalTotal)}</strong></div>
          <div data-tone={clientTotal - internalTotal >= 0 ? "positive" : "negative"}><span>Маржа</span><strong>{money(clientTotal - internalTotal)}</strong></div>
        </div>
    </div>
  </div>;
}
