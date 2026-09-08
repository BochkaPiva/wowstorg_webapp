"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { priceFreshness, proposalLineTotal } from "@/lib/contractor-offers";
import styles from "./ProjectEventBuilderPanel.module.css";

type SelectionRole = "PRIMARY" | "ALTERNATIVE" | "OPTIONAL" | "EXCLUDED";
type AssetSnapshot = { id?: string; url: string; caption?: string | null; focalX?: string | null; focalY?: string | null };
type ProposalItem = {
  id: string;
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
type CatalogOffer = { id: string; title: string; description: string | null; clientPrice: number | null; internalCost: number | null; unitLabel: string | null; priceConfirmedAt: string | null; category: Category };
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

async function apiError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "Не удалось сохранить изменение";
}

function Thumbnail({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  return <span className={styles.thumbnail} style={{ width: size, height: size }}>
    {src
      ? <Image src={src} alt="" width={size} height={size} sizes={`${size}px`} unoptimized />
      : <span>{initials(name)}</span>}
  </span>;
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
  const [catalogOpen, setCatalogOpen] = React.useState(true);
  const [sectionComposerOpen, setSectionComposerOpen] = React.useState(false);
  const [manualComposerOpen, setManualComposerOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

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
    await mutate({ action: "ADD_CATALOG_ITEM", sectionId: targetSectionId, offerId, selectionRole: "PRIMARY" });
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

  if (loading) return <div className={styles.loading}>Загружаю конструктор…</div>;
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
        <Link className={styles.toolButton} href="/contractors">База подрядчиков</Link>
        {!readOnly ? <button className={styles.toolButton} onClick={() => {
          setSectionComposerOpen((value) => !value);
          setCatalogOpen(false);
        }}>+ Раздел</button> : null}
        {!readOnly ? <button className={styles.toolButton} onClick={() => void mutate({
          action: "ADD_VARIANT",
          title: `Вариант ${proposal.variants.length + 1}`,
          sourceVariantId: activeVariant?.id,
        })} disabled={busy}>Сделать копию</button> : null}
        <button className={styles.catalogToggle} data-active={catalogOpen} onClick={() => {
          setCatalogOpen((value) => !value);
          setSectionComposerOpen(false);
        }}>{catalogOpen ? "Скрыть каталог" : "Открыть каталог"}</button>
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

    <div className={styles.layout} data-catalog-open={catalogOpen}>
      <div className={styles.canvas}>
        {activeVariant?.sections.map((section, sectionIndex) => <section
          key={section.id}
          className={styles.section}
          data-selected={section.id === targetSectionId}
          onClick={() => setTargetSectionId(section.id)}
        >
          <div className={styles.sectionHead}>
            <div className={styles.sectionIdentity}>
              <span className={styles.sectionIndex}>{String(sectionIndex + 1).padStart(2, "0")}</span>
              <div><h4>{section.title}</h4><p>{section.category?.name ?? "Свободный раздел"} · {section.items.length}</p></div>
            </div>
            <div className={styles.sectionActions}>
              {section.id === targetSectionId ? <span className={styles.targetBadge}>Выбран</span> : null}
              {!readOnly ? <button className={styles.iconButton} aria-label={`Удалить раздел ${section.title}`} onClick={(event) => {
                event.stopPropagation();
                void mutate({ action: "REMOVE_SECTION", sectionId: section.id });
              }}>×</button> : null}
            </div>
          </div>

          {section.items.length ? <div className={styles.items}>{section.items.map((item) => <div key={item.id} className={styles.item} data-role={item.selectionRole}>
            <Thumbnail src={item.assetSnapshot?.[0]?.url} name={item.contractorNameSnapshot} />
            <div className={styles.itemTitle}>
              <strong>{item.offerTitleSnapshot}</strong>
              <span>{item.contractorNameSnapshot}{item.unitLabel ? ` · ${item.unitLabel}` : ""}</span>
            </div>
            <input className={styles.field} type="number" min="0.01" step="0.01" defaultValue={item.qty} disabled={readOnly} aria-label={`Количество ${item.offerTitleSnapshot}`} title="Количество" onBlur={(event) => {
              const qty = Number(event.currentTarget.value);
              if (qty > 0 && qty !== item.qty) void mutate({ action: "UPDATE_ITEM", itemId: item.id, qty });
            }} />
            <input className={styles.field} type="number" min="0" step="0.01" defaultValue={item.clientUnitPrice ?? ""} disabled={readOnly} aria-label={`Цена ${item.offerTitleSnapshot}`} title="Цена клиенту за единицу" placeholder="Цена" onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              const price = value ? Number(value) : null;
              if (price !== item.clientUnitPrice) void mutate({ action: "UPDATE_ITEM", itemId: item.id, clientUnitPrice: price });
            }} />
            <select className={styles.field} value={item.selectionRole} disabled={readOnly} aria-label={`Роль ${item.offerTitleSnapshot}`} onChange={(event) => void mutate({ action: "UPDATE_ITEM", itemId: item.id, selectionRole: event.target.value })}>
              {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className={styles.itemPrice}>{money(proposalLineTotal(item.clientUnitPrice, item.qty))}</div>
            {!readOnly ? <button className={styles.removeItem} aria-label={`Удалить ${item.offerTitleSnapshot}`} onClick={() => void mutate({ action: "REMOVE_ITEM", itemId: item.id })}>×</button> : null}
          </div>)}</div> : <button className={styles.emptySection} type="button" onClick={() => {
            setTargetSectionId(section.id);
            setCatalogOpen(true);
          }}>
            <span>Добавить позиции</span>
            <small>Выберите подрядчика из каталога</small>
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

      {catalogOpen ? <aside className={styles.sidebar} aria-label="Каталог предложений">
        <div className={styles.sidebarHead}>
          <div><h4>Каталог</h4><p>{targetSection ? `В раздел «${targetSection.title}»` : "Выберите раздел"}</p></div>
          <button className={styles.iconButton} aria-label="Скрыть каталог" onClick={() => setCatalogOpen(false)}>×</button>
        </div>
        <div className={styles.catalogFilter}>
          <input className={styles.field} value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Поиск" aria-label="Поиск в каталоге" />
          <select className={styles.field} value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} aria-label="Категория каталога">
            <option value="">Все категории</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>

        {!readOnly ? <div className={styles.manualBlock}>
          <button className={styles.manualToggle} onClick={() => setManualComposerOpen((value) => !value)}>+ Своя позиция</button>
          {manualComposerOpen ? <div className={styles.manual}>
            <input className={styles.field} value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Название" autoFocus />
            <input className={styles.field} value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} type="number" min="0" step="0.01" placeholder="Цена" />
            <button className={styles.primaryCompact} disabled={!targetSectionId || !manualTitle.trim() || busy} onClick={addManualItem}>Добавить</button>
          </div> : null}
        </div> : null}

        <div className={styles.catalog}>
          {offers.map((offer) => {
            const freshness = priceFreshness(offer.priceConfirmedAt);
            return <article key={offer.id} className={styles.offer}>
              <Thumbnail src={offer.photoUrl} name={offer.contractorName} />
              <div className={styles.offerBody}>
                <div className={styles.offerTitle}>{offer.title}</div>
                <div className={styles.offerVendor}>{offer.contractorName} · {offer.category.name}</div>
                <div className={styles.offerMeta}>
                  <span className={styles.offerPrice}>{money(offer.clientPrice)}</span>
                  <span className={styles.freshness} data-state={freshness}>{freshnessLabel(freshness)}</span>
                </div>
              </div>
              {!readOnly ? <button className={styles.addOffer} aria-label={`Добавить ${offer.title}`} disabled={!targetSectionId || busy} onClick={() => void addOffer(offer.id)}>+</button> : null}
            </article>;
          })}
          {!offers.length ? <div className={styles.catalogEmpty}>Подходящих предложений нет.</div> : null}
        </div>
      </aside> : null}
    </div>
  </div>;
}
