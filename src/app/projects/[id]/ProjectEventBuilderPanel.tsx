"use client";

import Link from "next/link";
import React from "react";

import { priceFreshness, proposalLineTotal } from "@/lib/contractor-offers";
import styles from "./ProjectEventBuilderPanel.module.css";

type SelectionRole = "PRIMARY" | "ALTERNATIVE" | "OPTIONAL" | "EXCLUDED";
type ProposalItem = { id: string; selectionRole: SelectionRole; qty: number; clientUnitPrice: number | null; internalUnitCost: number | null; unitLabel: string | null; contractorNameSnapshot: string; offerTitleSnapshot: string; offerDescriptionSnapshot: string | null; sourcePriceConfirmedAt: string | null };
type ProposalSection = { id: string; title: string; description: string | null; category: { id: string; name: string } | null; items: ProposalItem[] };
type ProposalVariant = { id: string; title: string; description: string | null; isRecommended: boolean; sections: ProposalSection[] };
type Proposal = { id: string; title: string; status: string; revision: number; variants: ProposalVariant[] };
type Category = { id: string; name: string };
type CatalogOffer = { id: string; title: string; description: string | null; clientPrice: number | null; internalCost: number | null; unitLabel: string | null; priceConfirmedAt: string | null; category: Category };
type Contractor = { id: string; name: string; shortDescription: string | null; offers: CatalogOffer[] };

const ROLE_LABEL: Record<SelectionRole, string> = { PRIMARY: "Основной", ALTERNATIVE: "Альтернатива", OPTIONAL: "Опция", EXCLUDED: "Не включать" };
function money(value: number | null) { return value == null ? "Цена по запросу" : new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value); }
async function apiError(response: Response) { const body = await response.json().catch(() => null) as { error?: { message?: string } } | null; return body?.error?.message ?? "Не удалось сохранить изменение"; }

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
    setProposal(proposalData.proposal); setCategories(categoriesData.categories); setContractors(contractorsData.contractors);
    setActiveVariantId((current) => current && proposalData.proposal?.variants.some((variant) => variant.id === current) ? current : proposalData.proposal?.variants[0]?.id ?? null);
    setLoading(false);
  }, [projectId]);

  React.useEffect(() => { void load().catch((cause) => { setError(cause instanceof Error ? cause.message : "Ошибка загрузки"); setLoading(false); }); }, [load]);
  const activeVariant = proposal?.variants.find((variant) => variant.id === activeVariantId) ?? proposal?.variants[0] ?? null;
  React.useEffect(() => { if (activeVariant && !activeVariant.sections.some((section) => section.id === targetSectionId)) setTargetSectionId(activeVariant.sections[0]?.id ?? null); }, [activeVariant, targetSectionId]);

  async function createProposal() {
    setBusy(true); setError(null);
    const response = await fetch(`/api/projects/${projectId}/proposals`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Концепция мероприятия" }) });
    if (!response.ok) setError(await apiError(response)); else { const body = await response.json() as { proposal: Proposal }; setProposal(body.proposal); setActiveVariantId(body.proposal.variants[0]?.id ?? null); }
    setBusy(false);
  }

  async function mutate(payload: Record<string, unknown>) {
    if (!proposal) return false; setBusy(true); setError(null); setNotice(null);
    const response = await fetch(`/api/projects/${projectId}/proposals/${proposal.id}/structure`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, expectedRevision: proposal.revision }) });
    if (!response.ok) {
      const message = await apiError(response); setError(message);
      if (response.status === 409) await load().catch(() => null);
      setBusy(false); return false;
    }
    const body = await response.json() as { proposal: Proposal }; setProposal(body.proposal); setBusy(false); return true;
  }

  async function addSection() {
    if (!activeVariant || !newSectionTitle.trim()) return;
    const okay = await mutate({ action: "ADD_SECTION", variantId: activeVariant.id, categoryId: newSectionCategory || null, title: newSectionTitle.trim() });
    if (okay) { setNewSectionTitle(""); setNewSectionCategory(""); }
  }

  async function addOffer(offerId: string) {
    if (!targetSectionId) { setError("Сначала добавьте и выберите раздел концепции"); return; }
    await mutate({ action: "ADD_CATALOG_ITEM", sectionId: targetSectionId, offerId, selectionRole: "PRIMARY" });
  }

  async function addManualItem() {
    if (!targetSectionId || !manualTitle.trim()) return;
    const okay = await mutate({ action: "ADD_MANUAL_ITEM", sectionId: targetSectionId, title: manualTitle.trim(), clientUnitPrice: manualPrice.trim() ? Number(manualPrice) : null });
    if (okay) { setManualTitle(""); setManualPrice(""); }
  }

  async function transfer() {
    if (!proposal || !activeVariant) return;
    const itemIds = activeVariant.sections.flatMap((section) => section.items.filter((item) => item.selectionRole === "PRIMARY" || item.selectionRole === "OPTIONAL").map((item) => item.id));
    if (!itemIds.length) { setError("В варианте нет включённых позиций"); return; }
    setBusy(true); setError(null); setNotice(null);
    const response = await fetch(`/api/projects/${projectId}/proposals/${proposal.id}/transfer-to-estimate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutationId: crypto.randomUUID(), expectedProposalRevision: proposal.revision, variantId: activeVariant.id, itemIds }) });
    if (!response.ok) setError(await apiError(response)); else { const body = await response.json() as { result: { transferred?: number; skipped?: number } }; setNotice(`В смету перенесено: ${body.result.transferred ?? 0}. Уже было в смете: ${body.result.skipped ?? 0}.`); }
    setBusy(false);
  }

  if (loading) return <div className={styles.loading}>Загружаю конструктор…</div>;
  if (!proposal) return <div className={styles.empty}><div className={styles.emptyInner}><h3>Соберите мероприятие во время звонка</h3><p>Разложите идею по разделам, предложите клиенту несколько вариантов и одним действием перенесите выбранное в смету.</p>{error ? <div className={styles.error}>{error}</div> : null}{!readOnly ? <button className={styles.primary} onClick={createProposal} disabled={busy}>{busy ? "Создаю…" : "Начать концепцию"}</button> : null}</div></div>;

  const clientTotal = activeVariant?.sections.flatMap((section) => section.items).filter((item) => item.selectionRole === "PRIMARY" || item.selectionRole === "OPTIONAL").reduce((sum, item) => sum + (proposalLineTotal(item.clientUnitPrice, item.qty) ?? 0), 0) ?? 0;
  const internalTotal = activeVariant?.sections.flatMap((section) => section.items).filter((item) => item.selectionRole === "PRIMARY" || item.selectionRole === "OPTIONAL").reduce((sum, item) => sum + (proposalLineTotal(item.internalUnitCost, item.qty) ?? 0), 0) ?? 0;
  const offers = contractors.flatMap((contractor) => contractor.offers.map((offer) => ({ ...offer, contractorName: contractor.name }))).filter((offer) => (!catalogCategory || offer.category.id === catalogCategory) && (!catalogSearch.trim() || `${offer.title} ${offer.contractorName}`.toLocaleLowerCase("ru-RU").includes(catalogSearch.trim().toLocaleLowerCase("ru-RU"))));

  return <div className={styles.root}>
    <div className={styles.header}><div><div className={styles.eyebrow}>Конструктор мероприятия</div><h3 className={styles.title}>{proposal.title}</h3><p className={styles.subtitle}>Варианты сохраняют цену и описание на момент добавления. Обновление каталога их не перезапишет.</p></div><div className={styles.headerActions}><Link className={styles.secondary} href="/contractors">Каталог подрядчиков</Link>{!readOnly ? <button className={styles.secondary} onClick={() => void mutate({ action: "ADD_VARIANT", title: `Вариант ${proposal.variants.length + 1}`, sourceVariantId: activeVariant?.id })} disabled={busy}>Дублировать вариант</button> : null}<button className={styles.primary} onClick={transfer} disabled={busy || readOnly}>{busy ? "Сохраняю…" : "Перенести в смету"}</button></div></div>
    {notice ? <div className={styles.notice}>{notice}</div> : null}{error ? <div className={styles.error} role="alert">{error}</div> : null}
    <div className={styles.variantBar}>{proposal.variants.map((variant) => <button key={variant.id} className={styles.variant} data-active={variant.id === activeVariant?.id} onClick={() => setActiveVariantId(variant.id)}>{variant.title}{variant.isRecommended ? <span className={styles.variantMark}>●</span> : null}</button>)}</div>
    <div className={styles.layout}><div className={styles.canvas}>
      {activeVariant?.sections.map((section) => <section key={section.id} className={styles.section} onClick={() => setTargetSectionId(section.id)}><div className={styles.sectionHead}><div><h4>{section.title}</h4><p>{section.category?.name ?? "Свободный раздел"} · {section.items.length} поз.</p></div>{!readOnly ? <div className={styles.sectionActions}><button className={styles.quiet} onClick={(event) => { event.stopPropagation(); setTargetSectionId(section.id); }}>Добавлять сюда</button><button className={styles.danger} onClick={(event) => { event.stopPropagation(); void mutate({ action: "REMOVE_SECTION", sectionId: section.id }); }}>Удалить</button></div> : null}</div>
        {section.items.length ? <div className={styles.items}>{section.items.map((item) => <div key={item.id} className={styles.item} data-role={item.selectionRole}><div className={styles.itemTitle}><strong>{item.offerTitleSnapshot}</strong><span>{item.contractorNameSnapshot}{item.unitLabel ? ` · ${item.unitLabel}` : ""}</span></div><input className={styles.field} type="number" min="0.01" step="0.01" defaultValue={item.qty} disabled={readOnly} aria-label={`Количество ${item.offerTitleSnapshot}`} title="Количество" onBlur={(event) => { const qty = Number(event.currentTarget.value); if (qty > 0 && qty !== item.qty) void mutate({ action: "UPDATE_ITEM", itemId: item.id, qty }); }} /><input className={styles.field} type="number" min="0" step="0.01" defaultValue={item.clientUnitPrice ?? ""} disabled={readOnly} aria-label={`Цена ${item.offerTitleSnapshot}`} title="Цена клиенту за единицу" placeholder="Цена" onBlur={(event) => { const value = event.currentTarget.value.trim(); const price = value ? Number(value) : null; if (price !== item.clientUnitPrice) void mutate({ action: "UPDATE_ITEM", itemId: item.id, clientUnitPrice: price }); }} /><select className={styles.field} value={item.selectionRole} disabled={readOnly} onChange={(event) => void mutate({ action: "UPDATE_ITEM", itemId: item.id, selectionRole: event.target.value })}>{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><div className={styles.itemPrice}>{money(proposalLineTotal(item.clientUnitPrice, item.qty))}</div>{!readOnly ? <button className={styles.iconButton} aria-label={`Удалить ${item.offerTitleSnapshot}`} onClick={() => void mutate({ action: "REMOVE_ITEM", itemId: item.id })}>×</button> : <span />}</div>)}</div> : <div className={styles.emptySection}>Выберите эту секцию и добавьте предложения из каталога справа.</div>}
      </section>)}
      {!activeVariant?.sections.length ? <div className={styles.emptySection}>Начните со смыслового раздела: локация, ведущие, программа, оборудование или кейтеринг.</div> : null}
      {!readOnly ? <div className={styles.addSection}><input className={styles.field} value={newSectionTitle} onChange={(event) => setNewSectionTitle(event.target.value)} placeholder="Название нового раздела" /><select className={styles.field} value={newSectionCategory} onChange={(event) => setNewSectionCategory(event.target.value)}><option value="">Без категории</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className={styles.secondary} onClick={addSection} disabled={!newSectionTitle.trim() || busy}>Добавить раздел</button></div> : null}
      <div className={styles.totals}><div className={styles.total}><span>Клиенту</span><strong>{money(clientTotal)}</strong></div><div className={styles.total}><span>Внутренние расходы</span><strong>{money(internalTotal)}</strong></div><div className={styles.total} data-tone="positive"><span>Предварительная маржа</span><strong>{money(clientTotal - internalTotal)}</strong></div></div>
    </div><aside className={styles.sidebar}><h4>Каталог</h4><p className={styles.sidebarHint}>{targetSectionId ? `Добавление в «${activeVariant?.sections.find((section) => section.id === targetSectionId)?.title ?? "раздел"}»` : "Выберите раздел слева"}</p><div className={styles.catalogFilter}><input className={styles.field} value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Подрядчик или услуга" /><select className={styles.field} value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)}><option value="">Все категории</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>{!readOnly ? <div className={styles.manual}><input className={styles.field} value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Своя позиция" /><input className={styles.field} value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} type="number" min="0" step="0.01" placeholder="Цена" /><button className={styles.secondary} disabled={!targetSectionId || !manualTitle.trim() || busy} onClick={addManualItem}>Добавить без каталога</button></div> : null}<div className={styles.catalog}>{offers.map((offer) => { const freshness = priceFreshness(offer.priceConfirmedAt); return <article key={offer.id} className={styles.offer}><div className={styles.offerCategory}>{offer.category.name}</div><div className={styles.offerTitle}>{offer.title}</div><div className={styles.offerVendor}>{offer.contractorName}</div><div className={styles.freshness} data-state={freshness}>{freshness === "FRESH" ? "Цена подтверждена" : freshness === "STALE" ? "Цена устарела — перепроверьте" : freshness === "AGING" ? "Скоро потребуется проверка" : "Без даты подтверждения"}</div><div className={styles.offerBottom}><span className={styles.offerPrice}>{money(offer.clientPrice)}</span>{!readOnly ? <button className={styles.secondary} disabled={!targetSectionId || busy} onClick={() => void addOffer(offer.id)}>Добавить</button> : null}</div></article>; })}{!offers.length ? <div className={styles.emptySection}>В каталоге пока нет подходящих предложений.</div> : null}</div></aside></div>
  </div>;
}
